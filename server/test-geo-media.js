import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, ".env") });

import mongoose from "mongoose";
import { connectDB } from "./src/config/db.js";
import { User } from "./src/models/User.js";
import { Listing } from "./src/models/Listing.js";
import { calculateHaversineDistanceKm } from "./src/utils/geo.js";

async function runGeoMediaTests() {
  console.log("==================================================");
  console.log("🧪 Testing Geospatial Radius & Persistent Media Upload");
  console.log("==================================================");

  // 1. Haversine mathematical precision tests
  console.log("\n1️⃣ Testing Haversine Distance Calculations...");
  // New Delhi CP to Noida Sector 18 is approx 12.5 km
  const cpToNoida = calculateHaversineDistanceKm(28.6315, 77.2167, 28.5708, 77.3261);
  console.log(`- CP to Noida distance calculated: ${cpToNoida} km`);
  if (cpToNoida < 12 || cpToNoida > 13.5) {
    throw new Error(`Haversine calculation out of expected range: got ${cpToNoida}`);
  }
  console.log("✅ Haversine distance formula mathematically accurate.");

  // CP to Meerut is approx 65 km
  const cpToMeerut = calculateHaversineDistanceKm(28.6315, 77.2167, 28.9845, 77.7064);
  console.log(`- CP to Meerut distance calculated: ${cpToMeerut} km`);
  if (cpToMeerut < 60 || cpToMeerut > 70) {
    throw new Error(`Haversine calculation for Meerut out of range: got ${cpToMeerut}`);
  }
  console.log("✅ Large-scale distance calculation verified.");

  // 2. Connect to Atlas
  await connectDB();
  const { default: app } = await import("./index.js");
  const testPort = 5003;
  process.env.PORT = "5003";
  const server = app.listen(testPort);
  await new Promise((r) => setTimeout(r, 1000));
  const baseUrl = `http://127.0.0.1:${testPort}`;

  const timestamp = Date.now();
  const sellerEmail = `geo_seller_${timestamp}@example.com`;
  const buyerEmail = `geo_buyer_${timestamp}@example.com`;
  let sellerToken = "";
  let buyerToken = "";
  let listingIds = [];
  let testUploadedFiles = [];

  try {
    // 3. Register seller & buyer
    console.log("\n2️⃣ Registering Test Accounts...");
    const sRes = await fetch(`${baseUrl}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Geo Seller",
        email: sellerEmail,
        password: "securePassword123",
        area: "Connaught Place, Delhi",
      }),
    });
    const sData = await sRes.json();
    sellerToken = sData.token;

    const bRes = await fetch(`${baseUrl}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Geo Buyer",
        email: buyerEmail,
        password: "securePassword123",
        area: "Connaught Place, Delhi",
      }),
    });
    const bData = await bRes.json();
    buyerToken = bData.token;
    console.log("✅ Accounts registered successfully.");

    // 4. Test Media Upload endpoint
    console.log("\n3️⃣ Testing Media Upload API (/api/upload/media)...");

    // Create temporary dummy image file
    const dummyImgPath = path.join(__dirname, "test-temp-img.jpg");
    fs.writeFileSync(dummyImgPath, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])); // JPEG header

    const dummyVidPath = path.join(__dirname, "test-temp-vid.mp4");
    fs.writeFileSync(dummyVidPath, Buffer.from("fake-mp4-test-content-video-data"));

    // Upload via FormData
    const formData = new FormData();
    const imgBlob = new Blob([fs.readFileSync(dummyImgPath)], { type: "image/jpeg" });
    const vidBlob = new Blob([fs.readFileSync(dummyVidPath)], { type: "video/mp4" });
    formData.append("files", imgBlob, "room-master-bedroom.jpg");
    formData.append("files", vidBlob, "room-walkthrough-tour.mp4");

    const uploadRes = await fetch(`${baseUrl}/api/upload/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sellerToken}` },
      body: formData,
    });
    const uploadData = await uploadRes.json();

    if (!uploadRes.ok || !uploadData.files || uploadData.files.length !== 2) {
      throw new Error(`Media upload failed: ${JSON.stringify(uploadData)}`);
    }

    testUploadedFiles = uploadData.files;
    console.log(`✅ Uploaded 2 files: Photo URL='${testUploadedFiles[0].url}', Video URL='${testUploadedFiles[1].url}'`);

    // Verify files actually exist on disk in server/uploads/listings
    for (const f of testUploadedFiles) {
      const diskPath = path.join(__dirname, "uploads/listings", path.basename(f.url));
      if (!fs.existsSync(diskPath)) {
        throw new Error(`Uploaded file missing from disk at: ${diskPath}`);
      }
    }
    console.log("✅ Verified media files physically exist in server/uploads/listings/.");

    // Clean up temporary local scratch files
    if (fs.existsSync(dummyImgPath)) fs.unlinkSync(dummyImgPath);
    if (fs.existsSync(dummyVidPath)) fs.unlinkSync(dummyVidPath);

    // 5. Test Media Rejection for invalid file type
    console.log("\n4️⃣ Testing Rejection of Invalid MIME type (e.g. executable/text)...");
    const badForm = new FormData();
    const badBlob = new Blob(["dangerous script"], { type: "application/x-msdownload" });
    badForm.append("files", badBlob, "bad-file.exe");
    const badRes = await fetch(`${baseUrl}/api/upload/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sellerToken}` },
      body: badForm,
    });
    if (badRes.status !== 400) {
      throw new Error(`Expected 400 Bad Request for invalid MIME, got ${badRes.status}`);
    }
    console.log("✅ Correctly rejected invalid file MIME type.");

    // 6. Create Listings at different distances from CP (28.6315, 77.2167)
    console.log("\n5️⃣ Creating Listings at different geographical coordinates...");

    // Listing 1: Connaught Place (0.2 km from center)
    const l1Res = await fetch(`${baseUrl}/api/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sellerToken}` },
      body: JSON.stringify({
        title: "CP 1BHK Studio",
        rent: 22000,
        locality: "Connaught Place, Inner Circle",
        latitude: 28.6330,
        longitude: 77.2180,
        photos: [testUploadedFiles[0]],
        videos: [testUploadedFiles[1]],
      }),
    });
    const l1 = await l1Res.json();
    listingIds.push(l1.id);
    console.log(`- Created L1 (CP Studio) at (28.6330, 77.2180): ID=${l1.id}`);

    // Listing 2: Noida Sector 18 (~12.5 km away)
    const l2Res = await fetch(`${baseUrl}/api/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sellerToken}` },
      body: JSON.stringify({
        title: "Noida Sector 18 Modern Flat",
        rent: 30000,
        locality: "Sector 18, Noida",
        latitude: 28.5708,
        longitude: 77.3261,
      }),
    });
    const l2 = await l2Res.json();
    listingIds.push(l2.id);
    console.log(`- Created L2 (Noida Flat) at (28.5708, 77.3261): ID=${l2.id}`);

    // Listing 3: Meerut City (~65 km away)
    const l3Res = await fetch(`${baseUrl}/api/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sellerToken}` },
      body: JSON.stringify({
        title: "Meerut Highway Villa",
        rent: 18000,
        locality: "Meerut Cantt",
        latitude: 28.9845,
        longitude: 77.7064,
      }),
    });
    const l3 = await l3Res.json();
    listingIds.push(l3.id);
    console.log(`- Created L3 (Meerut Villa) at (28.9845, 77.7064): ID=${l3.id}`);

    // 7. Geospatial Radius Filtering Verification
    console.log("\n6️⃣ Verifying Radius Filtering from Connaught Place...");

    // Test A: Radius = 5 km (Only CP Studio should match)
    const r5Res = await fetch(`${baseUrl}/api/rooms?lat=28.6315&lng=77.2167&radius=5`, {
      headers: { Authorization: `Bearer ${buyerToken}` },
    });
    const r5Data = await r5Res.json();
    const hasL1_in_5 = r5Data.some((r) => r.id === l1.id);
    const hasL2_in_5 = r5Data.some((r) => r.id === l2.id);
    const hasL3_in_5 = r5Data.some((r) => r.id === l3.id);

    if (!hasL1_in_5 || hasL2_in_5 || hasL3_in_5) {
      throw new Error(`Radius 5km filter failed: expected only L1, got L1=${hasL1_in_5}, L2=${hasL2_in_5}, L3=${hasL3_in_5}`);
    }
    console.log("✅ Radius 5 km: Returned CP Studio (<5km), correctly excluded Noida (12.5km) & Meerut (65km).");

    // Test B: Radius = 20 km (CP Studio and Noida should match, Meerut excluded)
    const r20Res = await fetch(`${baseUrl}/api/rooms?lat=28.6315&lng=77.2167&radius=20`, {
      headers: { Authorization: `Bearer ${buyerToken}` },
    });
    const r20Data = await r20Res.json();
    const hasL1_in_20 = r20Data.some((r) => r.id === l1.id);
    const hasL2_in_20 = r20Data.some((r) => r.id === l2.id);
    const hasL3_in_20 = r20Data.some((r) => r.id === l3.id);

    if (!hasL1_in_20 || !hasL2_in_20 || hasL3_in_20) {
      throw new Error(`Radius 20km filter failed: expected L1 & L2, got L1=${hasL1_in_20}, L2=${hasL2_in_20}, L3=${hasL3_in_20}`);
    }
    console.log("✅ Radius 20 km: Returned CP Studio & Noida Flat, correctly excluded Meerut (65km).");

    // Test C: Radius = 100 km (All 3 listings should match)
    const r100Res = await fetch(`${baseUrl}/api/rooms?lat=28.6315&lng=77.2167&radius=100`, {
      headers: { Authorization: `Bearer ${buyerToken}` },
    });
    const r100Data = await r100Res.json();
    const hasL1_in_100 = r100Data.some((r) => r.id === l1.id);
    const hasL2_in_100 = r100Data.some((r) => r.id === l2.id);
    const hasL3_in_100 = r100Data.some((r) => r.id === l3.id);

    if (!hasL1_in_100 || !hasL2_in_100 || !hasL3_in_100) {
      throw new Error(`Radius 100km filter failed: expected all 3 listings.`);
    }
    console.log("✅ Radius 100 km: Returned all 3 listings across regions.");

    // 8. Test Automatic Media File Cleanup on Listing Deletion
    console.log("\n7️⃣ Testing Automatic Media File Cleanup on Listing Delete...");
    const delRes = await fetch(`${baseUrl}/api/rooms/${l1.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${sellerToken}` },
    });
    if (!delRes.ok) throw new Error("Failed to delete L1");

    // Check disk for uploaded files
    for (const f of testUploadedFiles) {
      const diskPath = path.join(__dirname, "uploads/listings", path.basename(f.url));
      if (fs.existsSync(diskPath)) {
        throw new Error(`File was NOT cleaned up from disk: ${diskPath}`);
      }
    }
    console.log("✅ Verified all attached media files automatically deleted from disk upon listing removal.");

    // 9. Cleanup other test listings and test users
    console.log("\n8️⃣ Cleaning up test records from database...");
    await Listing.deleteMany({ _id: { $in: listingIds } });
    await User.deleteMany({ email: { $in: [sellerEmail, buyerEmail] } });
    console.log("🧹 Test artifacts cleanly purged from Atlas database.");

    console.log("\n==================================================");
    console.log("🎉 ALL GEOSPATIAL & MEDIA VERIFICATION TESTS PASSED!");
    console.log("==================================================");
  } finally {
    await new Promise((r) => server.close(r));
    await mongoose.disconnect();
    process.exit(0);
  }
}

runGeoMediaTests().catch((err) => {
  console.error("❌ Test Failed:", err);
  process.exit(1);
});
