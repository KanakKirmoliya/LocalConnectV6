import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

async function main() {
  console.log("🚀 Starting In-Memory MongoDB Server for automated verification...");
  const mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  console.log(`✅ In-Memory MongoDB running at: ${uri}`);

  process.env.MONGODB_URI = uri;
  process.env.NODE_ENV = "test";
  process.env.CORS_ORIGIN = "http://localhost:5173";
  process.env.JWT_SECRET = "test_super_secret_jwt_key_12345_minimum_32_chars";
  process.env.PORT = "5001";
  process.env.TEST_URL = "http://127.0.0.1:5001";

  // Dynamically import the app and server
  const { server } = await import("./index.js");

  // Allow server a moment to bind and connect
  await new Promise((resolve) => setTimeout(resolve, 1500));

  console.log("🚀 Running API test suite...\n");
  let passed = false;
  try {
    const { runTests } = await import("./test-api.js");
    passed = await runTests();
  } catch (err) {
    console.error("Test execution failed:", err);
  } finally {
    console.log("\n🧹 Cleaning up test server and in-memory database...");
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    await mongoServer.stop();
    console.log("✅ Teardown complete.");
  }

  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
