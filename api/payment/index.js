const { CosmosClient } = require('@azure/cosmos');
const { v4: uuidv4 } = require('uuid');

/**
 * HTTP trigger for recording a payment.  Validates the request payload and
 * persists the payment to Cosmos DB.  Payments are aggregated per month on
 * the statement record.  A successful response returns the stored payment
 * details.
 */
module.exports = async function (context, req) {
  const body = req.body || {};
  const { tenantId, amount, date, method } = body;
  if (!tenantId || !amount || !date || !method) {
    context.res = {
      status: 400,
      body: { error: 'tenantId, amount, date, and method fields are required' },
    };
    return;
  }
  if (isNaN(amount) || amount <= 0) {
    context.res = {
      status: 400,
      body: { error: 'amount must be a positive number' },
    };
    return;
  }
  // Validate method
  const allowedMethods = ['EFT', 'Cash', 'Snapscan'];
  if (!allowedMethods.includes(method)) {
    context.res = {
      status: 400,
      body: { error: `method must be one of ${allowedMethods.join(', ')}` },
    };
    return;
  }
  // Parse date into month (YYYY-MM)
  const month = date.slice(0, 7);
  // Cosmos DB configuration
  const connStr = process.env.COSMOS_CONNECTION_STRING;
  const databaseName = process.env.COSMOS_DB_NAME;
  const containerName = process.env.COSMOS_CONTAINER_NAME;
  if (!connStr || !databaseName || !containerName) {
    context.res = {
      status: 500,
      body: { error: 'Cosmos DB connection is not configured' },
    };
    return;
  }
  try {
    const client = new CosmosClient(connStr);
    const container = client.database(databaseName).container(containerName);
    // Attempt to read the statement record for the tenant and month
    const itemId = `${tenantId}-${month}`;
    let record;
    try {
      const { resource } = await container.item(itemId, tenantId).read();
      record = resource;
    } catch (readErr) {
      // Not found means we create a new record
      record = null;
    }
    if (record) {
      // Update payments
      record.payments = (record.payments || 0) + amount;
      await container.item(itemId, tenantId).replace(record);
    } else {
      // Create new statement record with charges=0
      record = {
        id: itemId,
        tenantId,
        month,
        charges: 0,
        payments: amount,
      };
      await container.items.create(record);
    }
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        message: 'Payment recorded',
        payment: { tenantId, amount, date, method, month },
      },
    };
  } catch (err) {
    context.log.error('Failed to record payment:', err);
    context.res = {
      status: 500,
      body: { error: err.message },
    };
  }
};