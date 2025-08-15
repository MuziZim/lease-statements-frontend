const { BlobServiceClient } = require("@azure/storage-blob");
const PDFDocument = require("pdfkit");

module.exports = async function (context, req) {
  const { tenantId, month } = req.body;
  // TODO: fetch tenant & transactions from Cosmos, compute balances
  // Generate a simple PDF
  const doc = new PDFDocument();
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  doc.text(`Statement for ${tenantId} - ${month}`);
  doc.end();
  const buffer = Buffer.concat(chunks);
  // Upload to Blob (requires proper connection string & container)
  const connStr = process.env.BLOB_CONNECTION_STRING;
  const containerName = process.env.BLOB_CONTAINER || "statements";
  const client = BlobServiceClient.fromConnectionString(connStr);
  const container = client.getContainerClient(containerName);
  const blob = container.getBlockBlobClient(`${tenantId}-${month}.pdf`);
  await blob.uploadData(buffer);
  context.res = {
    headers: { "Content-Type": "application/json" },
    body: {
      message: "Statement created",
      url: blob.url,
    },
  };
};
