import assert from "node:assert";

async function run() {
  console.log("🚀 Running Direct Messages Hub & Unread Notifications End-to-End Tests...");
  const baseUrl = "http://localhost:5000";
  let passed = 0;

  const timestamp = Date.now();
  const sellerEmail = `msg_seller_${timestamp}@example.com`;
  const buyerEmail = `msg_buyer_${timestamp}@example.com`;
  const intruderEmail = `msg_intruder_${timestamp}@example.com`;

  const fetchWithRetry = async (url, opts = {}, retries = 3) => {
    for (let i = 0; i < retries; i++) {
      try {
        return await fetch(url, opts);
      } catch (err) {
        if (i === retries - 1) throw err;
        await new Promise((r) => setTimeout(r, 800));
      }
    }
  };

  try {
    // 1. Health check
    const health = await fetchWithRetry(`${baseUrl}/api/v1/health`).then((r) => r.json());
    assert.strictEqual(health.status, "ok");
    assert.strictEqual(health.database, "connected");
    console.log("✅ [PASS 1] Server is healthy and connected to MongoDB Atlas");
    passed++;

    // 2. Register Seller
    const sellerRes = await fetchWithRetry(`${baseUrl}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Host Bhupesh",
        email: sellerEmail,
        password: "password123",
        phone: "+919876543210",
        area: "Nainital",
      }),
    });
    const sellerData = await sellerRes.json();
    assert.strictEqual(sellerRes.status, 201);
    const sellerToken = sellerData.token;
    console.log(`✅ [PASS 2] Seller registered (${sellerEmail})`);
    passed++;

    // 3. Register Buyer
    const buyerRes = await fetchWithRetry(`${baseUrl}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Guest Chandra",
        email: buyerEmail,
        password: "password123",
        phone: "+919123456789",
        area: "Bhimtal",
      }),
    });
    const buyerData = await buyerRes.json();
    assert.strictEqual(buyerRes.status, 201);
    const buyerToken = buyerData.token;
    console.log(`✅ [PASS 3] Buyer registered (${buyerEmail})`);
    passed++;

    // 4. Seller creates a room listing
    const createRes = await fetchWithRetry(`${baseUrl}/api/rooms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sellerToken}`,
      },
      body: JSON.stringify({
        title: "Studio Apartment Near Lake",
        rent: 22000,
        locality: "Lake View Road",
        latitude: 29.3919,
        longitude: 79.4542,
        amenities: ["WiFi", "Balcony"],
        photos: [],
      }),
    });
    const listing = await createRes.json();
    assert.strictEqual(createRes.status, 201);
    const listingId = listing.id || listing._id;
    console.log(`✅ [PASS 4] Listing published (ID: ${listingId})`);
    passed++;

    // 5. Initial Unread Count for Seller must be 0
    const initialUnreadRes = await fetchWithRetry(`${baseUrl}/api/requests/unread-count`, {
      headers: { Authorization: `Bearer ${sellerToken}` },
    });
    const initialUnreadData = await initialUnreadRes.json();
    assert.strictEqual(initialUnreadData.unreadCount, 0);
    console.log("✅ [PASS 5] Initial unread count for Seller is 0");
    passed++;

    // 6. Buyer sends inquiry to Seller
    const sendInquiryRes = await fetchWithRetry(`${baseUrl}/api/requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${buyerToken}`,
      },
      body: JSON.stringify({
        listingId,
        message: "Hi Bhupesh, can I schedule a visit to the studio apartment this weekend?",
      }),
    });
    const inquiryData = await sendInquiryRes.json();
    assert.strictEqual(sendInquiryRes.status, 201);
    const requestId = inquiryData.data?._id || inquiryData.data?.id;
    console.log(`✅ [PASS 6] Buyer sent inquiry message (ID: ${requestId})`);
    passed++;

    // 7. Seller's global unread count MUST now be 1
    const sellerUnreadAfterInquiry = await fetchWithRetry(`${baseUrl}/api/requests/unread-count`, {
      headers: { Authorization: `Bearer ${sellerToken}` },
    }).then((r) => r.json());
    assert.strictEqual(sellerUnreadAfterInquiry.unreadCount, 1);
    console.log("✅ [PASS 7] Seller unread count dynamically incremented to 1");
    passed++;

    // 8. Buyer's own unread count remains 0 (sender does not have unread message)
    const buyerUnread = await fetchWithRetry(`${baseUrl}/api/requests/unread-count`, {
      headers: { Authorization: `Bearer ${buyerToken}` },
    }).then((r) => r.json());
    assert.strictEqual(buyerUnread.unreadCount, 0);
    console.log("✅ [PASS 8] Buyer unread count correctly remains 0");
    passed++;

    // 9. Seller fetches /api/requests/conversations
    const sellerConvsRes = await fetchWithRetry(`${baseUrl}/api/requests/conversations`, {
      headers: { Authorization: `Bearer ${sellerToken}` },
    });
    const sellerConvs = await sellerConvsRes.json();
    assert.strictEqual(sellerConvsRes.status, 200);
    assert.strictEqual(sellerConvs.data.length >= 1, true);

    const activeConv = sellerConvs.data.find((c) => c.id === requestId || c._id === requestId);
    assert.strictEqual(Boolean(activeConv), true);
    assert.strictEqual(activeConv.partner.name, "Guest Chandra");
    assert.strictEqual(activeConv.myRole, "seller");
    assert.strictEqual(activeConv.unreadCount, 1);
    assert.strictEqual(activeConv.listingTitle, "Studio Apartment Near Lake");
    assert.strictEqual(activeConv.listingType, "room");
    console.log("✅ [PASS 9] Seller conversations feed populated with partner info, listing context, and unreadCount=1");
    passed++;

    // 10. Seller marks conversation as read via /api/requests/:id/read
    const readRes = await fetchWithRetry(`${baseUrl}/api/requests/${requestId}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${sellerToken}` },
    });
    const readData = await readRes.json();
    assert.strictEqual(readRes.status, 200);
    assert.strictEqual(readData.success, true);

    // Verify Seller unread count returns to 0
    const sellerUnreadAfterRead = await fetchWithRetry(`${baseUrl}/api/requests/unread-count`, {
      headers: { Authorization: `Bearer ${sellerToken}` },
    }).then((r) => r.json());
    assert.strictEqual(sellerUnreadAfterRead.unreadCount, 0);
    console.log("✅ [PASS 10] Seller marked conversation as read -> unread count returned to 0");
    passed++;

    // 11. Seller sends reply message in conversation
    const replyRes = await fetchWithRetry(`${baseUrl}/api/requests/${requestId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sellerToken}`,
      },
      body: JSON.stringify({
        text: "Yes Chandra! Saturday 3 PM works perfectly for the visit.",
      }),
    });
    assert.strictEqual(replyRes.status, 201);
    console.log("✅ [PASS 11] Seller replied in conversation");
    passed++;

    // 12. Buyer's unread count MUST now be 1
    const buyerUnreadAfterReply = await fetchWithRetry(`${baseUrl}/api/requests/unread-count`, {
      headers: { Authorization: `Bearer ${buyerToken}` },
    }).then((r) => r.json());
    assert.strictEqual(buyerUnreadAfterReply.unreadCount, 1);
    console.log("✅ [PASS 12] Buyer unread count dynamically incremented to 1 upon seller reply");
    passed++;

    // 13. Buyer fetches messages and marks conversation as read
    await fetchWithRetry(`${baseUrl}/api/requests/${requestId}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${buyerToken}` },
    });
    const buyerUnreadFinal = await fetchWithRetry(`${baseUrl}/api/requests/unread-count`, {
      headers: { Authorization: `Bearer ${buyerToken}` },
    }).then((r) => r.json());
    assert.strictEqual(buyerUnreadFinal.unreadCount, 0);
    console.log("✅ [PASS 13] Buyer marked conversation as read -> unread count returned to 0");
    passed++;

    // 14. Security test: Intruder user cannot access conversation or read status
    const intruderRes = await fetchWithRetry(`${baseUrl}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Intruder User",
        email: intruderEmail,
        password: "password123",
      }),
    });
    const intruderData = await intruderRes.json();
    const intruderToken = intruderData.token;

    const intruderReadRes = await fetchWithRetry(`${baseUrl}/api/requests/${requestId}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${intruderToken}` },
    });
    assert.strictEqual(intruderReadRes.status, 403);

    const intruderMsgsRes = await fetchWithRetry(`${baseUrl}/api/requests/${requestId}/messages`, {
      headers: { Authorization: `Bearer ${intruderToken}` },
    });
    assert.strictEqual(intruderMsgsRes.status, 403);
    console.log("✅ [PASS 14] Intruder user strictly blocked with 403 Forbidden");
    passed++;

    console.log(`\n==================================================`);
    console.log(`🎉 ALL ${passed}/${passed} DIRECT MESSAGES HUB & UNREAD TESTS PASSED!`);
    console.log(`==================================================\n`);
  } catch (err) {
    console.error("❌ Test failed:", err);
    process.exit(1);
  }
}

run();
