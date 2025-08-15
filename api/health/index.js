module.exports = async function (context, req) {
  // Simple health check endpoint. Returns HTTP 200 with a health message.
  context.res = {
    status: 200,
    body: { status: 'ok', message: 'API is reachable' },
  };
};
