/**
 * Integration tests: GPS room location identity + overall ratings/profile.
 *   node test-room-location.js          (uses an in-memory MongoDB, like run-tests.js)
 */
import assert from "node:assert/strict";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

const mongo = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongo.getUri();
process.env.NODE_ENV = "test";
process.env.CORS_ORIGIN = "http://localhost:5173";
process.env.JWT_SECRET = "test_super_secret_jwt_key_12345_minimum_32_chars";
process.env.PORT = "5003";
process.env.ROOM_DUPLICATE_RADIUS_M = "10";
const BASE = "http://127.0.0.1:5003";

const { server } = await import("./index.js");
await new Promise((r) => setTimeout(r, 1500));
const { User } = await import("./src/models/User.js");
const { Listing } = await import("./src/models/Listing.js");
const { Request } = await import("./src/models/Request.js");
const { UserRating, getRatingOverview } = await import("./src/models/UserRating.js");
const { Review } = await import("./src/models/Review.js");
const { RoomLocationLock } = await import("./src/models/RoomLocationLock.js");
const { Property } = await import("./src/roomVerification.js");
const { backfillRoomLocations } = await import("./src/services/roomLocationMigration.js");
const { locationKeyFor, distanceMetres } = await import("./src/utils/roomLocation.js");
await Listing.init();
await RoomLocationLock.init();

let passed = 0;
const ok = (name) => { passed++; console.log(`✅ ${name}`); };
const api = async (method, path, token, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, json };
};
const shift = (lat, lng, northM, eastM) => ({ lat: lat + northM / 111195, lng: lng + eastM / (111195 * Math.cos((lat * Math.PI) / 180)) });

async function makeUser(label) {
  const email = `${label}_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;
  const r = await api("POST", "/api/auth/signup", null, { name: `User ${label}`, email, password: "password123", phone: "+919876543210", area: "Nainital" });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return { id: r.json.user.id, token: r.json.token };
}

let failed = false;
try {
  // ---------- setup: a verified owner with a verified property ----------
  const owner = await makeUser("owner");
  const other = await makeUser("other");
  await User.updateOne({ _id: owner.id }, { $set: { "identity.status": "verified" } });
  await User.updateOne({ _id: other.id }, { $set: { "identity.status": "verified" } });
  const prop = await Property.create({
    ownerId: owner.id,
    address: { line1: "House 1, Mall Road", locality: "Tallital", city: "Nainital", state: "Uttarakhand", pincode: "263001" },
    latitude: 29.38, longitude: 79.46, ownership: { status: "verified" },
  });
  const prop2 = await Property.create({
    ownerId: other.id,
    address: { line1: "House 9, Lake Road", locality: "Mallital", city: "Nainital", state: "Uttarakhand", pincode: "263001" },
    latitude: 29.39, longitude: 79.45, ownership: { status: "verified" },
  });
  let unit = 0;
  const roomBody = (over = {}) => ({
    type: "room", propertyId: prop.propertyCode, unitNumber: `U${++unit}`, title: `Room ${unit}`, locality: "Tallital",
    latitude: 29.380312, longitude: 79.463611, locationSource: "gps", locationAccuracyM: 8,
    roomDetails: { rent: 6000, deposit: 6000, roomType: "1BHK" }, ...over,
  });
  const createRoom = (tok, over) => api("POST", "/api/v1/listings", tok, roomBody(over));

  // ---------- GPS / location identity ----------
  const first = await createRoom(owner.token);
  assert.equal(first.status, 201, JSON.stringify(first.json));
  const firstId = first.json.data.id;
  const stored = await Listing.findById(firstId).lean();
  assert.equal(stored.locationKey, locationKeyFor(29.380312, 79.463611));
  assert.equal(stored.locationClaimKey, stored.locationKey);
  assert.equal(stored.locationSource, "gps");
  assert.equal(stored.latitude, 29.380312);
  ok("room is stored with exact coordinates and a deterministic GPS-derived locationKey");

  let r = await createRoom(owner.token, { photos: [], title: "Same spot, other photos" });
  assert.equal(r.status, 409); assert.equal(r.json.error, "A room listing already exists at this location.");
  ok("same coordinates -> 409 Conflict with the required message (photos are irrelevant)");

  r = await createRoom(other.token, { propertyId: prop2.propertyCode });
  assert.equal(r.status, 409);
  ok("a different user cannot list a room at the same physical spot");

  const near = shift(29.380312, 79.463611, 5, 5);
  assert.ok(distanceMetres(29.380312, 79.463611, near.lat, near.lng) < 10);
  r = await createRoom(other.token, { propertyId: prop2.propertyCode, latitude: near.lat, longitude: near.lng, locationSource: "manual", locationAccuracyM: undefined });
  assert.equal(r.status, 409);
  ok("GPS drift inside 10 m is detected as a duplicate");

  // boundary sweep: every point within 10 m, whichever cell it falls in, must be rejected
  let crossedCell = false;
  for (let m = 1; m <= 9; m += 2) {
    for (const [n, e] of [[m, 0], [0, m], [-m, 0], [0, -m], [m * 0.7, m * 0.7]]) {
      const p = shift(29.380312, 79.463611, n, e);
      if (locationKeyFor(p.lat, p.lng) !== stored.locationKey) crossedCell = true;
      const x = await createRoom(other.token, { propertyId: prop2.propertyCode, latitude: p.lat, longitude: p.lng, locationSource: "manual", locationAccuracyM: undefined });
      assert.equal(x.status, 409, `point ${n},${e} (${m} m) slipped through`);
    }
  }
  assert.ok(crossedCell, "sweep must cross a grid-cell boundary");
  ok("points near/across spatial-grid boundaries cannot bypass the duplicate check");

  const far = shift(29.380312, 79.463611, 25, 0);
  r = await createRoom(other.token, { propertyId: prop2.propertyCode, latitude: far.lat, longitude: far.lng, locationSource: "manual", locationAccuracyM: undefined });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const farId = r.json.data.id;
  ok("a location beyond the duplicate radius can be listed separately");

  // validation of bad input
  for (const [la, lo] of [[undefined, undefined], ["abc", 79], [95, 79], [29, 190], [0, 0]]) {
    const x = await createRoom(owner.token, { latitude: la, longitude: lo, locationSource: "manual", locationAccuracyM: undefined });
    assert.equal(x.status, 400, `${la},${lo}`);
  }
  r = await createRoom(owner.token, { latitude: 29.5, longitude: 79.5, locationSource: "gps", locationAccuracyM: 900 });
  assert.equal(r.status, 422); assert.equal(r.json.code, "GPS_ACCURACY_LOW");
  r = await createRoom(owner.token, { latitude: 29.5, longitude: 79.5, locationSource: "gps", locationAccuracyM: undefined });
  assert.equal(r.status, 400);
  ok("missing / invalid / out-of-range / inaccurate coordinates are rejected safely");

  // client cannot forge identity fields
  r = await createRoom(owner.token, { latitude: 29.6, longitude: 79.6, locationKey: "FAKE", locationClaimKey: "FAKE" });
  assert.equal(r.status, 201);
  const forged = await Listing.findById(r.json.data.id).lean();
  assert.equal(forged.locationKey, locationKeyFor(29.6, 79.6));
  ok("clients cannot set locationKey / locationClaimKey");

  // concurrency: 8 simultaneous requests for one brand-new spot -> exactly one room
  const spot = { latitude: 29.7, longitude: 79.7 };
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => createRoom(i % 2 ? owner.token : other.token, { ...spot, propertyId: i % 2 ? prop.propertyCode : prop2.propertyCode })));
  const created = results.filter((x) => x.status === 201).length;
  const conflicts = results.filter((x) => x.status === 409).length;
  assert.equal(created, 1, `expected 1 created, got statuses ${results.map((x) => x.status)}`);
  assert.equal(created + conflicts, 8);
  assert.equal(await Listing.countDocuments({ type: "room", locationKey: locationKeyFor(spot.latitude, spot.longitude) }), 1);
  ok("concurrent requests for the same location create only one room");

  // concurrency across a cell boundary
  const b1 = { latitude: 29.8, longitude: 79.8 };
  const b2 = shift(b1.latitude, b1.longitude, 0, 7);
  const cross = await Promise.all([
    createRoom(owner.token, { ...b1 }),
    createRoom(other.token, { propertyId: prop2.propertyCode, latitude: b2.lat, longitude: b2.lng, locationSource: "manual", locationAccuracyM: undefined }),
  ]);
  assert.equal(cross.filter((x) => x.status === 201).length, 1);
  ok("concurrent requests for neighbouring cells within the radius create only one room");

  // edits
  r = await api("PATCH", `/api/rooms/${firstId}`, owner.token, { title: "Renamed room", latitude: 29.380312, longitude: 79.463611, locationSource: "gps", locationAccuracyM: 8 });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  r = await api("PATCH", `/api/rooms/${firstId}`, owner.token, { description: "Only text changed" });
  assert.equal(r.status, 200);
  const afterEdit = await Listing.findById(firstId).lean();
  assert.equal(String(afterEdit._id), firstId);
  assert.equal(afterEdit.locationKey, stored.locationKey);
  ok("editing a room never conflicts with itself and keeps its id and location key");

  r = await api("PATCH", `/api/rooms/${farId}`, other.token, { latitude: 29.380312, longitude: 79.463611, locationSource: "manual" });
  assert.equal(r.status, 409);
  const unchanged = await Listing.findById(farId).lean();
  assert.equal(unchanged.locationKey, locationKeyFor(far.lat, far.lng));
  ok("editing a room onto an occupied location is rejected and changes nothing");

  r = await api("PATCH", `/api/rooms/${farId}`, other.token, { latitude: null, longitude: null });
  assert.equal(r.status, 400);
  ok("an edit cannot remove a room's coordinates");

  // owner sees exact coordinates, public sees the rounded point and never the key
  const publicList = await api("GET", "/api/rooms");
  assert.ok(!JSON.stringify(publicList.json).includes("LK1:"), "locationKey must never be public");
  const pubFirst = publicList.json.find((x) => x.id === firstId);
  assert.equal(pubFirst.latitude, 29.38);
  const ownerList = await api("GET", "/api/rooms", owner.token);
  assert.equal(ownerList.json.find((x) => x.id === firstId).latitude, 29.380312);
  ok("owner receives exact stored coordinates; public output is approximate and has no locationKey");

  // other modules are unaffected
  const svc = await api("POST", "/api/services", owner.token, { title: "Plumber", trade: "Plumber", locality: "Tallital", latitude: 29.380312, longitude: 79.463611 });
  const lf = await api("POST", "/api/lostfound", owner.token, { title: "Lost keys", kind: "lost", locality: "Tallital", latitude: 29.380312, longitude: 79.463611 });
  assert.equal(svc.status, 201); assert.equal(lf.status, 201);
  assert.ok(!(await Listing.findById(svc.json.id).lean()).locationKey);
  ok("services and Lost & Found at the same coordinates are unaffected");

  // ---------- migration ----------
  await Listing.deleteMany({});
  const mk = (title, lat, lng, createdAt) => Listing.collection.insertOne({
    ownerId: new mongoose.Types.ObjectId(owner.id), ownerName: "U", type: "room", title, locality: "X", status: "active",
    latitude: lat ?? null, longitude: lng ?? null, createdAt, updatedAt: createdAt, photos: [], roomCode: `ROM-${title}`,
  });
  const a = await mk("old", 30.1, 80.1, new Date("2024-01-01"));
  const b = await mk("dup", 30.1, 80.100001, new Date("2025-01-01"));
  const c = await mk("solo", 30.2, 80.2, new Date("2025-02-01"));
  const d = await mk("nocoords", null, null, new Date("2025-03-01"));
  const rep1 = await backfillRoomLocations();
  assert.equal(rep1.assigned, 2); assert.equal(rep1.conflicts.length, 1); assert.equal(rep1.missingCoordinates.length, 1);
  assert.equal(rep1.conflicts[0].id, String(b.insertedId));
  const rep2 = await backfillRoomLocations();
  assert.equal(rep2.assigned, 0);
  const oldDoc = await Listing.findById(a.insertedId).lean();
  const dupDoc = await Listing.findById(b.insertedId).lean();
  assert.ok(oldDoc.locationKey); assert.ok(!dupDoc.locationKey);
  assert.equal(dupDoc.longitude, 80.100001); assert.equal(dupDoc.roomCode, "ROM-dup"); assert.equal(await Listing.countDocuments({ type: "room" }), 4);
  ok("migration keys existing rooms oldest-first, reports conflicts, deletes/changes nothing and is safe to re-run");

  // ---------- ratings & profile ----------
  const provider = await makeUser("provider");
  const customer = await makeUser("customer");
  const stranger = await makeUser("stranger");
  const profile = (tok, id) => api("GET", `/api/users/${id}/profile`, tok);

  r = await profile(customer.token, provider.id);
  assert.equal(r.status, 200);
  assert.equal(r.json.data.overall.count, 0); assert.equal(r.json.data.overall.hasRatings, false);
  ok("a user with no ratings reports an explicit empty summary (UI shows 'No ratings yet')");

  const listing = await Listing.create({ ownerId: provider.id, ownerName: "P", type: "service", title: "Fix-it", locality: "X", status: "active" });
  const reqDoc = await Request.create({ listingId: listing._id, listingTitle: "Fix-it", buyerId: customer.id, buyerName: "C", sellerId: provider.id, status: "accepted", message: "hi" });
  r = await api("POST", "/api/user-ratings", customer.token, { requestId: String(reqDoc._id), rating: 5, comment: "great", tags: ["Honest"] });
  assert.equal(r.status, 201);
  assert.equal(r.json.summary.average, 5); assert.equal(r.json.summary.count, 1);
  r = await profile(stranger.token, provider.id);
  assert.equal(r.json.data.overall.average, 5); assert.equal(r.json.data.overall.count, 1);
  assert.equal(r.json.data.asProvider.count, 1); assert.equal(r.json.data.asCustomer.count, 0);
  ok("one rating shows the correct average and count on the profile (no refresh/re-login needed)");

  // re-rating updates, never duplicates
  r = await api("POST", "/api/user-ratings", customer.token, { requestId: String(reqDoc._id), rating: 3 });
  assert.equal(r.status, 201);
  assert.equal(await UserRating.countDocuments({ ratedUserId: provider.id }), 1);
  r = await profile(stranger.token, provider.id);
  assert.equal(r.json.data.overall.average, 3);
  ok("editing a rating updates the numbers; one rating per request per direction");

  // provider also rated as a customer by someone else -> weighted overall
  const listing2 = await Listing.create({ ownerId: customer.id, ownerName: "C", type: "service", title: "Other", locality: "X", status: "active" });
  const req2 = await Request.create({ listingId: listing2._id, listingTitle: "Other", buyerId: provider.id, buyerName: "P", sellerId: customer.id, status: "accepted", message: "hi" });
  await api("POST", "/api/user-ratings", customer.token, { requestId: String(req2._id), rating: 5 }); // customer (as seller) rates provider (as buyer)
  r = await profile(stranger.token, provider.id);
  const d1 = r.json.data;
  assert.equal(d1.asProvider.count, 1); assert.equal(d1.asProvider.average, 3);
  assert.equal(d1.asCustomer.count, 1); assert.equal(d1.asCustomer.average, 5);
  assert.equal(d1.overall.count, 2); assert.equal(d1.overall.average, 4);
  ok("provider and customer ratings stay separate; overall is the weighted aggregate");

  // listing reviews on the owner's listings count too (same number the listing cards show)
  await Review.create({ listingId: listing._id, listingType: "service", userId: stranger.id, userName: "S", rating: 5, comment: "very good" });
  r = await profile(customer.token, provider.id);
  assert.equal(r.json.data.overall.count, 3);
  assert.equal(r.json.data.asProvider.count, 2);
  assert.equal(r.json.data.overall.average, 4.3); // (3+5+5)/3
  const cards = await api("GET", "/api/services", stranger.token);
  const card = cards.json.find((x) => x.id === String(listing._id));
  assert.equal(card.providerRating.count, 2); assert.equal(card.providerRating.average, 4);
  ok("profile header, listing cards and overview all come from the same calculation");

  r = await profile(customer.token, stranger.id);
  assert.equal(r.json.data.overall.count, 0);
  ok("ratings for one user never appear on another user's profile");

  const mine = await api("GET", "/api/user-ratings/me", provider.token);
  assert.equal(mine.json.data.overall.count, 3);
  const asViewer = await getRatingOverview(provider.id);
  assert.equal(asViewer.overall.average, mine.json.data.overall.average);
  ok("'my ratings' endpoint matches the profile and the database aggregate");

  // admin tools still work
  const adm = await makeUser("adm");
  await User.updateOne({ _id: adm.id }, { $set: { role: "admin" } });
  const adminLogin = await api("POST", "/api/auth/login", null, { email: (await User.findById(adm.id)).email, password: "password123" });
  const list = await api("GET", "/api/admin/ratings", adminLogin.json.token);
  assert.equal(list.status, 200); assert.ok(list.json.data.length >= 2);
  const del = await api("DELETE", `/api/admin/ratings/${list.json.data[0].id}`, adminLogin.json.token);
  assert.equal(del.status, 200);
  const full = await api("GET", `/api/admin/users/${provider.id}/full`, adminLogin.json.token);
  assert.equal(full.status, 200); assert.ok(full.json.data.ratingSummary.overall);
  ok("admin rating moderation and full-user view still work");

  console.log(`\n🎉 ${passed} integration checks passed`);
} catch (err) {
  failed = true;
  console.error("\n❌ FAILED:", err);
} finally {
  await new Promise((r) => server.close(r));
  await mongoose.disconnect();
  await mongo.stop();
  process.exit(failed ? 1 : 0);
}
