import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

async function runReviewAndReportTests() {
  console.log("🧪 Starting Automated Verification for Ratings, Reviews & Report Suspension...");
  const mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  process.env.MONGODB_URI = uri;
  process.env.JWT_SECRET = "test_super_secret_jwt_key_12345";
  process.env.PORT = "5002";
  process.env.TEST_URL = "http://127.0.0.1:5002";

  const { server } = await import("./index.js");
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const { User } = await import("./src/models/User.js");
  const { Listing } = await import("./src/models/Listing.js");
  const { Review } = await import("./src/models/Review.js");
  const { Report } = await import("./src/models/Report.js");
  const { signToken } = await import("./src/middleware/auth.js");

  let testCount = 0;
  let passCount = 0;

  function assert(condition, testName) {
    testCount++;
    if (condition) {
      passCount++;
      console.log(`✅ [PASS] ${testName}`);
    } else {
      console.error(`❌ [FAIL] ${testName}`);
    }
  }

  try {
    // 1. Create Test Users: Owner + 5 distinct Community Users + 1 Admin
    const passHash = await bcrypt.hash("Password123", 10);
    const owner = await User.create({
      name: "Listing Owner",
      email: "owner@nearnest.local",
      passwordHash: passHash,
      area: "Bhimtal",
      role: "user",
    });
    const ownerToken = signToken({ id: owner._id.toString(), role: "user" });

    const communityUsers = [];
    const communityTokens = [];
    for (let i = 1; i <= 5; i++) {
      const u = await User.create({
        name: `Neighbor ${i}`,
        email: `neighbor${i}@nearnest.local`,
        passwordHash: passHash,
        area: "Bhimtal",
        role: "user",
      });
      communityUsers.push(u);
      communityTokens.push(signToken({ id: u._id.toString(), role: "user" }));
    }

    const admin = await User.create({
      name: "Admin Guardian",
      email: "admin@nearnest.local",
      passwordHash: passHash,
      area: "Bhimtal",
      role: "admin",
    });
    const adminToken = signToken({ id: admin._id.toString(), role: "admin" });

    // 2. Create Listings: Room, Vehicle, Service
    const room = await Listing.create({
      ownerId: owner._id,
      ownerName: owner.name,
      type: "room",
      title: "Cozy Lakeview Room",
      locality: "Bhimtal Lake",
      roomDetails: { rent: 6000, roomType: "1RK" },
      status: "active",
    });

    const vehicle = await Listing.create({
      ownerId: owner._id,
      ownerName: owner.name,
      type: "vehicle",
      title: "Honda Activa 6G",
      locality: "Bhimtal Market",
      vehicleDetails: { vehicleType: "Scooty", rentalPrice: 120 },
      status: "active",
    });

    const service = await Listing.create({
      ownerId: owner._id,
      ownerName: owner.name,
      type: "service",
      title: "Quick Electrician Works",
      locality: "Bhimtal",
      serviceDetails: { serviceCategory: "Electrician", pricingInfo: "Rs 150 visit", rating: 5.0, jobsCount: 0 },
      status: "active",
    });

    const shopPhoto = "/uploads/listings/00000000-0000-4000-8000-000000000001.jpg";
    const createServiceRes = await fetch("http://127.0.0.1:5002/api/services", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({
        name: "Neighborhood Plumbing",
        trade: "Plumber",
        price: "Rs 250 visit",
        locality: "Bhimtal",
        shopPhoto,
      }),
    });
    const createdService = await createServiceRes.json();
    assert(createServiceRes.status === 201 && createdService.shopPhoto === shopPhoto, "Service listing accepts and returns provider-submitted shop photo");

    const serviceListRes = await fetch("http://127.0.0.1:5002/api/services");
    const serviceList = await serviceListRes.json();
    assert(serviceList.some((item) => item.id === createdService.id && item.shopPhoto === shopPhoto), "Service listings include shop photos for customers");

    const invalidPhotoRes = await fetch("http://127.0.0.1:5002/api/services", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({
        name: "Invalid Photo Service",
        trade: "Plumber",
        price: "Rs 250 visit",
        locality: "Bhimtal",
        shopPhoto: "https://example.com/shop.jpg",
      }),
    });
    assert(invalidPhotoRes.status === 400, "Service shop photo must use an app-uploaded image");

    // ==========================================
    // REVIEWS & RATINGS TESTS
    // ==========================================
    console.log("\n--- Testing Reviews & Ratings ---");

    // Test A: Owner cannot review their own listing
    const resSelfReview = await fetch("http://127.0.0.1:5002/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ listingId: room._id.toString(), rating: 5, comment: "I love my own room!" }),
    });
    assert(resSelfReview.status === 400, "Anti-Fraud: Prevent owner from reviewing their own listing");

    // Test B: Neighbor 1 submits 5-star review on Room
    const resReview1 = await fetch("http://127.0.0.1:5002/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${communityTokens[0]}` },
      body: JSON.stringify({ listingId: room._id.toString(), rating: 5, comment: "Spacious, quiet, and friendly owner!" }),
    });
    const reviewData1 = await resReview1.json();
    assert(resReview1.status === 201 && reviewData1.success, "Neighbor 1 posts 5-star review on Room");

    // Check listing was updated with averageRating = 5 and reviewsCount = 1
    const updatedRoom1 = await Listing.findById(room._id);
    assert(updatedRoom1.averageRating === 5 && updatedRoom1.reviewsCount === 1, "Room Listing averageRating synced to 5.0 (1 review)");

    // Test C: Neighbor 2 submits 4-star review on Room
    const resReview2 = await fetch("http://127.0.0.1:5002/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${communityTokens[1]}` },
      body: JSON.stringify({ listingId: room._id.toString(), rating: 4, comment: "Nice view, parking a bit tight." }),
    });
    assert(resReview2.status === 201, "Neighbor 2 posts 4-star review on Room");

    const updatedRoom2 = await Listing.findById(room._id);
    assert(updatedRoom2.averageRating === 4.5 && updatedRoom2.reviewsCount === 2, "Room Listing averageRating synced to 4.5 ((5+4)/2)");

    // Test D: Fetch reviews and distribution
    const resGetReviews = await fetch(`http://127.0.0.1:5002/api/reviews?listingId=${room._id.toString()}`);
    const reviewsPayload = await resGetReviews.json();
    assert(
      reviewsPayload.success &&
      reviewsPayload.data.length === 2 &&
      reviewsPayload.stats.averageRating === 4.5 &&
      reviewsPayload.stats.distribution[5] === 1 &&
      reviewsPayload.stats.distribution[4] === 1,
      "GET /api/reviews returns review list and rating distribution"
    );

    // Test E: Neighbor 1 updates review to 4-star
    const resUpdateReview = await fetch("http://127.0.0.1:5002/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${communityTokens[0]}` },
      body: JSON.stringify({ listingId: room._id.toString(), rating: 4, comment: "Updated: good room overall." }),
    });
    assert(resUpdateReview.status === 200, "Neighbor 1 updates review from 5 to 4 stars");
    const updatedRoom3 = await Listing.findById(room._id);
    assert(updatedRoom3.averageRating === 4.0 && updatedRoom3.reviewsCount === 2, "Room averageRating updated to 4.0 ((4+4)/2)");

    // Test F: Reviews on Vehicle & Service
    const resVehicleReview = await fetch("http://127.0.0.1:5002/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${communityTokens[2]}` },
      body: JSON.stringify({ listingId: vehicle._id.toString(), rating: 5, comment: "Activa was in great condition!" }),
    });
    assert(resVehicleReview.status === 201, "Post review on Vehicle rental");

    const resServiceReview = await fetch("http://127.0.0.1:5002/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${communityTokens[2]}` },
      body: JSON.stringify({ listingId: service._id.toString(), rating: 5, comment: "Prompt wiring fix." }),
    });
    assert(resServiceReview.status === 201, "Post review on Service listing");

    // ==========================================
    // ABUSE REPORT & AUTO-SUSPENSION TESTS
    // ==========================================
    console.log("\n--- Testing Abuse Reports & Threshold-Based Auto-Suspension ---");

    // Test G: Prevent reporting own listing
    const resSelfReport = await fetch("http://127.0.0.1:5002/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ targetType: "listing", targetId: room._id.toString(), reason: "scam" }),
    });
    assert(resSelfReport.status === 400, "Prevent reporting own listing");

    // Test H: Prevent duplicate report from same reporter within 24h
    const resRep1 = await fetch("http://127.0.0.1:5002/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${communityTokens[0]}` },
      body: JSON.stringify({ targetType: "listing", targetId: room._id.toString(), reason: "scam", details: "Demanded advance payment offline" }),
    });
    assert(resRep1.status === 201, "Report 1 filed against owner listing by Neighbor 1");

    const resRep1Dup = await fetch("http://127.0.0.1:5002/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${communityTokens[0]}` },
      body: JSON.stringify({ targetType: "listing", targetId: room._id.toString(), reason: "scam" }),
    });
    assert(resRep1Dup.status === 400, "Anti-Spam: Block duplicate report by same user within 24h");

    // Check user report count is 1, not suspended yet
    let ownerDoc = await User.findById(owner._id);
    assert(ownerDoc.reportCount === 1 && !ownerDoc.isBanned && ownerDoc.suspensionStatus === "none", "User reportCount is 1, account remains Active");

    // Report 2 by Neighbor 2
    const resRep2 = await fetch("http://127.0.0.1:5002/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${communityTokens[1]}` },
      body: JSON.stringify({ targetType: "listing", targetId: vehicle._id.toString(), reason: "scam", details: "Vehicle not present at location" }),
    });
    assert(resRep2.status === 201, "Report 2 filed against owner vehicle by Neighbor 2");

    ownerDoc = await User.findById(owner._id);
    assert(ownerDoc.reportCount === 2 && !ownerDoc.isBanned, "User reportCount is 2, account still Active");

    // Report 3 by Neighbor 3 -> THRESHOLD REACHED (3 reports -> Temporary Suspension for 48h)
    const resRep3 = await fetch("http://127.0.0.1:5002/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${communityTokens[2]}` },
      body: JSON.stringify({ targetType: "user", targetId: owner._id.toString(), reason: "scam", details: "Suspicious profile asking for money" }),
    });
    const rep3Data = await resRep3.json();
    assert(resRep3.status === 201 && rep3Data.autoSuspended && rep3Data.suspensionType === "temporary", "Report 3 triggers automatic TEMPORARY suspension (48h)");

    ownerDoc = await User.findById(owner._id);
    assert(
      ownerDoc.isBanned === true &&
      ownerDoc.suspensionStatus === "temporary" &&
      ownerDoc.suspendedUntil != null &&
      ownerDoc.reportCount === 3,
      "Owner account is now marked isBanned: true, suspensionStatus: 'temporary' with 48h deadline"
    );

    // Check listings by suspended owner were automatically hidden
    const hiddenRooms = await Listing.find({ ownerId: owner._id, status: "hidden" });
    assert(hiddenRooms.length >= 1, "Owner's listings automatically set to 'hidden' upon temporary suspension");

    // Test I: Owner cannot access protected routes while suspended
    const resSuspendedReq = await fetch("http://127.0.0.1:5002/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ title: "Another Room", rent: 5000, locality: "Bhimtal" }),
    });
    assert(resSuspendedReq.status === 403, "Temporarily suspended user blocked with 403 on protected routes");

    // Report 4 and Report 5 by Neighbor 4 & 5 -> THRESHOLD REACHED (5 reports -> Permanent Suspension)
    await fetch("http://127.0.0.1:5002/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${communityTokens[3]}` },
      body: JSON.stringify({ targetType: "user", targetId: owner._id.toString(), reason: "harassment", details: "Abusive chat messages" }),
    });

    const resRep5 = await fetch("http://127.0.0.1:5002/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${communityTokens[4]}` },
      body: JSON.stringify({ targetType: "user", targetId: owner._id.toString(), reason: "misuse", details: "Spamming non-intended listings" }),
    });
    const rep5Data = await resRep5.json();
    assert(resRep5.status === 201 && rep5Data.autoSuspended && rep5Data.suspensionType === "permanent", "Report 5 triggers automatic PERMANENT suspension");

    ownerDoc = await User.findById(owner._id);
    assert(
      ownerDoc.isBanned === true &&
      ownerDoc.suspensionStatus === "permanent" &&
      ownerDoc.reportCount === 5,
      "Owner account is now permanently banned (suspensionStatus: 'permanent')"
    );

    // Test J: Admin can view reports & lift suspension
    const resAdminReports = await fetch("http://127.0.0.1:5002/api/reports/admin", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminReportsData = await resAdminReports.json();
    assert(adminReportsData.success && adminReportsData.data.length >= 5, "Admin can retrieve all abuse reports with reported user info");

    // Admin lifts suspension via PATCH /api/admin/users/:id/ban
    const resLift = await fetch(`http://127.0.0.1:5002/api/admin/users/${owner._id.toString()}/ban`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ ban: false }),
    });
    const liftData = await resLift.json();
    assert(resLift.status === 200 && liftData.success, "Admin successfully lifts user suspension");

    ownerDoc = await User.findById(owner._id);
    assert(!ownerDoc.isBanned && ownerDoc.suspensionStatus === "none", "User account successfully restored to Active state");

  } catch (err) {
    console.error("Test execution threw error:", err);
  } finally {
    console.log(`\n==================================================`);
    console.log(`Verification Summary: ${passCount}/${testCount} Tests Passed`);
    console.log(`==================================================\n`);
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    await mongoServer.stop();
  }

  process.exit(passCount === testCount ? 0 : 1);
}

runReviewAndReportTests().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
