module.exports = async function (context, req) {
  const payment = req.body;
  // TODO: Validate & persist payment (e.g. insert into Cosmos)
  context.res = {
    headers: { "Content-Type": "application/json" },
    body: {
      message: "Payment received",
      payment,
    },
  };
};
