/*
 * HTTP trigger for retrieving statement history for a tenant. In a complete
 * implementation this would query Cosmos DB for all statements for
 * the specified tenant, sorted by month, and return an array showing
 * opening → closing balances across periods.
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
  // Placeholder: return an empty history list
  context.res = {
    status: 200,
    body: {
      message: 'History retrieval not yet implemented',
      tenantId,
      history: [],
    },
  };
};
