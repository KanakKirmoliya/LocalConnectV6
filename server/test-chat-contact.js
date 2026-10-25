import http from "node:http";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, ".env") });

import { connectDB } from "./src/config/db.js";
import { User } from "./src/models/User.js";
import { Listing } from "./src/models/Listing.js";
import { Request } from "./src/models/Request.js";

async function makeRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, data: json });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
  });
}

async function run() {
  console.log("==================================================");
  console.log("🧪 Testing Seller Contact Reveal & In-App Chat Flow");
  console.log("==================================================");

  process.env.PORT = "5005";
  await connectDB();
  const { default: app, server } = await import("./index.js");
  const testPort = 5005;
  await new Promise((r) => setTimeout(r, 800));

  const timestamp = Date.now();
  const sellerEmail = `seller_${timestamp}@example.com`;
  const sellerPhone = "+919876543210";
  const buyerEmail = `buyer_${timestamp}@example.com`;
  const buyerPhone = "+919123456789";
  const intruderEmail = `intruder_${timestamp}@example.com`;

  // 1. Register Seller
  console.log("\n1️⃣ Registering Seller with Mobile & Gmail...");
  const sellerRes = await makeRequest(
    {
      hostname: "localhost",
      port: testPort,
      path: "/api/auth/signup",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    {
      name: "Bhupesh Singh Samant",
      email: sellerEmail,
      phone: sellerPhone,
      password: "password123",
      area: "Bhimtal",
    }
  );

  if (sellerRes.status !== 201) {
    throw new Error(`Seller registration failed: ${JSON.stringify(sellerRes.data)}`);
  }
  const sellerToken = sellerRes.data.token;
  const sellerId = sellerRes.data.user.id;
  console.log(`✅ Seller registered: ID=${sellerId}, Phone=${sellerRes.data.user.phone}`);

  // 2. Register Buyer
  console.log("\n2️⃣ Registering Buyer with Mobile & Gmail...");
  const buyerRes = await makeRequest(
    {
      hostname: "localhost",
      port: testPort,
      path: "/api/auth/signup",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    {
      name: "Chandra Singh",
      email: buyerEmail,
      phone: buyerPhone,
      password: "password123",
      area: "Bhimtal",
    }
  );
  const buyerToken = buyerRes.data.token;
  const buyerId = buyerRes.data.user.id;
  console.log(`✅ Buyer registered: ID=${buyerId}`);

  // 3. Register Intruder
  const intruderRes = await makeRequest(
    {
      hostname: "localhost",
      port: testPort,
      path: "/api/auth/signup",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    {
      name: "Intruder User",
      email: intruderEmail,
      phone: "+919999999999",
      password: "password123",
      area: "Delhi",
    }
  );
  const intruderToken = intruderRes.data.token;

  // 4. Seller creates room
  console.log("\n3️⃣ Seller creating room listing...");
  const roomRes = await makeRequest(
    {
      hostname: "localhost",
      port: testPort,
      path: "/api/rooms",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sellerToken}`,
      },
    },
    {
      title: "double room lake view",
      rent: 10000,
      locality: "Bhimtal",
      latitude: 29.345,
      longitude: 79.548,
    }
  );
  const listingId = roomRes.data._id || roomRes.data.id;
  console.log(`✅ Room created: ID=${listingId}`);

  // 5. Buyer sends inquiry
  console.log("\n4️⃣ Buyer sending inquiry to seller...");
  const reqRes = await makeRequest(
    {
      hostname: "localhost",
      port: testPort,
      path: "/api/requests",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${buyerToken}`,
      },
    },
    {
      listingId,
      message: "Hi Bhupesh, is this double room lake view still available?",
    }
  );
  const requestId = reqRes.data.data._id;
  console.log(`✅ Inquiry submitted: ID=${requestId}, Status=${reqRes.data.data.status}`);

  // 6. Seller accepts inquiry
  console.log("\n5️⃣ Seller accepting inquiry...");
  const acceptRes = await makeRequest(
    {
      hostname: "localhost",
      port: testPort,
      path: `/api/requests/${requestId}`,
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sellerToken}`,
      },
    },
    { status: "accepted" }
  );
  console.log(`✅ Seller accepted inquiry: Status=${acceptRes.data.data.status}`);

  // 7. Buyer checks sent inquiries & verifies contact unlock
  console.log("\n6️⃣ Buyer checking sent inquiries to verify Seller Gmail & Phone reveal...");
  const sentRes = await makeRequest({
    hostname: "localhost",
    port: testPort,
    path: "/api/requests/sent",
    method: "GET",
    headers: { Authorization: `Bearer ${buyerToken}` },
  });

  const matchingReq = sentRes.data.data.find((r) => r._id === requestId);
  if (!matchingReq || matchingReq.status !== "accepted") {
    throw new Error("Expected request to be accepted in buyer list.");
  }
  if (matchingReq.sellerEmail !== sellerEmail) {
    throw new Error(`Expected seller email '${sellerEmail}', got '${matchingReq.sellerEmail}'`);
  }
  if (matchingReq.sellerPhone !== sellerPhone) {
    throw new Error(`Expected seller phone '${sellerPhone}', got '${matchingReq.sellerPhone}'`);
  }
  console.log(`✅ Contact verified! Seller Gmail=${matchingReq.sellerEmail}, Mobile=${matchingReq.sellerPhone}`);

  // 8. Buyer sends a chat message
  console.log("\n7️⃣ Buyer sending in-app chat message...");
  const msg1Res = await makeRequest(
    {
      hostname: "localhost",
      port: testPort,
      path: `/api/requests/${requestId}/messages`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${buyerToken}`,
      },
    },
    { text: "Can I visit today at 4 PM to check the room?" }
  );
  console.log(`✅ Buyer message sent. Total messages: ${msg1Res.data.data.length}`);

  // 9. Seller sends a reply
  console.log("\n8️⃣ Seller sending reply in chat...");
  const msg2Res = await makeRequest(
    {
      hostname: "localhost",
      port: testPort,
      path: `/api/requests/${requestId}/messages`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sellerToken}`,
      },
    },
    { text: "Yes sure Chandra, I will be at the property at 4 PM." }
  );
  console.log(`✅ Seller reply sent. Total messages: ${msg2Res.data.data.length}`);

  // 10. Fetch full conversation
  console.log("\n9️⃣ Fetching full chat conversation history...");
  const chatHistory = await makeRequest({
    hostname: "localhost",
    port: testPort,
    path: `/api/requests/${requestId}/messages`,
    method: "GET",
    headers: { Authorization: `Bearer ${buyerToken}` },
  });

  console.log(`✅ Retrieved ${chatHistory.data.data.length} messages in conversation:`);
  chatHistory.data.data.forEach((m, idx) => {
    console.log(`   [${idx + 1}] ${m.senderName}: "${m.text}"`);
  });

  // 11. Security test: Intruder attempts to read messages (Should be 403 Forbidden)
  console.log("\n🔟 Security check: Intruder attempts to access this private chat...");
  const intruderGet = await makeRequest({
    hostname: "localhost",
    port: testPort,
    path: `/api/requests/${requestId}/messages`,
    method: "GET",
    headers: { Authorization: `Bearer ${intruderToken}` },
  });
  if (intruderGet.status !== 403) {
    throw new Error(`Expected 403 Forbidden, got ${intruderGet.status}`);
  }
  console.log("✅ Security verified: Intruder was correctly blocked with 403 Forbidden!");

  // Cleanup test documents
  console.log("\n🧹 Cleaning up test records from database...");
  await Request.deleteMany({ _id: requestId });
  await Listing.deleteMany({ _id: listingId });
  await User.deleteMany({ _id: { $in: [sellerId, buyerId, intruderRes.data.user.id] } });
  console.log("✅ Cleaned up test data.");

  console.log("\n==================================================");
  console.log("🎉 ALL SELLER CONTACT & CHAT TESTS PASSED!");
  console.log("==================================================");
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Test Failed:", err);
  process.exit(1);
});
