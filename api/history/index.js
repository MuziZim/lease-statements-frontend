const { CosmosClient } = require('@azure/cosmos');

/**
 * HTTP trigger for retrieving statement history for a tenant.  This endpoint
 * queries Cosmos DB for all statement records belonging to the tenant, sorted
 * chronologically by month.  It then derives opening and closing balances
 * across periods so the front‑end can display a ledger‑style history table.
 */
module.exports = async function (context, req) {
  const tenantId = (req.query && req.query.tenantId) || (req.body && req.body.tenantId);
  if (!tenantId) {
    context.res = {
      status: 400,
      body: { error: 'tenantId query parameter or body field is required' },
    };
    return;
  }
  // Read configuration from environment variables
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
    // Query for all statements for the tenant.  Items should have at least
    // properties: tenantId, month (YYYY-MM), charges (number), payments (number).
    const querySpec = {
      query: 'SELECT c.month, c.charges, c.payments FROM c WHERE c.tenantId = @tenantId ORDER BY c.month ASC',
      parameters: [{ name: '@tenantId', value: tenantId }],
    };
    const { resources: items } = await container.items.query(querySpec).fetchAll();
    // Derive opening and closing balances
    let opening = 0;
    const history = items.map((item) => {
      const month = item.month;
      const charges = item.charges || 0;
      const payments = item.payments || 0;
      const closing = opening + charges - payments;
      const row = {
        month,
        openingBalance: opening,
        charges,
        payments,
        closingBalance: closing,
      };
      opening = closing;
      return row;
    });
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { tenantId, history },
    };
  } catch (err) {
    context.log.error('Failed to retrieve history:', err);
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: err.message },
    };
  }
};