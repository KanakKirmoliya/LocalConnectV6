export function errorHandler(err, req, res, next) {
  console.error(`💥 [API Exception] ${err.name || "Error"}: ${err.message}`);

  // Mongoose duplicate key error (e.g. unique email)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(409).json({
      success: false,
      error: `An account with this ${field} already exists.`,
    });
  }

  // Mongoose CastError (invalid ObjectId)
  if (err.name === "CastError") {
    return res.status(400).json({
      success: false,
      error: `Invalid resource ID format: ${err.value}`,
    });
  }

  // Mongoose ValidationError
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({
      success: false,
      error: messages.join(", "),
    });
  }

  res.status(err.status || 500).json({
    success: false,
    error: err.message || "Internal server error occurred.",
  });
}
