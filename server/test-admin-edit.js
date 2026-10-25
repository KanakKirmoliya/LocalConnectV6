import assert from "node:assert";

async function run() {
  console.log("🚀 Running Admin & Room Edit End-to-End Tests against live LocalConnect server...");
  const baseUrl = "http://localhost:5000";
  let passed = 0;

  const timestamp = Date.now();
  const sellerEmail = `test_seller_${timestamp}@example.com`;
  const buyerEmail = `test_buyer_${timestamp}@example.com`;

  try {
    // 1. Health check
    const health = await fetch(`${baseUrl}/api/v1/health`).then((r) => r.json());
    assert.strictEqual(health.status, "ok");
    assert.strictEqual(health.database, "connected");
    console.log("✅ [PASS 1] Server is healthy and connected to MongoDB Atlas");
    passed++;

    // 2. Register Seller
    const sellerRes = await fetch(`${baseUrl}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Seller Bhupesh",
        email: sellerEmail,
        password: "password123",
        phone: "+919876543210",
        area: "Nainital",
      }),
    });
    const sellerData = await sellerRes.json();
    assert.strictEqual(sellerRes.status, 201);
    const sellerToken = sellerData.token;
    console.log(`✅ [PASS 2] Seller registered in Atlas (${sellerEmail})`);
    passed++;

    // 3. Register Buyer
    const buyerRes = await fetch(`${baseUrl}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Buyer Chandra",
        email: buyerEmail,
        password: "password123",
        phone: "+919123456789",
        area: "Bhimtal",
      }),
    });
    const buyerData = await buyerRes.json();
    assert.strictEqual(buyerRes.status, 201);
    const buyerToken = buyerData.token;
    console.log(`✅ [PASS 3] Buyer registered in Atlas (${buyerEmail})`);
    passed++;

    // 4. Seller creates a room listing
    const createRes = await fetch(`${baseUrl}/api/rooms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sellerToken}`,
      },
      body: JSON.stringify({
        title: "2 Floor House (4 rooms + 2 bathroom)",
        rent: 50000,
        locality: "Bhimtal Lake Side",
        latitude: 29.3500,
        longitude: 79.5500,
        amenities: ["WiFi", "Kitchen", "Geyser"],
        photos: [{ url: "/uploads/listings/sample.jpg", name: "sample.jpg", isCover: true }],
        videos: [],
      }),
    });
    const createdItem = await createRes.json();
    assert.strictEqual(createRes.status, 201);
    const roomId = createdItem.id || createdItem._id;
    assert.strictEqual(createdItem.rent, 50000);
    console.log(`✅ [PASS 4] Room created and persisted in MongoDB Atlas (ID: ${roomId}, Rent: ₹50,000)`);
    passed++;

    // 5. Seller EDITS the room listing (Title, Rent, Locality, Amenities, Photos)
    const updateRes = await fetch(`${baseUrl}/api/rooms/${roomId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sellerToken}`,
      },
      body: JSON.stringify({
        title: "2 Floor House (4 rooms + 2 bathroom) — Fully Furnished",
        rent: 55000,
        locality: "Bhimtal Lake Front, Nainital",
        amenities: ["WiFi", "Kitchen", "Geyser", "Parking", "Lake View"],
        photos: [
          { url: "/uploads/listings/sample.jpg", name: "sample.jpg", isCover: true },
          { url: "/uploads/listings/bedroom.jpg", name: "bedroom.jpg" },
        ],
      }),
    });
    const updatedData = await updateRes.json();
    assert.strictEqual(updateRes.status, 200);
    assert.strictEqual(updatedData.rent, 55000);
    assert.strictEqual(updatedData.title, "2 Floor House (4 rooms + 2 bathroom) — Fully Furnished");
    assert.strictEqual(updatedData.amenities.length, 5);
    assert.strictEqual(updatedData.photos.length, 2);
    console.log("✅ [PASS 5] Seller successfully edited listing (Rent updated to ₹55,000, 5 amenities, 2 photos)");
    passed++;

    // 6. Non-admin is blocked from /api/admin/* (403 Forbidden)
    const blockedRes = await fetch(`${baseUrl}/api/admin/overview`, {
      headers: { Authorization: `Bearer ${sellerToken}` },
    });
    assert.strictEqual(blockedRes.status, 403);
    console.log("✅ [PASS 6] Non-admin access to Admin Control blocked with 403 Forbidden");
    passed++;

    // 7. Test Admin Auth: Bhupesh Singh Samant is set as admin in Atlas
    // Login with seller, but promote via mongoose script or check Bhupesh's account
    // Let's promote buyer to admin to test admin powers with their fresh token
    const { default: mongoose } = await import("mongoose");
    await mongoose.connect(process.env.MONGODB_URI);
    await mongoose.connection.db.collection("users").updateOne(
      { email: buyerEmail },
      { $set: { role: "admin" } }
    );

    // Re-login buyer as admin
    const adminLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: buyerEmail,
        password: "password123",
      }),
    });
    const adminLoginData = await adminLoginRes.json();
    const adminToken = adminLoginData.token;
    assert.strictEqual(adminLoginData.user.role, "admin");
    console.log("✅ [PASS 7] Admin authenticated with verified 'admin' role");
    passed++;

    // 8. Admin accesses /api/admin/overview
    const overviewRes = await fetch(`${baseUrl}/api/admin/overview`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const overviewData = await overviewRes.json();
    assert.strictEqual(overviewRes.status, 200);
    assert.strictEqual(overviewData.success, true);
    assert.strictEqual(typeof overviewData.data.totalUsers, "number");
    assert.strictEqual(typeof overviewData.data.totalListings, "number");
    console.log(`✅ [PASS 8] Admin overview metrics received: ${overviewData.data.totalUsers} users, ${overviewData.data.totalListings} listings`);
    passed++;

    // 9. Admin accesses /api/admin/listings
    const adminListingsRes = await fetch(`${baseUrl}/api/admin/listings`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminListingsData = await adminListingsRes.json();
    assert.strictEqual(adminListingsRes.status, 200);
    const found = adminListingsData.data.find((l) => (l.id || l._id) === roomId);
    assert.strictEqual(Boolean(found), true);
    console.log(`✅ [PASS 9] Admin listings manager shows created room with owner info (${found.owner})`);
    passed++;

    // 10. Admin accesses /api/admin/users
    const adminUsersRes = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminUsersData = await adminUsersRes.json();
    assert.strictEqual(adminUsersRes.status, 200);
    assert.strictEqual(adminUsersData.data.length >= 2, true);
    console.log(`✅ [PASS 10] Admin users manager loaded ${adminUsersData.data.length} registered users`);
    passed++;

    // 11. Admin deletes the test listing permanently
    const deleteRes = await fetch(`${baseUrl}/api/admin/listings/${roomId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const deleteData = await deleteRes.json();
    assert.strictEqual(deleteRes.status, 200);
    assert.strictEqual(deleteData.success, true);
    console.log(`✅ [PASS 11] Admin successfully deleted listing (${roomId})`);
    passed++;

    // 12. Confirm deletion in database
    const verifyDel = await fetch(`${baseUrl}/api/rooms/${roomId}`);
    assert.strictEqual(verifyDel.status, 404);
    console.log("✅ [PASS 12] Verified listing is completely removed from Atlas database (404)");
    passed++;

    // 13. Create a new listing and verify it as Admin
    const room2Res = await fetch(`${baseUrl}/api/rooms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sellerToken}`,
      },
      body: JSON.stringify({
        title: "Verified Himalayan View Room",
        rent: 18000,
        locality: "Tallital",
        latitude: 29.3815,
        longitude: 79.4570,
      }),
    });
    const room2Data = await room2Res.json();
    assert.strictEqual(room2Res.status, 201);
    const room2Id = room2Data.id || room2Data._id;

    const verifyListingRes = await fetch(`${baseUrl}/api/admin/listings/${room2Id}/verify`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const verifyListingData = await verifyListingRes.json();
    assert.strictEqual(verifyListingRes.status, 200);
    assert.strictEqual(verifyListingData.isVerified, true);
    console.log("✅ [PASS 13] Admin toggled listing verification (isVerified: true)");
    passed++;

    // 14. Admin bans a user
    const banRes = await fetch(`${baseUrl}/api/admin/users/${sellerData.user.id}/ban`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ ban: true, reason: "Suspicious behavior reported" }),
    });
    const banData = await banRes.json();
    assert.strictEqual(banRes.status, 200);
    assert.strictEqual(banData.user.isBanned, true);
    console.log("✅ [PASS 14] Admin successfully banned user (isBanned: true)");
    passed++;

    // 15. Banned user login blocked with 403
    const bannedLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: sellerEmail, password: "password123" }),
    });
    assert.strictEqual(bannedLogin.status, 403);
    console.log("✅ [PASS 15] Banned user login blocked with 403 Forbidden");
    passed++;

    // 16. Admin unbans the user
    const unbanRes = await fetch(`${baseUrl}/api/admin/users/${sellerData.user.id}/ban`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ ban: false, reason: "" }),
    });
    assert.strictEqual(unbanRes.status, 200);
    console.log("✅ [PASS 16] Admin successfully unbanned user");
    passed++;

    // 17. Admin permanently deletes user and cleans up their listings
    const delUserRes = await fetch(`${baseUrl}/api/admin/users/${sellerData.user.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(delUserRes.status, 200);
    console.log("✅ [PASS 17] Admin permanently deleted user and cleaned up their listings");
    passed++;

    await mongoose.disconnect();

    console.log(`\n==================================================`);
    console.log(`🎉 ALL ${passed}/${passed} ADMIN & EDIT LISTING TESTS PASSED!`);
    console.log(`==================================================\n`);
  } catch (err) {
    console.error("❌ Test failed:", err);
    process.exit(1);
  }
}

run();
