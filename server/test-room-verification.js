/**
 * End-to-end test of owner/property verification, room listing rules, duplicate detection,
 * availability / double-booking protection, mutual-consent termination and document privacy.
 * Uses an in-memory MongoDB, exactly like test-reviews-and-reports.js:
 *
 *   npm run test:room-verification --prefix server
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const PORT = 5004;
const BASE = `http://127.0.0.1:${PORT}`;
const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "lc-vault-e2e-"));

let total = 0;
let passed = 0;
function check(condition, name, detail = "") {
  total += 1;
  if (condition) {
    passed += 1;
    console.log(`✅ [PASS] ${name}`);
  } else {
    console.error(`❌ [FAIL] ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

async function api(method, url, token, body) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON response */
  }
  return { status: res.status, json };
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pngBytes = (marker = "") => Buffer.concat([PNG_SIG, Buffer.from(marker), crypto.randomBytes(64)]);

async function uploadForm(url, token, fields, fileField, bytes, filename, mime) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  if (bytes) form.append(fileField, new Blob([bytes], { type: mime }), filename);
  const res = await fetch(`${BASE}${url}`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* ignore */
  }
  return { status: res.status, json };
}

const uploadDoc = (url, token, docType, bytes, filename = "doc.png", mime = "image/png") =>
  uploadForm(url, token, { docType }, "document", bytes, filename, mime);

// Uploads a listing photo through the platform's own media endpoint and returns the photo object.
const uploadedPhotoFiles = [];
async function uploadPhoto(token, bytes = pngBytes("photo")) {
  const res = await uploadForm("/api/upload/media", token, {}, "files", bytes, "room.png", "image/png");
  const file = res.json?.files?.[0];
  if (file) uploadedPhotoFiles.push(file.url);
  return file;
}

const tomorrow = () => new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);

async function main() {
  console.log("🧪 Room verification, ownership, availability & tenancy — end-to-end test");
  const mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  // This suite covers multi-unit properties (many rooms in one building without individual GPS pins), so the one-room-per-GPS-spot
  // rule is switched off here; it is covered by test-room-location.js.
  process.env.ROOM_DUPLICATE_RADIUS_M = "0";
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "test_super_secret_jwt_key_12345_minimum_32_chars";
  process.env.PORT = String(PORT);
  process.env.PRIVATE_UPLOAD_DIR = vaultDir;

  const { server } = await import("./index.js");
  await new Promise((r) => setTimeout(r, 1500));

  const { User } = await import("./src/models/User.js");
  const { Listing } = await import("./src/models/Listing.js");
            const { Property, Room, VerificationDocument, OwnerPermission, Tenancy } = await import("./src/roomVerification.js");
  const { signToken } = await import("./src/middleware/auth.js");
  await Promise.all([User, Property, Room, Tenancy, OwnerPermission].map((m) => m.init())); // make sure unique indexes exist

  const stamp = Date.now();
  async function signup(name) {
    const r = await api("POST", "/api/auth/signup", null, { name, email: `${name.toLowerCase().replace(/\s/g, "")}_${stamp}@example.com`, password: "password123", area: "Nainital" });
    return { token: r.json.token, id: r.json.user.id, code: r.json.user.userCode, user: r.json.user, status: r.status };
  }

  try {
    // ------------------------------------------------------------------ 1. Auto-generated IDs
    console.log("\n1) Automatic User / Property / Room IDs");
    const owner = await signup("Olivia Owner");
    const other = await signup("Tara Tenant");
    check(/^USR-[0-9A-HJKMNP-TV-Z]{8}$/.test(owner.code || ""), "New user gets an auto-generated User ID", owner.code);
    check(owner.code !== other.code, "User IDs are unique");
    check(/^USR-/.test((await api("GET", "/api/auth/me", owner.token)).json.user.userCode), "User ID is returned by /auth/me");
    const adminPass = await bcrypt.hash("Admin12345", 10);
    const adminDoc = await User.create({ name: "Site Admin", email: `admin_${stamp}@example.com`, passwordHash: adminPass, role: "admin" });
    const admin = { token: signToken({ id: adminDoc._id.toString(), role: "admin" }), id: adminDoc._id.toString() };
    // A user created before the feature existed (no userCode) is given one on first use
    const legacyUserDoc = await User.collection.insertOne({ name: "Legacy Lenny", email: `legacy_${stamp}@example.com`, passwordHash: adminPass, role: "user", area: "", phone: "", isBanned: false, suspensionStatus: "none", reportCount: 0, createdAt: new Date(), updatedAt: new Date() });
    const legacyToken = signToken({ id: legacyUserDoc.insertedId.toString(), role: "user" });
    const legacyMe = await api("GET", "/api/auth/me", legacyToken);
    check(/^USR-/.test(legacyMe.json?.user?.userCode || ""), "Pre-existing user receives a User ID automatically");

    // ------------------------------------------------------------------ 2. Cannot list without verification
    console.log("\n2) Unverified users cannot list rooms (enforced by the backend)");
    let r = await api("POST", "/api/rooms", owner.token, { title: "Sneaky room", rent: 5000, locality: "Nainital" });
    check(r.status === 400 && r.json.code === "PROPERTY_REQUIRED", "Web API: room without a verified property is refused", `${r.status} ${r.json?.code}`);
    r = await api("POST", "/api/v1/listings", owner.token, { type: "room", title: "Sneaky mobile room", locality: "Nainital", roomDetails: { rent: 5000 } });
    check(r.status === 400 && r.json.code === "PROPERTY_REQUIRED", "Mobile API: room without a verified property is refused", `${r.status} ${r.json?.code}`);
    r = await api("POST", "/api/rooms", owner.token, { title: "Fake property room", rent: 5000, propertyId: "PRP-ABCDEFGH", unitNumber: "1" });
    check(r.status === 403, "A made-up property ID is refused", String(r.status));
    r = await api("POST", "/api/rooms", owner.token, { title: "Verified flag room", rent: 5000, verified: true, isVerified: true });
    check(r.status === 400, "Client-sent 'verified' flags do not bypass the check", String(r.status));
    r = await api("POST", "/api/rentals", owner.token, { name: "Activa", rate: 100, type: "Scooty" });
    check(r.status === 201, "Non-room listings (vehicle) are unaffected", String(r.status));

    // ------------------------------------------------------------------ 3. Identity documents (private)
    console.log("\n3) Identity documents: validation, privacy and encryption");
    const marker = `SECRET-ID-${crypto.randomBytes(6).toString("hex")}`;
    const idBytes = pngBytes(marker);
    let up = await uploadDoc("/api/verification/identity/documents", owner.token, "aadhaar", Buffer.from("<html><script>alert(1)</script></html>"), "id.png", "image/png");
    check(up.status === 400 && up.json.code === "INVALID_FILE_TYPE", "A disguised non-image file is rejected by its real bytes", `${up.status} ${up.json?.code}`);
    up = await uploadDoc("/api/verification/identity/documents", owner.token, "library_card", idBytes);
    check(up.status === 400 && up.json.code === "INVALID_DOC_TYPE", "Unknown document type is rejected");
    up = await uploadDoc("/api/verification/identity/documents", null, "aadhaar", idBytes);
    check(up.status === 401, "Uploading requires login");
    up = await uploadDoc("/api/verification/identity/documents", owner.token, "aadhaar", idBytes, "my-aadhaar.png");
    check(up.status === 201 && up.json.data.identityStatus === "pending", "Valid identity document accepted -> status pending");
    const idDocId = up.json?.data?.document?.id;
    check(!/storageKey|"iv"|"tag"|sha256/.test(JSON.stringify(up.json)), "API response never exposes storage details");

    const files = fs.readdirSync(vaultDir);
    check(files.length >= 1, "Encrypted file exists in the private vault");
    check(files.every((f) => !fs.readFileSync(path.join(vaultDir, f)).includes(Buffer.from(marker))), "Document content is NOT stored in plaintext on disk");

    let dl = await fetch(`${BASE}/api/verification/documents/${idDocId}/file`);
    check(dl.status === 401, "Unauthenticated download is refused");
    dl = await fetch(`${BASE}/api/verification/documents/${idDocId}/file`, { headers: { Authorization: `Bearer ${other.token}` } });
    check(dl.status === 404, "Another user cannot download someone else's document");
    dl = await fetch(`${BASE}/api/verification/documents/${idDocId}/file`, { headers: { Authorization: `Bearer ${owner.token}` } });
    const downloaded = Buffer.from(await dl.arrayBuffer());
    check(dl.status === 200 && downloaded.equals(idBytes), "Owner can download their own document (decrypted correctly)");
    check(/no-store/.test(dl.headers.get("cache-control") || "") && dl.headers.get("x-content-type-options") === "nosniff", "Document responses are non-cacheable and nosniff");
    dl = await fetch(`${BASE}/api/verification/documents/${idDocId}/file`, { headers: { Authorization: `Bearer ${admin.token}` } });
    check(dl.status === 200, "Administrator can view the document for review");
    const storedDoc = await VerificationDocument.findById(idDocId);
    const direct = await fetch(`${BASE}/uploads/${storedDoc.storageKey}`);
    const direct2 = await fetch(`${BASE}/private_uploads/verification/${storedDoc.storageKey}`);
    check(direct.status === 404 && direct2.status === 404, "Documents are not reachable through any public URL");

    // the same file uploaded by a different account is flagged for the admin
    await uploadDoc("/api/verification/identity/documents", other.token, "aadhaar", idBytes, "borrowed.png");
    const queue = await api("GET", "/api/admin/verifications?status=pending", admin.token);
    const flagged = queue.json?.data?.identity?.find((x) => x.user.id === other.id)?.documents?.[0];
    check(flagged?.duplicateUploadFlag === true, "Reusing someone else's identity file is flagged for the admin");
    const nonAdminQueue = await api("GET", "/api/admin/verifications", owner.token);
    check(nonAdminQueue.status === 403, "Non-admins cannot open the review queue");
    // clean up the borrower so they can act as a normal tenant later
    const otherDocs = await VerificationDocument.find({ uploaderId: other.id });
    for (const d of otherDocs) await api("DELETE", `/api/verification/documents/${d._id}`, other.token);

    // ------------------------------------------------------------------ 4. Property registration + duplicate address
    console.log("\n4) Property registration and duplicate-address detection");
    const addr = { addressLine1: "Flat 302, Sunrise Apartments", addressLine2: "Mall Road", locality: "Tallital", city: "Nainital", state: "Uttarakhand", pincode: "263002", latitude: 29.3919, longitude: 79.4542 };
    r = await api("POST", "/api/properties", owner.token, { ...addr, pincode: "12" });
    check(r.status === 400, "Invalid PIN code is rejected");
    r = await api("POST", "/api/properties", owner.token, addr);
    check(r.status === 201 && /^PRP-[0-9A-HJKMNP-TV-Z]{8}$/.test(r.json.data.propertyCode), "Property is registered with an auto-generated Property ID", r.json?.data?.propertyCode);
    const prop = r.json.data;
    r = await api("POST", "/api/properties", owner.token, { ...addr, addressLine1: "sunrise apt, flat no. 302", addressLine2: "Mall Rd" });
    check(r.status === 409 && r.json.code === "DUPLICATE_PROPERTY", "Same address typed differently is caught as a duplicate (same owner)");
    r = await api("POST", "/api/properties", other.token, { ...addr, addressLine1: "FLAT 302 Sunrise Apartments" });
    check(r.status === 409 && r.json.code === "PROPERTY_ALREADY_REGISTERED", "Another account cannot register the same address");
    check(!JSON.stringify(r.json).includes(owner.code) && !JSON.stringify(r.json).includes("Olivia"), "...and is not told who the existing owner is");
    r = await api("POST", "/api/properties", owner.token, { ...addr, addressLine1: "Flat 303, Sunrise Apartments" });
    check(r.status === 201, "A different flat in the same building is a different property");
    const prop2 = r.json.data;
    r = await api("GET", `/api/properties/${prop.id}`, other.token);
    check(r.status === 404, "A stranger cannot read a property's private address");

    // ------------------------------------------------------------------ 5. Ownership documents + admin review
    console.log("\n5) Ownership documents and administrator verification");
    up = await uploadDoc(`/api/properties/${prop.id}/documents`, other.token, "sale_deed", pngBytes("deed"));
    check(up.status === 404, "Only the owner can upload ownership documents for a property");
    up = await uploadDoc(`/api/properties/${prop.id}/documents`, owner.token, "sale_deed", pngBytes("deed"));
    check(up.status === 201 && up.json.data.ownershipStatus === "pending", "Ownership document accepted -> pending");
    await uploadDoc(`/api/properties/${prop2.id}/documents`, owner.token, "electricity_bill", pngBytes("bill"));

    r = await api("POST", "/api/rooms", owner.token, { title: "Room 1", rent: 7000, propertyId: prop.propertyCode, unitNumber: "1" });
    check(r.status === 403 && r.json.code === "PROPERTY_NOT_VERIFIED", "Pending documents are not enough to list a room");

    r = await api("PATCH", `/api/admin/verifications/property/${prop.id}`, admin.token, { decision: "approve" });
    check(r.status === 409 && r.json.code === "OWNER_IDENTITY_NOT_VERIFIED", "Admin cannot verify a property before the owner's identity");
    r = await api("PATCH", `/api/admin/verifications/identity/${owner.id}`, owner.token, { decision: "approve" });
    check(r.status === 403, "Users cannot verify themselves");
    r = await api("PATCH", `/api/admin/verifications/identity/${owner.id}`, admin.token, { decision: "reject" });
    check(r.status === 400, "Rejecting requires a reason");
    r = await api("PATCH", `/api/admin/verifications/identity/${owner.id}`, admin.token, { decision: "approve", note: "Matches profile" });
    check(r.status === 200, "Admin verifies the owner's identity");
    check((await api("GET", "/api/verification/me", owner.token)).json.data.identity.status === "verified", "Owner sees identity status 'verified'");
    r = await api("PATCH", `/api/admin/verifications/property/${prop.id}`, admin.token, { decision: "approve" });
    check(r.status === 200, "Admin verifies the property's ownership");
    r = await api("PATCH", `/api/admin/verifications/property/${prop2.id}`, admin.token, { decision: "approve" });
    check(r.status === 200, "Second property verified");

    // ------------------------------------------------------------------ 6. Listing a room
    console.log("\n6) Verified owner lists rooms");
    const photoA = await uploadPhoto(owner.token, pngBytes("photo-A"));
    const photoB = await uploadPhoto(owner.token, pngBytes("photo-B"));
    r = await api("POST", "/api/rooms", owner.token, { title: "Lake view single", rent: 7000, roomType: "1BHK", propertyId: prop.propertyCode, photos: [photoA] });
    check(r.status === 400 && r.json.code === "UNIT_REQUIRED", "A room needs a unit/room number");
    r = await api("POST", "/api/rooms", owner.token, { title: "External photo", rent: 7000, propertyId: prop.propertyCode, unitNumber: "9", photos: [{ url: "https://example.com/stolen.jpg" }] });
    check(r.status === 400 && r.json.code === "INVALID_PHOTO_SOURCE", "External image links are refused (cannot be checked for duplicates)");
    r = await api("POST", "/api/rooms", owner.token, { title: "Lake view single", rent: 7000, roomType: "1BHK", propertyId: prop.propertyCode, unitNumber: "Room 1", locality: "Somewhere Else", photos: [photoA], roomCode: "ROM-HACKED00" });
    check(r.status === 201 && /^ROM-[0-9A-HJKMNP-TV-Z]{8}$/.test(r.json.roomCode) && r.json.roomCode !== "ROM-HACKED00", "Room created with a server-generated Room ID", r.json?.roomCode);
    check(r.json.propertyCode === prop.propertyCode, "Room is linked to its property");
    check(r.json.locality === "Tallital", "Location comes from the verified property, not the client");
    const room1 = r.json;

    r = await api("GET", "/api/rooms");
    const publicRoom = r.json.find((x) => x.id === room1.id);
    check(!!publicRoom && publicRoom.roomCode === room1.roomCode, "Public list shows the Room ID");
    const publicJson = JSON.stringify(r.json);
    check(!publicJson.includes("Sunrise") && !publicJson.includes("Flat 302") && !publicJson.includes("263002"), "Public listing never exposes the private address");
    check(!/sha256|phash|addressKey/.test(publicJson), "Public listing never exposes fingerprints");

    // ------------------------------------------------------------------ 7. Duplicate detection
    console.log("\n7) Duplicate room detection (address, room details, photos)");
    r = await api("POST", "/api/rooms", owner.token, { title: "Again", rent: 9000, propertyId: prop.propertyCode, unitNumber: "room-1" });
    check(r.status === 409 && r.json.code === "DUPLICATE_ROOM" && r.json.existingRoomCode === room1.roomCode, "Same room/unit in the same property is refused");
    const copyOfPhotoA = await uploadPhoto(owner.token, fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "." + photoA.url)));
    r = await api("POST", "/api/rooms", owner.token, { title: "Same room, new label", rent: 7200, roomType: "1BHK", propertyId: prop.propertyCode, unitNumber: "Room 7", photos: [copyOfPhotoA] });
    check(r.status === 409 && r.json.code === "DUPLICATE_ROOM", "Same photos + type + similar rent under a different label is refused");
    r = await api("POST", "/api/rooms", owner.token, { title: "Different room, shared building photo", rent: 15000, roomType: "2BHK", propertyId: prop.propertyCode, unitNumber: "Room 2", photos: [copyOfPhotoA] });
    check(r.status === 201, "Shared building photo on a clearly different room in the same property is allowed", `${r.status} ${r.json?.code}`);
    r = await api("POST", "/api/rooms", owner.token, { title: "Photo reuse elsewhere", rent: 7000, roomType: "1BHK", propertyId: prop2.propertyCode, unitNumber: "Room 1", photos: [copyOfPhotoA] });
    check(r.status === 409 && r.json.code === "DUPLICATE_PHOTOS", "Photos already used by a room in another property are refused");
    const burst = await Promise.all(
      Array.from({ length: 5 }, () => api("POST", "/api/rooms", owner.token, { title: "Race room", rent: 6000, propertyId: prop2.propertyCode, unitNumber: "Race" }))
    );
    check(burst.filter((x) => x.status === 201).length === 1 && burst.filter((x) => x.status === 409).length === 4, "5 simultaneous requests for the same room create exactly one", burst.map((x) => x.status).join(","));
    // photo swap after creation cannot slip a duplicate in
    const room2 = (await api("GET", "/api/rooms")).json.find((x) => x.title === "Different room, shared building photo");
    const stolen = await uploadPhoto(owner.token, pngBytes("other-photo"));
    r = await api("POST", "/api/rooms", owner.token, { title: "Prop2 room", rent: 4000, roomType: "Single", propertyId: prop2.propertyCode, unitNumber: "Room 5", photos: [stolen] });
    const prop2Room = r.json;
    const copyOfStolen = await uploadPhoto(owner.token, fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "." + stolen.url)));
    r = await api("PATCH", `/api/rooms/${room2.id}`, owner.token, { photos: [copyOfStolen] });
    check(r.status === 409 && r.json.code === "DUPLICATE_PHOTOS", "Swapping in a duplicate photo later is also refused");

    // ------------------------------------------------------------------ 8. Tenants need verified owner permission
    console.log("\n8) Tenants cannot list without the verified owner's permission");
    r = await api("POST", "/api/rooms", other.token, { title: "Subletting without asking", rent: 3000, propertyId: prop.propertyCode, unitNumber: "Room 99" });
    check(r.status === 403 && r.json.code === "NOT_AUTHORIZED_FOR_PROPERTY", "A non-owner cannot list rooms for someone else's property");
    r = await api("POST", "/api/owner-permissions", other.token, { propertyId: prop.propertyCode, delegateUserCode: other.code });
    check(r.status === 404, "A non-owner cannot grant permission");
    r = await api("POST", "/api/owner-permissions", owner.token, { propertyId: prop.propertyCode, delegateUserCode: "USR-ZZZZZZZZ" });
    check(r.status === 404, "Unknown User ID is rejected");
    r = await api("POST", "/api/owner-permissions", owner.token, { propertyId: prop.propertyCode, delegateUserCode: other.code, note: "Caretaker" });
    check(r.status === 201, "Verified owner authorises the tenant by User ID");
    const permission = r.json.data;
    r = await api("POST", "/api/rooms", other.token, { title: "Annex room", rent: 3500, roomType: "Single", propertyId: prop.propertyCode, unitNumber: "Annex" });
    check(r.status === 201, "Authorised user can now list a room", `${r.status} ${r.json?.code}`);
    const annex = r.json;
    check((await Room.findOne({ listingId: annex.id }))?.listedVia === "permission", "Room records that it was listed under owner permission");
    r = await api("GET", `/api/properties/${prop.id}`, other.token);
    check(r.status === 200 && r.json.yourRole === "delegate" && r.json.data.documents === undefined, "Authorised user sees the property but never its documents");
    r = await api("PATCH", `/api/owner-permissions/${permission.id}/revoke`, owner.token);
    check(r.status === 200 && r.json.hiddenListings === 1, "Revoking permission takes their listings off the market");
    check(!(await api("GET", "/api/rooms")).json.some((x) => x.id === annex.id), "Revoked user's room is no longer public");
    r = await api("POST", "/api/rooms", other.token, { title: "Another annex", rent: 3500, propertyId: prop.propertyCode, unitNumber: "Annex 2" });
    check(r.status === 403, "...and they cannot list again");
    r = await api("PATCH", `/api/rooms/${annex.id}`, other.token, { status: "active" });
    check(r.status === 403, "...nor re-activate the hidden room");

    // ------------------------------------------------------------------ 9. Availability + double booking
    console.log("\n9) Availability tracking and double-booking prevention");
    const tenantB = other;
    const tenantC = await signup("Carl Candidate");
    const tenantD = await signup("Dina Dweller");
    r = await api("GET", `/api/room-availability/${room1.id}`);
    check(r.status === 200 && r.json.data.status === "available" && r.json.data.roomCode === room1.roomCode, "Public availability: available");
    r = await api("POST", "/api/tenancies", owner.token, { listingId: room1.id, startDate: tomorrow(), durationMonths: 6 });
    check(r.status === 400 && r.json.code === "OWN_ROOM", "Owners cannot book their own room");
    r = await api("POST", "/api/tenancies", tenantB.token, { listingId: room1.id, startDate: "2020-01-01", durationMonths: 6 });
    check(r.status === 400, "Start date in the past is refused");
    r = await api("POST", "/api/tenancies", tenantB.token, { listingId: room1.id, startDate: tomorrow(), durationMonths: 6, message: "Interested" });
    check(r.status === 201 && r.json.data.status === "pending", "Tenant requests the room");
    const reqB = r.json.data;
    check(reqB.address === undefined && reqB.counterpart.phone === undefined, "Private address / contact stay hidden until the request is accepted");
    r = await api("POST", "/api/tenancies", tenantB.token, { listingId: room1.id, startDate: tomorrow(), durationMonths: 6 });
    check(r.status === 409 && r.json.code === "ALREADY_REQUESTED", "Duplicate pending request is refused");
    r = await api("POST", "/api/tenancies", tenantC.token, { listingId: room1.id, startDate: tomorrow(), durationMonths: 3 });
    const reqC = r.json.data;
    check(r.status === 201, "A second tenant may also request (requests don't reserve)");
    r = await api("PATCH", `/api/tenancies/${reqB.id}/accept`, tenantB.token);
    check(r.status === 403, "The tenant cannot accept their own request");
    r = await api("PATCH", `/api/tenancies/${reqB.id}/accept`, tenantD.token);
    check(r.status === 404, "A stranger cannot see or act on the tenancy");
    r = await api("PATCH", `/api/tenancies/${reqB.id}/accept`, owner.token);
    check(r.status === 200 && r.json.data.status === "active", "Owner accepts: tenancy is active");
    const tenantView = await api("GET", `/api/tenancies/${reqB.id}`, tenantB.token);
    check(tenantView.json?.data?.address?.line1 === addr.addressLine1, "Once accepted, the tenant sees the full address");
    r = await api("PATCH", `/api/tenancies/${reqC.id}/accept`, owner.token);
    check(r.status === 409, "Competing request can no longer be accepted (room is taken)", `${r.status} ${r.json?.code}`);
    check((await Tenancy.findById(reqC.id)).status === "declined", "Competing request was auto-declined");
    r = await api("GET", `/api/room-availability/${room1.id}`);
    check(r.json.data.status === "occupied", "Public availability: occupied");
    check(!(await api("GET", "/api/rooms")).json.some((x) => x.id === room1.id), "Occupied room leaves the public list");
    r = await api("POST", "/api/tenancies", tenantD.token, { listingId: room1.id, startDate: tomorrow(), durationMonths: 2 });
    check(r.status === 409 && r.json.code === "ROOM_NOT_AVAILABLE", "Cannot request an occupied room");
    r = await api("PATCH", `/api/rooms/${room1.id}`, owner.token, { status: "active" });
    check(r.status === 409 && r.json.code === "ROOM_OCCUPIED", "Owner cannot re-list an occupied room");

    // simultaneous accepts on another room: exactly one wins
    const prop2RoomId = prop2Room.id;
    const [p1, p2] = await Promise.all([
      api("POST", "/api/tenancies", tenantC.token, { listingId: prop2RoomId, startDate: tomorrow(), durationMonths: 4 }),
      api("POST", "/api/tenancies", tenantD.token, { listingId: prop2RoomId, startDate: tomorrow(), durationMonths: 4 }),
    ]);
    const accepts = await Promise.all([
      api("PATCH", `/api/tenancies/${p1.json.data.id}/accept`, owner.token),
      api("PATCH", `/api/tenancies/${p2.json.data.id}/accept`, owner.token),
    ]);
    check(accepts.filter((x) => x.status === 200).length === 1, "Two simultaneous accepts: exactly ONE tenant gets the room", accepts.map((x) => x.status).join(","));
    check((await Tenancy.countDocuments({ roomId: (await Room.findOne({ listingId: prop2RoomId }))._id, holdsRoom: true })) === 1, "Database holds exactly one active tenancy for the room");

    // ended tenancies free the room automatically
    const lapsingRoom = (await api("POST", "/api/rooms", owner.token, { title: "Lapsing room", rent: 4100, roomType: "Single", propertyId: prop2.propertyCode, unitNumber: "Room 6" })).json;
    const lapsingRoomDoc = await Room.findOne({ listingId: lapsingRoom.id });
    const old = await Tenancy.create({ roomId: lapsingRoomDoc._id, listingId: lapsingRoom.id, ownerId: owner.id, tenantId: tenantD.id, status: "active", holdsRoom: true, startDate: new Date("2026-01-01"), endDate: new Date("2026-02-01"), durationMonths: 1 });
    await Room.updateOne({ _id: lapsingRoomDoc._id }, { $set: { "occupancy.status": "occupied", "occupancy.tenancyId": old._id } });
    await Listing.updateOne({ _id: lapsingRoom.id }, { $set: { status: "closed" } });
    await Room.updateOne({ _id: lapsingRoomDoc._id }, { $set: { autoClosedByTenancy: true } });
    r = await api("GET", `/api/room-availability/${lapsingRoom.id}`);
    check(r.json.data.status === "available", "A tenancy past its end date frees the room automatically");
    check((await Tenancy.findById(old._id)).status === "completed", "...and is marked completed");
    check((await api("GET", "/api/rooms")).json.some((x) => x.id === lapsingRoom.id), "...and the listing re-opens");

    // ------------------------------------------------------------------ 10. Early termination needs BOTH
    console.log("\n10) Early termination requires the consent of both owner and tenant");
    const tenancyId = reqB.id;
    r = await api("POST", `/api/tenancies/${tenancyId}/termination`, tenantD.token, { reason: "I am a stranger" });
    check(r.status === 404, "A stranger cannot request termination");
    r = await api("POST", `/api/tenancies/${tenancyId}/termination`, tenantB.token, { reason: "Relocating for work" });
    check(r.status === 201 && r.json.data.status === "active" && r.json.data.termination.status === "pending", "Tenant requests early termination: tenancy stays ACTIVE");
    check((await Room.findOne({ listingId: room1.id })).occupancy.status === "occupied", "Room stays occupied after a one-sided request");
    r = await api("POST", `/api/tenancies/${tenancyId}/termination/respond`, tenantB.token, { agree: true });
    check(r.status === 403 && r.json.code === "CANNOT_SELF_APPROVE", "The requester cannot approve their own request");
    r = await api("POST", `/api/tenancies/${tenancyId}/termination`, owner.token, { reason: "Counter request" });
    check(r.status === 409 && r.json.code === "TERMINATION_ALREADY_PENDING", "Only one open request at a time");
    r = await api("POST", `/api/tenancies/${tenancyId}/termination/respond`, owner.token, { agree: false });
    check(r.status === 200 && r.json.outcome === "rejected" && r.json.data.status === "active", "Owner rejects: tenancy continues");
    r = await api("POST", `/api/tenancies/${tenancyId}/termination`, owner.token, { reason: "Need the room for family" });
    check(r.status === 201 && r.json.data.status === "active", "Owner requests early termination: still ACTIVE until the tenant agrees");
    r = await api("POST", `/api/tenancies/${tenancyId}/termination/withdraw`, tenantB.token);
    check(r.status === 403, "Only the requester can withdraw");

    // protection against ending the tenancy through other doors
    r = await api("DELETE", `/api/rooms/${room1.id}`, owner.token);
    check(r.status === 409 && r.json.code === "ROOM_HAS_ACTIVE_TENANCY", "Owner cannot delete an occupied room (would bypass consent)");
    r = await api("DELETE", `/api/admin/listings/${room1.id}`, admin.token);
    check(r.status === 409, "Admin deletion of an occupied room is also blocked (hide it instead)");
    r = await api("DELETE", "/api/auth/me", tenantB.token, { password: "password123" });
    check(r.status === 409 && r.json.code === "ACTIVE_TENANCY", "Tenant cannot delete their account during an active tenancy");
    r = await api("DELETE", `/api/admin/users/${owner.id}`, admin.token);
    check(r.status === 409, "Admin cannot delete an owner who has an active tenancy");

    r = await api("POST", `/api/tenancies/${tenancyId}/termination/respond`, tenantB.token, { agree: true });
    check(r.status === 200 && r.json.outcome === "agreed" && r.json.data.status === "terminated", "Tenant agrees: BOTH consented -> tenancy terminated");
    check(r.json.data.termination.ownerConsent === true && r.json.data.termination.tenantConsent === true, "Both consents are recorded");
    r = await api("GET", `/api/room-availability/${room1.id}`);
    check(r.json.data.status === "available", "Room is available again after the agreed termination");
    check((await api("GET", "/api/rooms")).json.some((x) => x.id === room1.id), "Listing re-opens automatically");
    r = await api("POST", `/api/tenancies/${tenancyId}/termination`, tenantB.token, { reason: "Trying again" });
    check(r.status === 409, "A terminated tenancy cannot be terminated again");

    // ------------------------------------------------------------------ 11. Revocation + erasure
    console.log("\n11) Revoked verification and data erasure");
    r = await api("PATCH", `/api/admin/verifications/property/${prop.id}`, admin.token, { decision: "reject", note: "Documents were forged" });
    check(r.status === 200, "Admin can revoke a property's verification");
    check(!(await api("GET", "/api/rooms")).json.some((x) => x.id === room1.id || x.id === room2.id), "Its rooms are taken off the market immediately");
    r = await api("PATCH", `/api/rooms/${room1.id}`, owner.token, { status: "active" });
    check(r.status === 403 && r.json.code === "PROPERTY_NOT_VERIFIED", "The owner cannot simply re-activate them");
    r = await api("POST", "/api/tenancies", tenantD.token, { listingId: room1.id, startDate: tomorrow(), durationMonths: 2 });
    check(r.status === 409, "Hidden rooms cannot be booked");

    const ownerDocFiles = (await VerificationDocument.find({ uploaderId: owner.id })).map((d) => d.storageKey);
    // end every running tenancy for the owner so deletion is allowed
    await Tenancy.updateMany({ holdsRoom: true }, { $set: { holdsRoom: false, status: "completed" } });
    r = await api("DELETE", "/api/auth/me", owner.token, { password: "password123" });
    check(r.status === 200, "Owner can delete their account once no tenancy is running");
    check(ownerDocFiles.length > 0 && ownerDocFiles.every((k) => !fs.existsSync(path.join(vaultDir, k))), "Their encrypted documents are erased from disk");
    check((await VerificationDocument.countDocuments({ uploaderId: owner.id })) === 0 && (await Property.countDocuments({ ownerId: owner.id })) === 0, "Their document records and properties are erased");
  } catch (err) {
    check(false, "Unexpected test crash", err.stack || err.message);
  } finally {
    for (const url of uploadedPhotoFiles) fs.rmSync(path.join(path.dirname(new URL(import.meta.url).pathname), "." + url), { force: true });
    fs.rmSync(vaultDir, { recursive: true, force: true });
    await new Promise((r) => server.close(r));
    await mongoose.disconnect();
    await mongo.stop();
  }

  console.log(`\n${passed === total ? "✅" : "❌"} ${passed}/${total} checks passed`);
  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
