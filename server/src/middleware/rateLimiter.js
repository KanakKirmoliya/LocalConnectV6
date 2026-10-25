// In-Memory Sliding Window Rate Limiter
// Zero external dependencies, zero overhead, highly efficient for pilot deployment

const ipRequestMap = new Map();

// Periodic garbage collection every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, records] of ipRequestMap.entries()) {
    const valid = records.filter((timestamp) => now - timestamp < 15 * 60 * 1000);
    if (valid.length === 0) {
      ipRequestMap.delete(key);
    } else {
      ipRequestMap.set(key, valid);
    }
  }
}, 5 * 60 * 1000);

export function createRateLimiter({ windowMs = 60 * 1000, max = 60, message = "Too many requests. Please try again later." } = {}) {
  return (req, res, next) => {
    // Determine client IP address
    const clientIp =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      "unknown-ip";

    const key = `${req.baseUrl || req.path}:${clientIp}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    const requestTimestamps = ipRequestMap.get(key) || [];
    const recentRequests = requestTimestamps.filter((ts) => ts > windowStart);

    if (recentRequests.length >= max) {
      const oldestInWindow = recentRequests[0];
      const retryAfterSec = Math.ceil((oldestInWindow + windowMs - now) / 1000);

      res.setHeader("Retry-After", retryAfterSec);
      res.setHeader("X-RateLimit-Limit", max);
      res.setHeader("X-RateLimit-Remaining", 0);

      return res.status(429).json({
        success: false,
        error: message,
        retryAfter: retryAfterSec,
      });
    }

    recentRequests.push(now);
    ipRequestMap.set(key, recentRequests);

    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, max - recentRequests.length));

    next();
  };
}

// Dedicated limiters for sensitive endpoints
export const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts
  message: "Too many authentication attempts from this IP. Please wait 15 minutes before trying again.",
});

export const uploadLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 25, // 25 uploads
  message: "Upload rate limit reached. Please wait a few minutes before uploading more media.",
});
