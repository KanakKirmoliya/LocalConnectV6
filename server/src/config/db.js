import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Reliably resolve server/.env regardless of process.cwd()
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../../.env");

dotenv.config({ path: envPath });

const TARGET_DB_NAME = "NearNest";

/**
 * Sanitizes a MongoDB connection string for safe logging by masking credentials.
 */
export function sanitizeMongoUri(uri) {
  if (!uri) return "";
  return uri.replace(/:([^:@]+)@/, ":****@");
}

/**
 * Checks whether the configured URI is a placeholder or unconfigured.
 */
export function isPlaceholderUri(uri) {
  if (!uri) return true;
  return (
    uri.includes("PASTE_YOUR_MONGODB_ATLAS_CONNECTION_STRING_HERE") ||
    uri.includes("<username>") ||
    uri.includes("<password>")
  );
}

export async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri || isPlaceholderUri(uri)) {
    console.warn(
      "⚠️  MONGODB_URI is not configured in server/.env (placeholder detected). Database operations will fail until real connection string is added."
    );
    return null;
  }

  try {
    const conn = await mongoose.connect(uri, {
      dbName: TARGET_DB_NAME,
      serverSelectionTimeoutMS: 8000,
    });

    console.log(
      `✅ MongoDB Atlas connected successfully to cluster: ${conn.connection.host} | Target Database: ${conn.connection.name}`
    );
    return conn;
  } catch (error) {
    const safeError = sanitizeMongoUri(error.message);
    console.error(`❌ MongoDB connection error: ${safeError}`);
    throw error;
  }
}

export async function disconnectDB() {
  try {
    await mongoose.disconnect();
    console.log("MongoDB disconnected cleanly.");
  } catch (err) {
    console.error("Error disconnecting MongoDB:", sanitizeMongoUri(err.message));
  }
}
