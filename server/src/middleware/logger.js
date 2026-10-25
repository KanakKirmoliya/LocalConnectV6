/**
 * NearNest Production Request & Observability Logger
 * Adheres to DPDP Act 2023: Never logs tokens, passwords, private chat text, or sensitive PII.
 */

const REDACTED_KEYS = new Set([
  "password",
  "passwordHash",
  "confirm",
  "token",
  "jwt",
  "authorization",
  "secret",
  "cookie",
]);

function sanitize(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sanitize);

  const clean = {};
  for (const [key, val] of Object.entries(obj)) {
    if (REDACTED_KEYS.has(key.toLowerCase())) {
      clean[key] = "[REDACTED]";
    } else if (typeof val === "object" && val !== null) {
      clean[key] = sanitize(val);
    } else {
      clean[key] = val;
    }
  }
  return clean;
}

export function requestLogger(req, res, next) {
  const start = Date.now();
  const { method, originalUrl } = req;

  res.on("finish", () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    const isError = statusCode >= 400;

    const logEntry = {
      timestamp: new Date().toISOString(),
      method,
      url: originalUrl,
      status: statusCode,
      durationMs: duration,
      userRole: req.userRole || "guest",
    };

    if (isError && statusCode >= 500) {
      console.error(`⚠️  [API ERROR ${statusCode}] ${method} ${originalUrl} (${duration}ms)`, JSON.stringify(logEntry));
    } else {
      console.log(`🌐 [API ${statusCode}] ${method} ${originalUrl} (${duration}ms)`);
    }
  });

  next();
}

export function sanitizeError(err) {
  return {
    message: err.message,
    status: err.status || 500,
    timestamp: new Date().toISOString(),
  };
}
