import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, ".env") });

import mongoose from "mongoose";
import { connectDB } from "./src/config/db.js";
import { User } from "./src/models/User.js";
import { Listing } from "./src/models/Listing.js";
import { Request } from "./src/models/Request.js";

async function runE2ETest() {
  console.log("==================================================");
  console.log("🧪 Running Real MongoDB Atlas End-to-End Verification");
  console.log("==================================================");

  await connectDB();
  console.log(`Connected to DB: ${mongoose.connection.name}`);

  const timestamp = Date.now();
  const ownerEmail = `bhupesh_owner_${timestamp}@test.com`;
  const buyerEmail = `customer_buyer_${timestamp}@test.com`;

  // Import express app which starts listening on PORT 5000
  const { server } = await import("./index.js");
  await new Promise((r) => setTimeout(r, 1000));
  const baseUrl = "http://127.0.0.1:5000";

  try {
    // 1. User 1 (Owner) Signup
    console.log("\n1️⃣ Registering Owner Account (Bhupesh Singh Samant)...");
    const ownerRes = await fetch(`${baseUrl}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Bhupesh Singh Samant",
        email: ownerEmail,
        password: "securePassword123",
        area: "Sector 15, Near City Center",
      }),
    });
    const ownerData = await ownerRes.json();
    if (!ownerRes.ok) throw new Error(`Owner signup failed: ${JSON.stringify(ownerData)}`);
    console.log(`✅ Owner registered successfully: ID=${ownerData.user.id}, Name=${ownerData.user.name}`);
    const ownerToken = ownerData.token;

    // 2. Owner Posts the exact Room Listing requested by user
    console.log("\n2️⃣ Publishing Room Listing ('2 floor house (4 rooms + 2 bathroom)', ₹50,000/mo)...");
    const listingRes = await fetch(`${baseUrl}/api/rooms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        title: "2 floor house (4 rooms + 2 bathroom)",
        rent: 50000,
        locality: "Sector 15, Near City Center",
        latitude: 28.5355,
        longitude: 77.3910,
        amenities: ["Attached Bath", "WiFi", "Parking"],
        verified: false,
      }),
    });
    const listingData = await listingRes.json();
    if (!listingRes.ok) throw new Error(`Listing creation failed: ${JSON.stringify(listingData)}`);
    console.log(`✅ Listing persisted in MongoDB Atlas: ID=${listingData.id}, Title="${listingData.title}", Rent=₹${listingData.rent}`);

    // Verify document directly in MongoDB Atlas collection
    const atlasDoc = await Listing.findById(listingData.id);
    if (!atlasDoc) throw new Error("Document not found in MongoDB Atlas collection!");
    console.log(`✅ Verified document directly in Atlas DB 'NearNest': Type=${atlasDoc.type}, OwnerName=${atlasDoc.ownerName}`);

    // 3. User 2 (Buyer) Signup
    console.log("\n3️⃣ Registering Buyer Account (Aman Verma)...");
    const buyerRes = await fetch(`${baseUrl}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Aman Verma",
        email: buyerEmail,
        password: "securePassword123",
        area: "Sector 15",
      }),
    });
    const buyerData = await buyerRes.json();
    if (!buyerRes.ok) throw new Error(`Buyer signup failed: ${JSON.stringify(buyerData)}`);
    console.log(`✅ Buyer registered successfully: ID=${buyerData.user.id}, Name=${buyerData.user.name}`);
    const buyerToken = buyerData.token;

    // 4. Buyer Fetches Public Rooms (/api/rooms)
    console.log("\n4️⃣ Buyer querying public rooms list...");
    const publicRoomsRes = await fetch(`${baseUrl}/api/rooms`, {
      headers: { Authorization: `Bearer ${buyerToken}` },
    });
    const publicRooms = await publicRoomsRes.json();
    const foundRoom = publicRooms.find((r) => r.id === listingData.id || r._id === listingData.id);
    if (!foundRoom) throw new Error("Buyer could not see the listing created by Owner!");
    console.log(`✅ Buyer successfully sees Owner's room listing: "${foundRoom.title}", Owner: ${foundRoom.owner}`);

    // 5. Buyer sends an inquiry request
    console.log("\n5️⃣ Buyer sending inquiry request to Owner...");
    const inquiryRes = await fetch(`${baseUrl}/api/requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${buyerToken}`,
      },
      body: JSON.stringify({
        listingId: listingData.id,
        message: "Hi Bhupesh, can I visit this house tomorrow evening?",
      }),
    });
    const inquiryData = await inquiryRes.json();
    if (!inquiryRes.ok) throw new Error(`Inquiry creation failed: ${JSON.stringify(inquiryData)}`);
    console.log(`✅ Inquiry persisted in Atlas: Request ID=${inquiryData.data._id}, Buyer=${inquiryData.data.buyerName}`);

    // 6. Owner checks Inbox
    console.log("\n6️⃣ Owner checking Inbox (/api/requests/inbox)...");
    const inboxRes = await fetch(`${baseUrl}/api/requests/inbox`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const inboxData = await inboxRes.json();
    const foundInquiry = inboxData.data.find((req) => req._id === inquiryData.data._id);
    if (!foundInquiry) throw new Error("Owner could not find inquiry in inbox!");
    console.log(`✅ Owner received inquiry from "${foundInquiry.buyerName}": "${foundInquiry.message}" (Status: ${foundInquiry.status})`);

    // 7. Owner accepts inquiry
    console.log("\n7️⃣ Owner accepting the inquiry...");
    const acceptRes = await fetch(`${baseUrl}/api/requests/${foundInquiry._id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({ status: "accepted" }),
    });
    const acceptData = await acceptRes.json();
    if (!acceptRes.ok || acceptData.data.status !== "accepted") {
      throw new Error(`Inquiry accept failed: ${JSON.stringify(acceptData)}`);
    }
    console.log(`✅ Inquiry status updated to: ${acceptData.data.status}`);

    // 8. Security Check: Buyer tries to DELETE Owner's room
    console.log("\n8️⃣ Security test: Buyer attempts to delete Owner's room (Should be 403)...");
    const unauthDelRes = await fetch(`${baseUrl}/api/rooms/${listingData.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${buyerToken}` },
    });
    if (unauthDelRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden, got ${unauthDelRes.status}`);
    }
    console.log("✅ Security verified: Buyer was forbidden (403) from deleting Owner's room.");

    // 9. Owner deletes their own room
    console.log("\n9️⃣ Owner deleting their own room listing...");
    const authDelRes = await fetch(`${baseUrl}/api/rooms/${listingData.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    if (!authDelRes.ok) {
      throw new Error(`Owner delete failed: ${authDelRes.status}`);
    }
    console.log("✅ Owner successfully deleted their listing.");

    // 10. Verify document is gone from Atlas
    const deletedCheck = await Listing.findById(listingData.id);
    if (deletedCheck) throw new Error("Listing was not deleted from Atlas database!");
    console.log("✅ Verified document no longer exists in MongoDB Atlas collection.");

    // 11. Clean up test users & requests
    await User.deleteMany({ email: { $in: [ownerEmail, buyerEmail] } });
    await Request.deleteMany({ _id: inquiryData.data._id });
    console.log("🧹 Test artifacts cleanly purged from Atlas database.");

    console.log("\n==================================================");
    console.log("🎉 ALL REAL ATLAS E2E TESTS PASSED SUCCESSFULLY!");
    console.log("==================================================");
  } finally {
    await new Promise((r) => server.close(r));
    await mongoose.disconnect();
    console.log("Teardown complete.");
    process.exit(0);
  }
}

runE2ETest().catch((err) => {
  console.error("❌ E2E Test Error:", err);
  process.exit(1);
});
