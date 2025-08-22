const { BlobServiceClient } = require('@azure/storage-blob');
const { CosmosClient } = require('@azure/cosmos');
const PDFDocument = require('pdfkit');

/**
 * HTTP trigger that generates a monthly statement PDF for a tenant.  It pulls
 * statement data from Cosmos DB, calculates opening and closing balances and
 * composes a simple invoice using pdfkit.  The PDF is uploaded to Azure Blob
 * Storage and the URL is returned to the caller.
 */
module.exports = async function (context, req) {
  const { tenantId, month } = req.body || {};
  if (!tenantId || !month) {
    context.res = {
      status: 400,
      body: { error: 'tenantId and month are required' },
    };
    return;
  }
  // Read environment configuration
  const cosmosConnStr = process.env.COSMOS_CONNECTION_STRING;
  const cosmosDbName = process.env.COSMOS_DB_NAME;
  const cosmosContainer = process.env.COSMOS_CONTAINER_NAME;
  const blobConnStr = process.env.BLOB_CONNECTION_STRING;
  const blobContainer = process.env.BLOB_CONTAINER || 'statements';
  if (!cosmosConnStr || !cosmosDbName || !cosmosContainer) {
    context.res = {
      status: 500,
      body: { error: 'Cosmos DB connection is not configured' },
    };
    return;
  }
  if (!blobConnStr) {
    context.res = {
      status: 500,
      body: { error: 'Blob storage connection is not configured' },
    };
    return;
  }
  try {
    // Connect to Cosmos DB and retrieve all statements up to and including this month
    const cosmosClient = new CosmosClient(cosmosConnStr);
    const container = cosmosClient.database(cosmosDbName).container(cosmosContainer);
    const statementId = `${tenantId}-${month}`;
    // Fetch the current statement
    let record;
    try {
      const { resource } = await container.item(statementId, tenantId).read();
      record = resource;
    } catch (err) {
      record = null;
    }
    const charges = record ? record.charges || 0 : 0;
    const payments = record ? record.payments || 0 : 0;
    // Compute opening balance by summing all previous months
    const querySpec = {
      query: 'SELECT c.month, c.charges, c.payments FROM c WHERE c.tenantId = @tenantId AND c.month < @month ORDER BY c.month ASC',
      parameters: [
        { name: '@tenantId', value: tenantId },
        { name: '@month', value: month },
      ],
    };
    const { resources: previous } = await container.items.query(querySpec).fetchAll();
    let opening = 0;
    previous.forEach((itm) => {
      opening += (itm.charges || 0) - (itm.payments || 0);
    });
    const closing = opening + charges - payments;
    // Create PDF
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.fontSize(20).text(`Statement for ${tenantId}`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Month: ${month}`);
    doc.moveDown();
    doc.fontSize(12).text(`Opening Balance: ${opening.toFixed(2)}`);
    doc.text(`Total Charges: ${charges.toFixed(2)}`);
    doc.text(`Payments: ${payments.toFixed(2)}`);
    doc.text(`Closing Balance: ${closing.toFixed(2)}`);
    doc.moveDown();
    doc.text('Thank you for your tenancy.', { align: 'center' });
    doc.end();
    const buffer = Buffer.concat(chunks);
    // Upload to Blob Storage
    const blobServiceClient = BlobServiceClient.fromConnectionString(blobConnStr);
    const containerClient = blobServiceClient.getContainerClient(blobContainer);
    await containerClient.createIfNotExists();
    const blobName = `${tenantId}-${month}.pdf`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    await blockBlobClient.uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: 'application/pdf' },
    });
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        message: 'Statement created',
        url: blockBlobClient.url,
        closingBalance: closing,
      },
    };
  } catch (err) {
    context.log.error('Failed to generate statement:', err);
    context.res = {
      status: 500,
      body: { error: err.message },
    };
  }
};