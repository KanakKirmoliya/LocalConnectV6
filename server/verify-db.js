import dotenv from "dotenv";
import mongoose from "mongoose";
import { isPlaceholderUri, sanitizeMongoUri } from "./src/config/db.js";

dotenv.config();

async function verifyAtlasConnection() {
  console.log("==================================================");
  console.log("🔍 MongoDB Atlas Connection Verification (NearNest)");
  console.log("==================================================");

  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.log("❌ MONGODB_URI is not set in server/.env.");
    console.log("👉 Action required: Open server/.env and add MONGODB_URI=<your_atlas_connection_string>");
    process.exit(1);
  }

  if (isPlaceholderUri(uri)) {
    console.log("⚠️  Placeholder detected in server/.env:");
    console.log("   The MONGODB_URI still contains placeholder text ('PASTE_YOUR_MONGODB_ATLAS_CONNECTION_STRING_HERE' or '<username>').");
    console.log("👉 Action required: Open server/.env and replace the placeholder with your actual MongoDB Atlas connection string for cluster 'BhupeshSinghSamant'.");
    process.exit(2);
  }

  console.log("⏳ Attempting to connect to MongoDB Atlas...");

  try {
    const conn = await mongoose.connect(uri, {
      dbName: "NearNest",
      serverSelectionTimeoutMS: 6000,
    });

    const host = conn.connection.host;
    const dbName = conn.connection.name;

    console.log("\n✅ [SUCCESS] Successfully connected to MongoDB Atlas!");
    console.log(`   - Connected Cluster Host: ${host}`);
    console.log(`   - Active Database Name:   ${dbName}`);

    if (dbName === "NearNest") {
      console.log("   - Database Target Check:  PASS (Targeting 'NearNest' explicitly)");
    } else {
      console.log(`   - ⚠️ Database Warning: Connected to '${dbName}' instead of 'NearNest'.`);
    }

    // Ping check
    await conn.connection.db.admin().ping();
    console.log("   - Database Ping:          PASS (Atlas responded to ping)");

    // Inspect existing collections safely without modifying or printing document data
    const collections = await conn.connection.db.listCollections().toArray();
    const collectionNames = collections.map((c) => c.name);
    console.log(`   - Existing Collections in '${dbName}': [${collectionNames.join(", ") || "None yet (database is fresh)"}]`);

    console.log("\n==================================================");
    console.log("🎉 MongoDB Atlas verification completed successfully.");
    console.log("==================================================");

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.log("\n❌ [FAILED] Could not connect to MongoDB Atlas.");

    const errMsg = error.message || "";
    const safeMsg = sanitizeMongoUri(errMsg);

    console.log(`   Error Details: ${safeMsg}`);

    // Diagnose likely root cause
    if (errMsg.includes("bad auth") || errMsg.includes("Authentication failed") || errMsg.includes("auth failed")) {
      console.log("\n🔍 Diagnosis: Authentication Failed.");
      console.log("   - Verify that your MongoDB Atlas database user exists in Atlas -> Security -> Database Access.");
      console.log("   - Verify that the password is correct.");
      console.log("   - If your password has special characters (e.g., @, :, /, ?, #, %), ensure they are URL-encoded (e.g. '@' -> '%40').");
    } else if (errMsg.includes("buffering timed out") || errMsg.includes("timed out") || errMsg.includes("ENOTFOUND") || errMsg.includes("Server selection timed out")) {
      console.log("\n🔍 Diagnosis: Network Connection / IP Whitelist Timeout.");
      console.log("   - In MongoDB Atlas, go to: Security -> Network Access.");
      console.log("   - Ensure your current IP address is added to the IP Access List (or allow access from anywhere '0.0.0.0/0' for development).");
      console.log("   - Check if you are behind a corporate or college firewall that blocks port 27017.");
    } else {
      console.log("\n🔍 Diagnosis: Configuration / URI formatting issue.");
      console.log("   - Please check that the URI starts with 'mongodb+srv://' and points to your cluster.");
    }

    console.log("\n==================================================");
    process.exit(1);
  }
}

verifyAtlasConnection();
