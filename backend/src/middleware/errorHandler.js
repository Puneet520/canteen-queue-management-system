// Centralized error handler — keeps controllers free of try/catch boilerplate
// when combined with the asyncHandler wrapper below.

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(err);

  if (err.code === "P2002") {
    // Prisma unique constraint violation
    return res.status(409).json({ error: "A record with that value already exists" });
  }

  const status = err.status || 500;
  res.status(status).json({ error: err.message || "Something went wrong" });
}

module.exports = { asyncHandler, errorHandler };
