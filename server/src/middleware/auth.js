import jwt from "jsonwebtoken";
import { User } from "../models/User.js";

const isProduction = process.env.NODE_ENV === "production";
if (isProduction && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  throw new Error("🛑 FATAL SECURITY CONFIGURATION: Strong JWT_SECRET (min 32 chars) is required in production!");
}

const JWT_SECRET = process.env.JWT_SECRET || "fallback_dev_secret_localconnect_2026";
if (!isProduction && !process.env.JWT_SECRET) {
  console.warn("⚠️  [Security Warning] Running with development fallback JWT secret. Set JWT_SECRET in .env for production.");
}

export function signToken(payload, expiresIn = "7d") {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      error: "Authentication required. Please provide a valid Bearer token.",
    });
  }

  const token = authHeader.split(" ")[1];
  const decoded = verifyToken(token);

  if (!decoded || !decoded.id) {
    return res.status(401).json({
      success: false,
      error: "Invalid or expired token. Please log in again.",
    });
  }

  try {
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: "User associated with this token no longer exists.",
      });
    }

    const suspension = typeof user.isSuspended === "function" ? user.isSuspended() : { suspended: user.isBanned, reason: user.banReason };
    if (suspension.suspended) {
      const msg = suspension.type === "temporary" && suspension.until
        ? `Your account is temporarily suspended until ${new Date(suspension.until).toLocaleString()} due to community fraud/misuse reports.${suspension.reason ? ` Reason: ${suspension.reason}` : ""}`
        : `Your account has been suspended by administration.${suspension.reason ? ` Reason: ${suspension.reason}` : " Please contact platform support."}`;

      return res.status(403).json({
        success: false,
        error: msg,
        suspension: {
          type: suspension.type || "permanent",
          until: suspension.until || null,
          reason: suspension.reason || user.banReason || "",
        },
      });
    }

    // Accounts created before User IDs existed receive theirs the first time they are seen.
    if (!user.userCode && typeof user.ensureUserCode === "function") {
      try {
        await user.ensureUserCode();
      } catch (idError) {
        console.warn("Could not assign User ID:", idError.message);
      }
    }

    req.user = user;
    req.userId = user._id.toString();
    req.userName = user.name;
    req.userRole = user.role;
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Authentication check failed.",
    });
  }
}

/**
 * For public routes: true only when the request carries a valid token that belongs to an administrator.
 * Never throws and never rejects the request (used to decide whether admin-only fields are included).
 */
export async function isAdminRequest(req) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) return false;
    const decoded = verifyToken(header.split(" ")[1]);
    if (!decoded || !decoded.id) return false;
    const user = await User.findById(decoded.id).select("role isBanned");
    return Boolean(user && user.role === "admin");
  } catch {
    return false;
  }
}

/**
 * For public routes: returns { id, isAdmin } for a valid token, otherwise null. Never throws or rejects.
 */
export async function getOptionalViewer(req) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) return null;
    const decoded = verifyToken(header.split(" ")[1]);
    if (!decoded || !decoded.id) return null;
    const user = await User.findById(decoded.id).select("role");
    return user ? { id: user._id.toString(), isAdmin: user.role === "admin" } : null;
  } catch {
    return null;
  }
}

export function requireAdmin(req, res, next) {
  if (req.userRole !== "admin") {
    return res.status(403).json({
      success: false,
      error: "Access denied. Administrator privileges required.",
    });
  }
  next();
}
