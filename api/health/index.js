module.exports = async function (context, req) {
  // Simple health check endpoint to verify that the API is reachable.
  context.res = {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { status: 'ok', message: 'API is reachable' },
  };
};