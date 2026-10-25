/**
 * Unit tests for the room-verification building blocks. No database or network needed:
 *   node test-room-verification-unit.js      (or: npm run test:room-verification:unit)
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "unit_test_secret_that_is_long_enough_123456";
process.env.PRIVATE_UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "lc-vault-"));

// Everything lives in the single feature file.
const all = await import("./src/roomVerification.js");
const { generateCode, isValidCode, generateUniqueCode, randomCode } = all;
const address = all;
const vault = all;
const photos = all;
const rules = all;

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`✅ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`❌ ${name}\n   ${err.message}`);
  }
}

// ---------------------------------------------------------------- IDs
await test("IDs: correct prefixes and format for User / Property / Room", () => {
  assert.match(generateCode("user"), /^USR-[0-9A-HJKMNP-TV-Z]{8}$/);
  assert.match(generateCode("property"), /^PRP-[0-9A-HJKMNP-TV-Z]{8}$/);
  assert.match(generateCode("room"), /^ROM-[0-9A-HJKMNP-TV-Z]{8}$/);
  assert.ok(isValidCode("room", "rom-7k3m9qxd"));
  assert.ok(!isValidCode("room", "USR-7K3M9QXD"));
  assert.ok(!isValidCode("room", "ROM-7K3M9QXI")); // 'I' is not in the alphabet
});

await test("IDs: 20,000 generated codes are all unique", () => {
  const seen = new Set();
  for (let i = 0; i < 20000; i += 1) seen.add(generateCode("room"));
  assert.equal(seen.size, 20000);
});

await test("IDs: only uses the unbiased 32-symbol alphabet", () => {
  const sample = Array.from({ length: 500 }, () => randomCode(8)).join("");
  assert.match(sample, /^[0-9A-HJKMNP-TV-Z]+$/);
});

await test("IDs: generateUniqueCode retries on collision and gives up eventually", async () => {
  let calls = 0;
  const code = await generateUniqueCode("user", async () => {
    calls += 1;
    return calls < 3; // first two "exist"
  });
  assert.equal(calls, 3);
  assert.match(code, /^USR-/);
  await assert.rejects(() => generateUniqueCode("user", async () => true), /Could not generate/);
});

// ---------------------------------------------------------------- Address
const A = { line1: "Flat 302, Sunrise Apartments", line2: "MG Road", locality: "Indiranagar", city: "Bengaluru", state: "Karnataka", pincode: "560038" };

await test("Address: same address typed differently has the same fingerprint", () => {
  // Same address with different case, punctuation, abbreviations, word order and field split
  const C = { line1: "Sunrise Apt, Flat 302", line2: "MG Rd", locality: "Indiranagar", city: "Bengaluru", state: "Karnataka", pincode: "560038" };
  assert.equal(address.addressKey(A), address.addressKey(C));
  assert.notEqual(address.addressKey(A), address.addressKey({ ...A, pincode: "560039" }));
  assert.ok(address.isSameProperty(A, C));
});

await test("Address: different flat number in the same building is NOT a duplicate", () => {
  const other = { ...A, line1: "Flat 303, Sunrise Apartments" };
  assert.ok(address.addressSimilarity(A, other) <= 0.5);
  assert.ok(!address.isSameProperty(A, other));
});

await test("Address: same address with extra words scores high; landmark is ignored for matching", () => {
  const near = { ...A, line2: "MG Road Near Metro" };
  assert.ok(address.addressSimilarity(A, near) >= 0.7);
  const nearer = { ...A, landmark: "Opposite Metro" }; // landmark ignored
  assert.ok(address.isSameProperty(A, nearer));
});

await test("Address: different pincode or city is never a duplicate", () => {
  assert.equal(address.addressSimilarity(A, { ...A, pincode: "110001" }), 0);
  assert.ok(!address.isSameProperty(A, { ...A, pincode: "110001" }));
});

await test("Address: pincode validation and unit keys", () => {
  assert.ok(address.PINCODE_REGEX.test("560038"));
  assert.ok(!address.PINCODE_REGEX.test("060038"));
  assert.ok(!address.PINCODE_REGEX.test("56003"));
  assert.equal(address.unitKeyOf("Room 2"), address.unitKeyOf("room-2"));
  assert.notEqual(address.unitKeyOf("Room 2"), address.unitKeyOf("Room 3"));
});

await test("Address: same address with extra landmark/line words is still a duplicate", () => {
  const base = { line1: "12 Gandhi Road", locality: "Shastri Nagar", city: "Meerut", state: "Uttar Pradesh", pincode: "250003" };
  assert.ok(address.isSameProperty(base, { ...base, line1: "12 Gandhi Road near Hanuman Mandir" }));
  assert.ok(address.isSameProperty(base, { ...base, line2: "Near Water Tank" }));
  // still different: another street, another house number, another pincode, another flat
  assert.ok(!address.isSameProperty(base, { ...base, line1: "12 Nehru Road" }));
  assert.ok(!address.isSameProperty(base, { ...base, line1: "14 Gandhi Road near Hanuman Mandir" }));
  assert.ok(!address.isSameProperty(base, { ...base, pincode: "250001", line1: "12 Gandhi Road near Hanuman Mandir" }));
});

await test("Address: same GPS spot + overlapping words is the same place; far away or other house number is not", () => {
  const base = { line1: "12 Gandhi Road", locality: "Shastri Nagar", city: "Meerut", state: "Uttar Pradesh", pincode: "250003" };
  const P = { address: base, latitude: 28.9845, longitude: 77.7064 };
  assert.ok(address.isSamePlaceByGeo(P, { address: { ...base, line1: "Gandhi Rd house 12" }, latitude: 28.98452, longitude: 77.70642 }));
  assert.ok(!address.isSamePlaceByGeo(P, { address: base, latitude: 28.9872, longitude: 77.7064 }));
  assert.ok(!address.isSamePlaceByGeo(P, { address: { ...base, line1: "14 Gandhi Road" }, latitude: 28.9845, longitude: 77.7064 }));
});

await test("Address: unit labels Room 2 / R2 / Room No. 2 / 2 are one unit", () => {
  const k = address.unitKeyOf;
  assert.equal(k("Room 2"), k("R2"));
  assert.equal(k("Room 2"), k("Room No. 2"));
  assert.equal(k("Room 2"), k("2"));
  assert.notEqual(k("Room 2"), k("Room 3"));
  assert.equal(k("Flat 302"), k("302"));
});

// ---------------------------------------------------------------- Vault
await test("Vault: sniffs real file types and rejects disguised files", () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
  const pdf = Buffer.from("%PDF-1.7\n" + "x".repeat(40));
  const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(16)]);
  assert.equal(vault.sniffMime(png), "image/png");
  assert.equal(vault.sniffMime(jpg), "image/jpeg");
  assert.equal(vault.sniffMime(pdf), "application/pdf");
  assert.equal(vault.sniffMime(webp), "image/webp");
  assert.equal(vault.sniffMime(Buffer.from("<html><script>alert(1)</script></html>")), null);
  assert.equal(vault.sniffMime(Buffer.from("MZ" + "\0".repeat(40))), null); // executable
});

await test("Vault: encrypts at rest, round-trips, and the file on disk is not plaintext", async () => {
  const secret = Buffer.from("%PDF-1.4 AADHAAR 1234 5678 9012 -- highly sensitive");
  const stored = await vault.storeEncrypted(secret);
  const onDisk = fs.readFileSync(path.join(vault.getVaultDir(), stored.storageKey));
  assert.ok(!onDisk.includes(Buffer.from("AADHAAR")), "plaintext must not be on disk");
  assert.ok(!onDisk.equals(secret));
  const back = await vault.readDecrypted(stored);
  assert.ok(back.equals(secret));
  assert.equal(fs.statSync(path.join(vault.getVaultDir(), stored.storageKey)).mode & 0o077, 0, "file must be owner-only");
  await vault.deleteStored(stored.storageKey);
  assert.ok(!fs.existsSync(path.join(vault.getVaultDir(), stored.storageKey)));
});

await test("Vault: tampering or a wrong tag/record is detected", async () => {
  const stored = await vault.storeEncrypted(Buffer.from("%PDF-1.4 original content here"));
  const file = path.join(vault.getVaultDir(), stored.storageKey);
  const bytes = fs.readFileSync(file);
  bytes[0] ^= 0xff;
  fs.writeFileSync(file, bytes);
  await assert.rejects(() => vault.readDecrypted(stored));

  const other = await vault.storeEncrypted(Buffer.from("%PDF-1.4 another document"));
  // ciphertext swapped between records must not decrypt (AAD binds ciphertext to its record)
  const swapped = { storageKey: stored.storageKey, iv: other.iv, tag: other.tag };
  await assert.rejects(() => vault.readDecrypted(swapped));
});

await test("Vault: path traversal in storage key cannot escape the vault", async () => {
  await assert.rejects(() => vault.readDecrypted({ storageKey: "../../../../etc/passwd", iv: "AAAA", tag: "AAAA" }));
  assert.equal(vault.sanitizeFileName("../../etc/passwd"), "passwd");
  assert.equal(vault.sanitizeFileName("a<b>c.pdf"), "a_b_c.pdf");
});

await test("Vault: production refuses to run without a real encryption key", () => {
  const prevEnv = process.env.NODE_ENV;
  const prevKey = process.env.DOCUMENT_ENCRYPTION_KEY;
  try {
    process.env.NODE_ENV = "production";
    delete process.env.DOCUMENT_ENCRYPTION_KEY;
    assert.throws(() => vault.getEncryptionKey(), /not configured/);
    process.env.DOCUMENT_ENCRYPTION_KEY = "short";
    assert.throws(() => vault.getEncryptionKey(), /64 hexadecimal/);
    process.env.DOCUMENT_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
    assert.equal(vault.getEncryptionKey().length, 32);
  } finally {
    process.env.NODE_ENV = prevEnv;
    if (prevKey === undefined) delete process.env.DOCUMENT_ENCRYPTION_KEY;
    else process.env.DOCUMENT_ENCRYPTION_KEY = prevKey;
  }
});

// ---------------------------------------------------------------- Photos
await test("Photos: only platform uploads are accepted (no external URLs, no traversal)", () => {
  assert.ok(photos.resolveLocalUploadPath("/uploads/listings/abc-123.jpg"));
  assert.equal(photos.resolveLocalUploadPath("https://evil.example/uploads/listings/abc.jpg"), null);
  assert.equal(photos.resolveLocalUploadPath("/uploads/listings/../../.env"), null);
  assert.equal(photos.resolveLocalUploadPath("/uploads/listings/a/b.jpg"), null);
  assert.equal(photos.resolveLocalUploadPath("http://localhost:5000/uploads/listings/a.jpg"), null);
  assert.equal(photos.resolveLocalUploadPath(null), null);
});

await test("Photos: identical files fingerprint identically; overlap ratio and Hamming logic", async () => {
  const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "uploads/listings");
  fs.mkdirSync(dir, { recursive: true });
  const names = ["unit-test-a.jpg", "unit-test-b.jpg", "unit-test-c.jpg"];
  const content = [crypto.randomBytes(2048), crypto.randomBytes(2048), crypto.randomBytes(2048)];
  names.forEach((n, i) => fs.writeFileSync(path.join(dir, n), content[i]));
  fs.writeFileSync(path.join(dir, "unit-test-a-copy.jpg"), content[0]);
  try {
    const one = await photos.fingerprintPhotos([`/uploads/listings/${names[0]}`, { url: `/uploads/listings/${names[1]}` }]);
    const copy = await photos.fingerprintPhotos(["/uploads/listings/unit-test-a-copy.jpg"]);
    const unrelated = await photos.fingerprintPhotos([`/uploads/listings/${names[2]}`]);
    assert.equal(one.invalid.length, 0);
    assert.equal(one.entries[0].sha256, copy.entries[0].sha256, "copy of the same file must match");
    assert.equal(photos.photoOverlapRatio(copy.entries, one.entries), 1);
    assert.equal(photos.photoOverlapRatio(unrelated.entries, one.entries), 0);

    const dup = await photos.fingerprintPhotos([`/uploads/listings/${names[0]}`, `/uploads/listings/${names[0]}`]);
    assert.equal(dup.entries.length, 1, "same file attached twice counts once");

    const bad = await photos.fingerprintPhotos(["/uploads/listings/does-not-exist.jpg", "https://x.y/z.jpg"]);
    assert.equal(bad.invalid.length, 2);
  } finally {
    [...names, "unit-test-a-copy.jpg"].forEach((n) => fs.rmSync(path.join(dir, n), { force: true }));
  }
  assert.equal(photos.hammingDistanceHex("ffffffffffffffff", "ffffffffffffffff"), 0);
  assert.equal(photos.hammingDistanceHex("0000000000000000", "000000000000000f"), 4);
  assert.equal(photos.hammingDistanceHex("00", "0000"), Infinity);
  const near = [{ sha256: "x", phash: "0000000000000007" }];
  assert.equal(photos.photoOverlapRatio([{ sha256: "y", phash: "0000000000000000" }], near), 1); // distance 3
  assert.equal(photos.photoOverlapRatio([{ sha256: "y", phash: "00000000000000ff" }], near), 1); // distance 5 <= 6 still matches
  assert.equal(photos.photoOverlapRatio([{ sha256: "y", phash: "0000000000000fff" }], near), 0); // distance 9 > 6 does not
});

// ---------------------------------------------------------------- Tenancy rules
const NOW = new Date("2026-10-24T10:00:00Z");

await test("Tenancy: booking input validation", () => {
  const ok = rules.parseBookingInput({ startDate: "2026-11-01", durationMonths: 6, message: " hi " }, NOW);
  assert.ok(ok.ok);
  assert.equal(ok.value.endDate.toISOString(), "2027-05-01T00:00:00.000Z");
  assert.equal(ok.value.message, "hi");
  assert.equal(rules.parseBookingInput({ startDate: "2026-10-23", durationMonths: 6 }, NOW).code, "INVALID_START_DATE");
  assert.equal(rules.parseBookingInput({ startDate: "2026-10-24", durationMonths: 6 }, NOW).ok, true); // today is fine
  assert.equal(rules.parseBookingInput({ startDate: "nope", durationMonths: 6 }, NOW).code, "INVALID_START_DATE");
  assert.equal(rules.parseBookingInput({ startDate: "2026-11-01", durationMonths: 0 }, NOW).code, "INVALID_DURATION");
  assert.equal(rules.parseBookingInput({ startDate: "2026-11-01", durationMonths: 99 }, NOW).code, "INVALID_DURATION");
  assert.equal(rules.parseBookingInput({ startDate: "2026-11-01", durationMonths: 1.5 }, NOW).code, "INVALID_DURATION");
  assert.equal(rules.parseBookingInput({ startDate: "2029-01-01", durationMonths: 3 }, NOW).code, "INVALID_START_DATE");
  assert.equal(
    rules.parseBookingInput({ startDate: "2026-11-01", durationMonths: 3 }, NOW, { availableFrom: new Date("2026-12-01") }).code,
    "BEFORE_AVAILABLE_FROM"
  );
});

await test("Tenancy: month arithmetic clamps to month end", () => {
  assert.equal(rules.addMonthsUtc(new Date("2026-01-31T00:00:00Z"), 1).toISOString(), "2026-02-28T00:00:00.000Z");
  assert.equal(rules.addMonthsUtc(new Date("2026-11-15T00:00:00Z"), 12).toISOString(), "2027-11-15T00:00:00.000Z");
  assert.equal(rules.addMonthsUtc(new Date("2026-12-31T00:00:00Z"), 2).toISOString(), "2027-02-28T00:00:00.000Z");
});

const activeTenancy = (over = {}) => ({
  ownerId: "o1",
  tenantId: "t1",
  status: "active",
  endDate: new Date("2027-04-01T00:00:00Z"),
  termination: { status: "none" },
  ...over,
});

await test("Termination: a single party can NEVER end the tenancy (request alone changes nothing)", () => {
  for (const side of ["owner", "tenant"]) {
    const r = rules.decideTerminationRequest(activeTenancy(), side, { reason: "Moving away" }, NOW);
    assert.ok(r.ok);
    assert.equal(r.set.status, undefined, "requesting must not change tenancy status");
    assert.equal(r.set["termination.status"], "pending");
    assert.equal(r.set[`termination.${side}Consent`], true);
    assert.equal(r.set[`termination.${side === "owner" ? "tenant" : "owner"}Consent`], false);
  }
});

await test("Termination: initiator cannot approve their own request", () => {
  const pendingByOwner = activeTenancy({ termination: { status: "pending", initiatedBy: "owner", ownerConsent: true, tenantConsent: false, effectiveDate: NOW } });
  const r = rules.decideTerminationResponse(pendingByOwner, "owner", true, NOW);
  assert.equal(r.ok, false);
  assert.equal(r.code, "CANNOT_SELF_APPROVE");
  const pendingByTenant = activeTenancy({ termination: { status: "pending", initiatedBy: "tenant", ownerConsent: false, tenantConsent: true, effectiveDate: NOW } });
  assert.equal(rules.decideTerminationResponse(pendingByTenant, "tenant", true, NOW).code, "CANNOT_SELF_APPROVE");
});

await test("Termination: both consents (either order) terminate the tenancy", () => {
  for (const [initiator, responder] of [["owner", "tenant"], ["tenant", "owner"]]) {
    const req = rules.decideTerminationRequest(activeTenancy(), initiator, { reason: "Mutual decision", effectiveDate: "2026-11-30" }, NOW);
    const pending = activeTenancy({ termination: { status: "pending", initiatedBy: initiator, reason: "x", requestedAt: NOW, effectiveDate: req.set["termination.effectiveDate"], ownerConsent: req.set["termination.ownerConsent"], tenantConsent: req.set["termination.tenantConsent"] } });
    const done = rules.decideTerminationResponse(pending, responder, true, NOW);
    assert.ok(done.ok);
    assert.equal(done.outcome, "agreed");
    assert.equal(done.set.status, "terminated");
    assert.equal(done.set["termination.ownerConsent"], true);
    assert.equal(done.set["termination.tenantConsent"], true);
    assert.equal(done.set.endDate.toISOString(), "2026-11-30T00:00:00.000Z", "end date is brought forward to the agreed effective date");
  }
});

await test("Termination: rejection keeps the tenancy running and is recorded", () => {
  const pending = activeTenancy({ termination: { status: "pending", initiatedBy: "tenant", reason: "Job change", requestedAt: NOW, ownerConsent: false, tenantConsent: true, effectiveDate: NOW } });
  const r = rules.decideTerminationResponse(pending, "owner", false, NOW);
  assert.ok(r.ok);
  assert.equal(r.outcome, "rejected");
  assert.equal(r.set.status, undefined);
  assert.equal(r.historyEntry.outcome, "rejected");
  assert.equal(rules.decideTerminationResponse(pending, "owner", "yes", NOW).code, "CONSENT_REQUIRED"); // must be a real boolean
});

await test("Termination: withdraw only by initiator; strangers and invalid states are refused", () => {
  const pending = activeTenancy({ termination: { status: "pending", initiatedBy: "owner", reason: "x", requestedAt: NOW, ownerConsent: true, tenantConsent: false, effectiveDate: NOW } });
  assert.equal(rules.decideTerminationWithdraw(pending, "tenant", NOW).code, "ONLY_INITIATOR_CAN_WITHDRAW");
  assert.equal(rules.decideTerminationWithdraw(pending, "owner", NOW).outcome, "withdrawn");
  assert.equal(rules.decideTerminationWithdraw(activeTenancy(), "owner", NOW).code, "NO_PENDING_TERMINATION");
  assert.equal(rules.decideTerminationRequest(activeTenancy(), null, { reason: "abc" }, NOW).code, "NOT_A_PARTY");
  assert.equal(rules.decideTerminationResponse(pending, null, true, NOW).code, "NOT_A_PARTY");
});

await test("Termination: only active, not-yet-ended tenancies; no duplicate pending; valid reason and dates", () => {
  assert.equal(rules.decideTerminationRequest(activeTenancy({ status: "pending" }), "owner", { reason: "abc" }, NOW).code, "TENANCY_NOT_ACTIVE");
  assert.equal(rules.decideTerminationRequest(activeTenancy({ status: "terminated" }), "owner", { reason: "abc" }, NOW).code, "TENANCY_NOT_ACTIVE");
  assert.equal(rules.decideTerminationRequest(activeTenancy({ endDate: new Date("2026-10-01") }), "owner", { reason: "abc" }, NOW).code, "TENANCY_ENDED");
  const pending = activeTenancy({ termination: { status: "pending", initiatedBy: "owner" } });
  assert.equal(rules.decideTerminationRequest(pending, "tenant", { reason: "abc" }, NOW).code, "TERMINATION_ALREADY_PENDING");
  assert.equal(rules.decideTerminationRequest(activeTenancy(), "owner", { reason: " " }, NOW).code, "REASON_REQUIRED");
  assert.equal(rules.decideTerminationRequest(activeTenancy(), "owner", { reason: "ok!", effectiveDate: "2026-10-01" }, NOW).code, "INVALID_EFFECTIVE_DATE");
  assert.equal(rules.decideTerminationRequest(activeTenancy(), "owner", { reason: "ok!", effectiveDate: "2028-01-01" }, NOW).code, "INVALID_EFFECTIVE_DATE");
  assert.equal(rules.decideTerminationRequest(activeTenancy(), "owner", { reason: "ok!", effectiveDate: "junk" }, NOW).code, "INVALID_EFFECTIVE_DATE");
  // a rejected request can be re-opened
  const rejected = activeTenancy({ termination: { status: "rejected", initiatedBy: "owner" } });
  assert.ok(rules.decideTerminationRequest(rejected, "tenant", { reason: "Trying again" }, NOW).ok);
});

await test("Tenancy: side detection works with ObjectId-like values", () => {
  const t = { ownerId: { toString: () => "abc" }, tenantId: { toString: () => "def" } };
  assert.equal(rules.sideOf(t, "abc"), "owner");
  assert.equal(rules.sideOf(t, "def"), "tenant");
  assert.equal(rules.sideOf(t, "zzz"), null);
});

fs.rmSync(process.env.PRIVATE_UPLOAD_DIR, { recursive: true, force: true });
console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
