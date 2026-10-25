/**
 * LocalConnect - Room verification, ownership permission, availability & tenancy.
 *
 * Everything for this feature lives in THIS ONE FILE:
 *   IDs · address matching · private encrypted document vault · photo fingerprints · tenancy rules ·
 *   models (Property, Room, VerificationDocument, OwnerPermission, AuditLog, Tenancy) ·
 *   services · routes.
 *
 * Wiring (already done):
 *   - server/index.js            calls mountRoomVerification(app) and uses the room-listing gate on POST /api/rooms
 *   - listingController.js       uses the same gate for the mobile POST /api/v1/listings, plus update/delete guards
 *   - authController / adminRoutes  block deletion during an active tenancy and erase private documents
 *   - models/User.js             adds userCode + identity status; models/Listing.js adds roomCode/propertyCode
 *
 * Full API reference: docs/ROOM_VERIFICATION.md
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import multer from "multer";
import { Router } from "express";
import { requireAuth, requireAdmin } from "./middleware/auth.js";
import { createRateLimiter } from "./middleware/rateLimiter.js";
import { User } from "./models/User.js";
import { Listing } from "./models/Listing.js";
import { UserRating } from "./models/UserRating.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// =============================================================================
// IDs
// =============================================================================
/**
 * Public, human-friendly identifiers:
 *   User ID     -> USR-XXXXXXXX
 *   Property ID -> PRP-XXXXXXXX
 *   Room ID     -> ROM-XXXXXXXX
 *
 * Codes are random (not sequential) so they never reveal how many users,
 * properties or rooms exist, and cannot be enumerated by counting up.
 * Crockford base32 is used (no I, L, O, U) so codes are easy to read aloud.
 * 8 characters = 40 bits; uniqueness is additionally guaranteed by a unique
 * database index plus an existence check at generation time.
 */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // 32 symbols -> 256 % 32 === 0, so no modulo bias
const CODE_LENGTH = 8;

export const ID_PREFIXES = Object.freeze({
  user: "USR",
  property: "PRP",
  room: "ROM",
});

export function randomCode(length = CODE_LENGTH) {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

export function generateCode(kind) {
  const prefix = ID_PREFIXES[kind];
  if (!prefix) throw new Error(`Unknown ID kind '${kind}'`);
  return `${prefix}-${randomCode()}`;
}

export function isValidCode(kind, value) {
  const prefix = ID_PREFIXES[kind];
  if (!prefix || typeof value !== "string") return false;
  // 8 chars = random codes (users), 10 chars = codes derived from an address (properties, rooms)
  return new RegExp(`^${prefix}-[0-9A-HJKMNP-TV-Z]{8,10}$`).test(value.trim().toUpperCase());
}

/**
 * Address-derived IDs. The same address always produces the same ID, so the ID is generated
 * automatically from what the owner typed and nobody can pick or edit it.
 *   Property ID = PRP- + 10 chars of SHA-256(address fingerprint)
 *   Room ID     = ROM- + 10 chars of SHA-256(address fingerprint | room/unit | revision)
 * `revision` is only > 0 when a retired room with the same address+unit exists (IDs are never reused).
 */
export const DERIVED_CODE_LENGTH = 10;

export function codeFromHash(kind, seed) {
  const prefix = ID_PREFIXES[kind];
  if (!prefix) throw new Error(`Unknown ID kind '${kind}'`);
  const digest = crypto.createHash("sha256").update(String(seed)).digest();
  let out = "";
  for (let i = 0; i < DERIVED_CODE_LENGTH; i += 1) out += ALPHABET[digest[i] % ALPHABET.length];
  return `${prefix}-${out}`;
}

export const propertyCodeFromAddressKey = (addressKeyValue, revision = 0) =>
  codeFromHash("property", `property|${addressKeyValue}|${revision}`);

export const roomCodeFromAddress = (addressKeyValue, unitKeyValue, revision = 0) =>
  codeFromHash("room", `room|${addressKeyValue}|${unitKeyValue}|${revision}`);

export function normalizeCode(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

/**
 * Generates a code that does not exist yet.
 * @param {"user"|"property"|"room"} kind
 * @param {(code: string) => Promise<boolean>} exists async existence check
 */
export async function generateUniqueCode(kind, exists) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = generateCode(kind);
    if (!(await exists(code))) return code;
  }
  throw new Error(`Could not generate a unique ${kind} ID. Please retry.`);
}

// =============================================================================
// Address matching
// =============================================================================
/**
 * Address normalisation + fuzzy matching used to detect the same physical
 * property being registered twice (by the same or a different person).
 *
 * Two addresses are treated as the SAME property when either:
 *   - their canonical fingerprints are identical (same pincode, same set of
 *     normalised words regardless of word order / which field they were typed in), or
 *   - they share a pincode, are textually very similar (token Jaccard >= threshold),
 *     AND their house/flat numbers do not contradict each other
 *     ("Flat 302" vs "Flat 303" in the same building are different properties).
 */

export const ADDRESS_SIMILARITY_THRESHOLD = 0.85;

const ABBREVIATIONS = {
  rd: "road",
  st: "street",
  ave: "avenue",
  apt: "apartment",
  apts: "apartment",
  apartments: "apartment",
  bldg: "building",
  blk: "block",
  sec: "sector",
  nr: "near",
  opp: "opposite",
  ph: "phase",
  flr: "floor",
  fl: "floor",
  mkt: "market",
};

// Words that carry no identifying information.
const NOISE = new Set(["no", "number", "the", "of", "and", "at", "in", "house", "h"]);

export const PINCODE_REGEX = /^[1-9][0-9]{5}$/;

export function tokenizeAddressText(text) {
  if (typeof text !== "string") return [];
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => ABBREVIATIONS[tok] || tok)
    .filter((tok) => !NOISE.has(tok));
}

/** Normalises the address object. Landmark is deliberately excluded: it is optional and varies. */
export function addressTokens(address = {}) {
  const parts = [address.line1, address.line2, address.locality, address.city, address.state];
  const tokens = new Set();
  for (const part of parts) {
    for (const tok of tokenizeAddressText(part)) tokens.add(tok);
  }
  return [...tokens].sort();
}

export function normalizedAddressString(address = {}) {
  return addressTokens(address).join(" ");
}

export function pincodeOf(address = {}) {
  return String(address.pincode || "").trim();
}

/** Canonical fingerprint: identical for the same address however it was typed. */
export function addressKey(address = {}) {
  const canonical = `${pincodeOf(address)}|${addressTokens(address).join(" ")}`;
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

function houseNumberTokens(tokens, pincode) {
  return new Set(tokens.filter((t) => /\d/.test(t) && t !== pincode));
}

function isSubset(a, b) {
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/**
 * Similarity in [0,1] between two address objects.
 * Returns 0 when pincodes differ, and at most 0.5 when house/flat numbers contradict.
 */
export function addressSimilarity(a = {}, b = {}) {
  const pinA = pincodeOf(a);
  const pinB = pincodeOf(b);
  if (!pinA || !pinB || pinA !== pinB) return 0;

  const tokA = addressTokens(a);
  const tokB = addressTokens(b);
  if (tokA.length === 0 || tokB.length === 0) return 0;

  const setA = new Set(tokA);
  const setB = new Set(tokB);
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter += 1;
  const union = setA.size + setB.size - inter;
  const jaccard = union === 0 ? 0 : inter / union;

  const numsA = houseNumberTokens(tokA, pinA);
  const numsB = houseNumberTokens(tokB, pinB);
  const contradict = numsA.size > 0 && numsB.size > 0 && !isSubset(numsA, numsB) && !isSubset(numsB, numsA);

  return contradict ? Math.min(jaccard, 0.5) : jaccard;
}

export function isSameProperty(a, b, threshold = ADDRESS_SIMILARITY_THRESHOLD) {
  if (addressKey(a) === addressKey(b)) return true;
  if (addressSimilarity(a, b) >= threshold) return true;
  return addressContains(a, b);
}

/**
 * "Same address plus a few extra words": the shorter address is FULLY contained in the longer one
 * (e.g. someone adds a landmark, a second line or an extra locality word to dodge the exact match).
 * Safe-guards against false positives:
 *   - pincodes must be identical,
 *   - if both addresses carry house/flat numbers they must be exactly the same numbers
 *     ("Flat 302" vs "Flat 303", "12" vs "14" stay different properties),
 *   - the shorter address must have enough words to be meaningful,
 *   - a single different word in the shorter address (another street name) means NOT contained.
 */
export function addressContains(a = {}, b = {}) {
  const pinA = pincodeOf(a);
  const pinB = pincodeOf(b);
  if (!pinA || !pinB || pinA !== pinB) return false;

  const tokA = addressTokens(a);
  const tokB = addressTokens(b);
  if (!tokA.length || !tokB.length) return false;

  const [small, large] = tokA.length <= tokB.length ? [tokA, tokB] : [tokB, tokA];
  const largeSet = new Set(large);
  if (!small.every((t) => largeSet.has(t))) return false;

  const numsA = houseNumberTokens(tokA, pinA);
  const numsB = houseNumberTokens(tokB, pinB);
  if (numsA.size > 0 && numsB.size > 0) {
    return numsA.size === numsB.size && isSubset(numsA, numsB);
  }
  if (numsA.size > 0 || numsB.size > 0) return false; // only one side has a house number: can't be sure
  return small.length >= 5; // no house numbers at all: need a reasonably specific address
}

export const SAME_PLACE_METRES = 25;

function metresBetween(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Same GPS spot (within ~25 m) in the same PIN code, no contradicting house number and at least half of the
 * address words in common. Catches the same building typed in a completely different way.
 */
export function isSamePlaceByGeo(a, b) {
  const la = Number(a?.latitude), loa = Number(a?.longitude), lb = Number(b?.latitude), lob = Number(b?.longitude);
  if (![la, loa, lb, lob].every(Number.isFinite) || a?.latitude == null || b?.latitude == null) return false;
  const pinA = pincodeOf(a.address);
  if (!pinA || pinA !== pincodeOf(b.address)) return false;
  if (metresBetween(la, loa, lb, lob) > SAME_PLACE_METRES) return false;

  const tokA = addressTokens(a.address);
  const tokB = addressTokens(b.address);
  const numsA = houseNumberTokens(tokA, pinA);
  const numsB = houseNumberTokens(tokB, pinA);
  if (numsA.size > 0 && numsB.size > 0 && !isSubset(numsA, numsB) && !isSubset(numsB, numsA)) return false;

  const setB = new Set(tokB);
  const common = tokA.filter((t) => setB.has(t)).length;
  return common / Math.min(tokA.length, tokB.length) >= 0.5;
}

/** Finds an already-registered property that is the same place as `candidate` ({address, latitude, longitude}). */
export function findSameProperty(existing, candidate) {
  return (
    existing.find((p) => isSameProperty(p.address, candidate.address)) ||
    existing.find((p) => isSamePlaceByGeo(p, candidate)) ||
    null
  );
}

/** Normalised key for a room/unit label inside a property ("Room 2", "room-2" -> "room2"). */
export function unitKeyOf(unitNumber) {
  const raw = String(unitNumber ?? "").toLowerCase();
  // "Room 2", "room-2", "Room No. 2", "R2" and "2" are all the same unit; "Flat 302" == "302".
  const canonical = raw
    .replace(/\b(rooms?|flats?|units?|apartments?|apt|shops?|no|number)\b\.?/g, " ")
    .replace(/[^a-z0-9]/g, "")
    .replace(/^r(?=\d)/, "");
  return canonical || raw.replace(/[^a-z0-9]/g, "");
}

/**
 * One deterministic identity key for a room, built from everything that makes it a distinct physical room:
 * coordinates (6 decimals), the canonical address, and the flat / room label. Submitting the same data again,
 * however it is typed (case, spacing, "Room 2" vs "R2", abbreviations), gives the same key.
 * Returns null when any ingredient is missing/invalid.
 */
export function roomIdentityKey({ address, latitude, longitude, unitNumber } = {}) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (latitude == null || longitude == null || latitude === "" || longitude === "" || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const unit = unitKeyOf(unitNumber ?? "Main");
  const canonical = `${lat.toFixed(6)}|${lng.toFixed(6)}|${addressKey(address || {})}|${unit}`;
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

// =============================================================================
// Private encrypted document vault
// =============================================================================
/**
 * Private vault for identity / ownership documents.
 *
 * Guarantees:
 *  - Files are written OUTSIDE the publicly served /uploads tree
 *    (default: server/private_uploads/verification) and are never reachable by URL.
 *  - Files are encrypted at rest with AES-256-GCM. The plaintext never touches disk.
 *  - File type is verified from the file's real bytes, not the client-supplied MIME type.
 *  - Access happens only through authenticated, authorised API routes.
 *
 * Configuration (server/.env):
 *  - DOCUMENT_ENCRYPTION_KEY : 64 hex characters (32 bytes). REQUIRED in production.
 *      Generate with:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *  - PRIVATE_UPLOAD_DIR      : optional absolute path to store encrypted files.
 */


export const ALLOWED_DOCUMENT_MIMES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024; // 8 MB

export class VaultNotConfiguredError extends Error {
  constructor(message) {
    super(message);
    this.name = "VaultNotConfiguredError";
    this.status = 503;
  }
}

export function getVaultDir() {
  const configured = process.env.PRIVATE_UPLOAD_DIR;
  const dir = configured
    ? path.resolve(configured)
    : path.resolve(__dirname, "../private_uploads/verification");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  return dir;
}

const keyCache = new Map();

export function getEncryptionKey() {
  const raw = process.env.DOCUMENT_ENCRYPTION_KEY || "";
  let cacheId;
  let derive;

  if (raw) {
    if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
      throw new VaultNotConfiguredError(
        "DOCUMENT_ENCRYPTION_KEY must be exactly 64 hexadecimal characters (32 bytes)."
      );
    }
    cacheId = `configured:${raw}`;
    derive = () => Buffer.from(raw, "hex");
  } else if (process.env.NODE_ENV === "production") {
    // Checked on every call (never served from cache) so production can never fall back to a derived key.
    throw new VaultNotConfiguredError(
      "Document storage is not configured. Set DOCUMENT_ENCRYPTION_KEY on the server."
    );
  } else {
    // Development / test only: derive a stable key so local uploads keep working.
    const secret = process.env.JWT_SECRET || "dev-only-document-key";
    cacheId = `dev:${secret}`;
    derive = () => crypto.scryptSync(secret, "localconnect-document-vault", 32);
  }

  if (!keyCache.has(cacheId)) keyCache.set(cacheId, derive());
  return keyCache.get(cacheId);
}

/** Detects the real file type from magic bytes. Returns null for anything not allowed. */
export function sniffMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  if (buffer.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (buffer.subarray(0, 4).toString("latin1") === "RIFF" && buffer.subarray(8, 12).toString("latin1") === "WEBP") {
    return "image/webp";
  }
  return null;
}

export function sanitizeFileName(name) {
  const base = path.basename(String(name || "document")).replace(/[^\w.\- ]+/g, "_").trim();
  return (base || "document").slice(0, 120);
}

export function sha256Hex(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function encryptBuffer(plain, aad) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(String(aad)));
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return { ciphertext, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}

export function decryptBuffer(ciphertext, ivB64, tagB64, aad) {
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAAD(Buffer.from(String(aad)));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** Encrypts and stores a buffer. Returns the opaque storage key plus IV / auth tag. */
export async function storeEncrypted(plain) {
  const storageKey = `${crypto.randomUUID()}.enc`;
  const { ciphertext, iv, tag } = encryptBuffer(plain, storageKey);
  const filePath = path.join(getVaultDir(), storageKey);
  await fs.promises.writeFile(filePath, ciphertext, { mode: 0o600 });
  return { storageKey, iv, tag };
}

export async function readDecrypted({ storageKey, iv, tag }) {
  const safeKey = path.basename(String(storageKey)); // defence in depth against traversal
  const ciphertext = await fs.promises.readFile(path.join(getVaultDir(), safeKey));
  return decryptBuffer(ciphertext, iv, tag, safeKey);
}

export async function deleteStored(storageKey) {
  if (!storageKey) return;
  const filePath = path.join(getVaultDir(), path.basename(String(storageKey)));
  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    if (err.code !== "ENOENT") console.warn(`Failed to delete vault file: ${err.message}`);
  }
}

// =============================================================================
// Photo fingerprints
// =============================================================================
/**
 * Photo fingerprints for duplicate-room detection.
 *
 *  - sha256 : exact byte-for-byte match (always available, no dependencies).
 *  - phash  : 64-bit "difference hash" that survives resizing / re-compression.
 *             Computed only when the optional `sharp` package is installed
 *             (`npm install sharp --prefix server`); otherwise it is skipped and
 *             only exact matches are detected.
 *
 * Photos MUST be files uploaded through this platform (/api/upload/media), because
 * only those can be fingerprinted server-side. A client cannot bypass duplicate
 * detection by pointing at an external image URL.
 */

const UPLOAD_DIR = path.resolve(__dirname, "../uploads/listings");
const LOCAL_URL_REGEX = /^\/uploads\/listings\/([A-Za-z0-9._-]+)$/;

export const PHASH_MAX_DISTANCE = 6; // out of 64 bits

/** Maps a stored photo URL to a file inside the upload directory, or null if it is not a local upload. */
export function resolveLocalUploadPath(url) {
  if (typeof url !== "string") return null;
  const match = LOCAL_URL_REGEX.exec(url.trim());
  if (!match) return null;
  const filename = match[1];
  if (filename.includes("..")) return null;
  const resolved = path.join(UPLOAD_DIR, filename);
  if (!resolved.startsWith(UPLOAD_DIR + path.sep)) return null;
  return resolved;
}

export function photoUrlOf(photo) {
  return typeof photo === "string" ? photo : photo?.url;
}

export function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

let sharpLoader = null;
async function loadSharp() {
  if (!sharpLoader) {
    sharpLoader = import("sharp")
      .then((mod) => mod.default || mod)
      .catch(() => null);
  }
  return sharpLoader;
}

/** 64-bit difference hash as 16 hex chars, or null when `sharp` is unavailable / the image cannot be decoded. */
export async function perceptualHash(filePath) {
  const sharp = await loadSharp();
  if (!sharp) return null;
  try {
    const pixels = await sharp(filePath, { failOn: "none" })
      .grayscale()
      .resize(9, 8, { fit: "fill" })
      .raw()
      .toBuffer();
    if (pixels.length < 72) return null;
    let bits = "";
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        bits += pixels[row * 9 + col] < pixels[row * 9 + col + 1] ? "1" : "0";
      }
    }
    let hex = "";
    for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    return hex;
  } catch {
    return null;
  }
}

const POPCOUNT = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

export function hammingDistanceHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return Infinity;
  let dist = 0;
  for (let i = 0; i < a.length; i += 1) {
    dist += POPCOUNT[parseInt(a[i], 16) ^ parseInt(b[i], 16)];
  }
  return dist;
}

/**
 * Fingerprints a list of listing photos.
 * @returns {{ entries: {url:string, sha256:string, phash:string|null}[], invalid: string[] }}
 *   `invalid` lists photos that are not platform uploads (or no longer exist on disk).
 */
export async function fingerprintPhotos(photos = []) {
  const entries = [];
  const invalid = [];
  const seen = new Set();

  for (const photo of photos) {
    const url = photoUrlOf(photo);
    const filePath = resolveLocalUploadPath(url);
    if (!filePath) {
      invalid.push(String(url ?? ""));
      continue;
    }
    let sha256;
    try {
      sha256 = await sha256File(filePath);
    } catch {
      invalid.push(String(url));
      continue;
    }
    if (seen.has(sha256)) continue; // same file attached twice to one listing
    seen.add(sha256);
    entries.push({ url, sha256, phash: await perceptualHash(filePath) });
  }
  return { entries, invalid };
}

/**
 * How many of `candidate` photos match any of `existing` photos (exact or perceptual),
 * as a ratio of the smaller photo set. 0 when either side has no photos.
 */
export function photoOverlapRatio(candidate, existing) {
  if (!candidate.length || !existing.length) return 0;
  let matches = 0;
  for (const c of candidate) {
    const hit = existing.some((e) => {
      if (c.sha256 && e.sha256 && c.sha256 === e.sha256) return true;
      return c.phash && e.phash && hammingDistanceHex(c.phash, e.phash) <= PHASH_MAX_DISTANCE;
    });
    if (hit) matches += 1;
  }
  return matches / Math.min(candidate.length, existing.length);
}

// =============================================================================
// Tenancy rules (pure)
// =============================================================================
/**
 * Pure business rules for tenancies (no database access) so they can be unit-tested.
 *
 * EARLY TERMINATION requires the consent of BOTH the owner and the tenant:
 *   - either party may open a termination request (their own consent is recorded automatically),
 *   - ONLY the other party can agree or reject it,
 *   - the tenancy ends early only when both consents are recorded,
 *   - no single party can ever end a running tenancy on their own.
 */

export const TENANCY_LIMITS = Object.freeze({
  minMonths: 1,
  maxMonths: 36,
  maxAdvanceDays: 365,
  maxTextLength: 500,
});

const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfUtcDay(date) {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function addMonthsUtc(date, months) {
  const d = startOfUtcDay(date);
  const targetMonth = d.getUTCMonth() + months;
  const year = d.getUTCFullYear() + Math.floor(targetMonth / 12);
  const month = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(d.getUTCDate(), lastDay)));
}

function parseDateOnly(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : startOfUtcDay(value);
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value.trim())) return null;
  const parsed = new Date(value.trim());
  return Number.isNaN(parsed.getTime()) ? null : startOfUtcDay(parsed);
}

const ruleFail = (status, code, error) => ({ ok: false, status, code, error });

/** Validates a tenant's booking request. */
export function parseBookingInput(input = {}, now = new Date(), { availableFrom = null } = {}) {
  const today = startOfUtcDay(now);

  const startDate = parseDateOnly(input.startDate);
  if (!startDate) return ruleFail(400, "INVALID_START_DATE", "startDate is required in YYYY-MM-DD format.");
  if (startDate < today) return ruleFail(400, "INVALID_START_DATE", "The start date cannot be in the past.");
  if (startDate.getTime() - today.getTime() > TENANCY_LIMITS.maxAdvanceDays * DAY_MS) {
    return ruleFail(400, "INVALID_START_DATE", `The start date cannot be more than ${TENANCY_LIMITS.maxAdvanceDays} days away.`);
  }
  if (availableFrom) {
    const from = startOfUtcDay(availableFrom);
    if (startDate < from) {
      return ruleFail(409, "BEFORE_AVAILABLE_FROM", `This room is only available from ${from.toISOString().slice(0, 10)}.`);
    }
  }

  const months = Number(input.durationMonths);
  if (!Number.isInteger(months) || months < TENANCY_LIMITS.minMonths || months > TENANCY_LIMITS.maxMonths) {
    return ruleFail(400, "INVALID_DURATION", `durationMonths must be a whole number between ${TENANCY_LIMITS.minMonths} and ${TENANCY_LIMITS.maxMonths}.`);
  }

  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (message.length > TENANCY_LIMITS.maxTextLength) {
    return ruleFail(400, "MESSAGE_TOO_LONG", `Message must be ${TENANCY_LIMITS.maxTextLength} characters or fewer.`);
  }

  return {
    ok: true,
    value: { startDate, durationMonths: months, endDate: addMonthsUtc(startDate, months), message },
  };
}

/** Which side of the tenancy the user is on, or null. Ids may be ObjectIds or strings. */
export function sideOf(tenancy, userId) {
  const id = String(userId);
  if (String(tenancy.ownerId) === id) return "owner";
  if (String(tenancy.tenantId) === id) return "tenant";
  return null;
}

const otherSide = (side) => (side === "owner" ? "tenant" : "owner");

function openTermination(tenancy) {
  return tenancy.termination?.status === "pending";
}

/** Common precondition: only a running tenancy that has not yet reached its end date can be terminated early. */
function checkTerminable(tenancy, now) {
  if (tenancy.status !== "active") {
    return ruleFail(409, "TENANCY_NOT_ACTIVE", "Only an active tenancy can be terminated early.");
  }
  if (new Date(tenancy.endDate) <= now) {
    return ruleFail(409, "TENANCY_ENDED", "This tenancy has already reached its end date.");
  }
  return null;
}

/** Either party opens an early-termination request. The initiator's own consent is recorded. */
export function decideTerminationRequest(tenancy, side, { reason, effectiveDate } = {}, now = new Date()) {
  if (side !== "owner" && side !== "tenant") return ruleFail(403, "NOT_A_PARTY", "Only the owner or the tenant can request termination.");
  const blocked = checkTerminable(tenancy, now);
  if (blocked) return blocked;
  if (openTermination(tenancy)) {
    return ruleFail(409, "TERMINATION_ALREADY_PENDING", "A termination request is already awaiting a response.");
  }

  const cleanReason = typeof reason === "string" ? reason.trim() : "";
  if (cleanReason.length < 3) return ruleFail(400, "REASON_REQUIRED", "Please give a short reason for the early termination.");
  if (cleanReason.length > TENANCY_LIMITS.maxTextLength) {
    return ruleFail(400, "REASON_TOO_LONG", `Reason must be ${TENANCY_LIMITS.maxTextLength} characters or fewer.`);
  }

  const today = startOfUtcDay(now);
  let effective = today;
  if (effectiveDate !== undefined && effectiveDate !== null && effectiveDate !== "") {
    effective = parseDateOnly(effectiveDate);
    if (!effective) return ruleFail(400, "INVALID_EFFECTIVE_DATE", "effectiveDate must be in YYYY-MM-DD format.");
    if (effective < today) return ruleFail(400, "INVALID_EFFECTIVE_DATE", "The effective date cannot be in the past.");
    if (effective > new Date(tenancy.endDate)) {
      return ruleFail(400, "INVALID_EFFECTIVE_DATE", "The effective date cannot be after the agreed end date.");
    }
  }

  return {
    ok: true,
    set: {
      "termination.status": "pending",
      "termination.initiatedBy": side,
      "termination.ownerConsent": side === "owner",
      "termination.tenantConsent": side === "tenant",
      "termination.reason": cleanReason,
      "termination.effectiveDate": effective,
      "termination.requestedAt": now,
      "termination.respondedAt": null,
    },
  };
}

/** The OTHER party agrees to, or rejects, a pending request. */
export function decideTerminationResponse(tenancy, side, agree, now = new Date()) {
  if (side !== "owner" && side !== "tenant") return ruleFail(403, "NOT_A_PARTY", "Only the owner or the tenant can respond.");
  if (!openTermination(tenancy)) return ruleFail(409, "NO_PENDING_TERMINATION", "There is no termination request awaiting a response.");
  if (tenancy.status !== "active") return ruleFail(409, "TENANCY_NOT_ACTIVE", "Only an active tenancy can be terminated early.");

  const initiator = tenancy.termination.initiatedBy;
  if (side === initiator) {
    return ruleFail(403, "CANNOT_SELF_APPROVE", "You requested this termination; the other party must respond to it.");
  }
  if (typeof agree !== "boolean") return ruleFail(400, "CONSENT_REQUIRED", "Provide agree: true or agree: false.");

  if (!agree) {
    return {
      ok: true,
      outcome: "rejected",
      set: { "termination.status": "rejected", "termination.respondedAt": now },
      historyEntry: historyOf(tenancy, "rejected", now),
    };
  }

  // Record this side's consent; both consents now exist because the initiator's was recorded at request time.
  const ownerConsent = side === "owner" ? true : Boolean(tenancy.termination.ownerConsent);
  const tenantConsent = side === "tenant" ? true : Boolean(tenancy.termination.tenantConsent);
  if (!ownerConsent || !tenantConsent) {
    return ruleFail(409, "CONSENT_INCOMPLETE", "Both the owner and the tenant must consent to terminate early.");
  }

  const effective = new Date(tenancy.termination.effectiveDate);
  const set = {
    status: "terminated",
    terminatedAt: now,
    "termination.status": "agreed",
    "termination.ownerConsent": true,
    "termination.tenantConsent": true,
    "termination.respondedAt": now,
  };
  if (effective < new Date(tenancy.endDate)) set.endDate = effective;
  return { ok: true, outcome: "agreed", set };
}

/** The initiator withdraws their own pending request. */
export function decideTerminationWithdraw(tenancy, side, now = new Date()) {
  if (!openTermination(tenancy)) return ruleFail(409, "NO_PENDING_TERMINATION", "There is no pending termination request.");
  if (side !== tenancy.termination.initiatedBy) {
    return ruleFail(403, "ONLY_INITIATOR_CAN_WITHDRAW", "Only the party who requested the termination can withdraw it.");
  }
  return {
    ok: true,
    outcome: "withdrawn",
    set: { "termination.status": "withdrawn", "termination.respondedAt": now },
    historyEntry: historyOf(tenancy, "withdrawn", now),
  };
}

function historyOf(tenancy, outcome, now) {
  return {
    initiatedBy: tenancy.termination.initiatedBy,
    reason: tenancy.termination.reason,
    outcome,
    requestedAt: tenancy.termination.requestedAt,
    respondedAt: now,
  };
}

// =============================================================================
// Model: Property
// =============================================================================
/**
 * A physical property (house / flat / building) registered by its owner.
 * The full address is PRIVATE: it is only returned to the owner, people the owner has
 * authorised, administrators, and tenants with an active tenancy. Public listings only
 * ever expose the locality.
 */
const propertySchema = new mongoose.Schema(
  {
    propertyCode: { type: String, required: true, unique: true, index: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    address: {
      line1: { type: String, required: true, trim: true, minlength: 3, maxlength: 160 },
      line2: { type: String, default: "", trim: true, maxlength: 160 },
      locality: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
      city: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
      state: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
      pincode: { type: String, required: true, trim: true, match: [/^[1-9][0-9]{5}$/, "Pincode must be 6 digits"] },
      landmark: { type: String, default: "", trim: true, maxlength: 160 },
    },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },

    // Derived, used only for duplicate-address detection.
    addressKey: { type: String, required: true },
    addressNormalized: { type: String, default: "" },

    ownership: {
      status: {
        type: String,
        enum: ["unverified", "pending", "verified", "rejected"],
        default: "unverified",
        index: true,
      },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: undefined },
      reviewedAt: { type: Date, default: undefined },
      verifiedAt: { type: Date, default: undefined },
      note: { type: String, default: "" },
    },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// The same physical address can only be registered once while active (race-safe backstop for the app-level check).
propertySchema.index({ addressKey: 1 }, { unique: true, partialFilterExpression: { isActive: true } });
propertySchema.index({ "address.pincode": 1, isActive: 1 });

propertySchema.pre("validate", async function () {
  if (this.isNew || this.isModified("address")) {
    this.addressKey = addressKey(this.address || {});
    this.addressNormalized = normalizedAddressString(this.address || {});
  }
  if (this.isNew && !this.propertyCode) {
    // Generated from the address itself; a revision suffix only matters in the (astronomically rare) event of a hash collision.
    for (let rev = 0; rev < 5; rev += 1) {
      const candidate = propertyCodeFromAddressKey(this.addressKey, rev);
      if (!(await Property.exists({ propertyCode: candidate }))) {
        this.propertyCode = candidate;
        break;
      }
    }
    if (!this.propertyCode) {
      this.propertyCode = await generateUniqueCode("property", (code) => Property.exists({ propertyCode: code }));
    }
  }
});

/** Full view for the owner, delegates and administrators. */
propertySchema.methods.toOwnerJSON = function () {
  return {
    id: this._id.toString(),
    ownerId: this.ownerId.toString(),
    address: {
      line1: this.address.line1,
      line2: this.address.line2 || "",
      locality: this.address.locality,
      city: this.address.city,
      state: this.address.state,
      pincode: this.address.pincode,
      landmark: this.address.landmark || "",
    },
    latitude: this.latitude,
    longitude: this.longitude,
    ownershipStatus: this.ownership?.status || "unverified",
    ownershipNote: this.ownership?.status === "rejected" ? this.ownership?.note || "" : "",
    ownershipReviewedAt: this.ownership?.reviewedAt || null,
    createdAt: this.createdAt,
  };
};

/** Administrator view: the owner view PLUS the system-generated Property ID (never shown to anyone else). */
propertySchema.methods.toAdminJSON = function () {
  return { ...this.toOwnerJSON(), propertyCode: this.propertyCode, ownershipNote: this.ownership?.note || "" };
};

export const Property = mongoose.model("Property", propertySchema);

// =============================================================================
// Model: Room
// =============================================================================
/**
 * Private companion record to a room Listing. It owns everything that must NOT be exposed
 * through the public listing API: the room's permanent ID, duplicate-detection fingerprints,
 * who is authorised to list it, and its live availability.
 *
 * One Room per room Listing. When a listing is removed the Room is retired (isLive = false)
 * so its Room ID is never reused and the unit can be listed again later.
 */
const roomSchema = new mongoose.Schema(
  {
    roomCode: { type: String, required: true, unique: true, index: true },
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", required: true, unique: true },

    // null for rooms listed before the verification feature existed ("legacy" rooms).
    propertyId: { type: mongoose.Schema.Types.ObjectId, ref: "Property", default: null, index: true },
    // The real owner of the room: the verified property owner (or the original poster for legacy rooms).
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // Who posted the listing. Differs from ownerId when the owner authorised someone else.
    listedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    listedVia: { type: String, enum: ["owner", "permission", "legacy"], required: true },
    permissionId: { type: mongoose.Schema.Types.ObjectId, ref: "OwnerPermission", default: null },

    unitNumber: { type: String, required: true, trim: true, maxlength: 40 },
    unitKey: { type: String, required: true },
    // sha256 of coordinates + address + flat/room (see roomIdentityKey). Unique among live rooms.
    identityKey: { type: String, default: undefined },
    floor: { type: String, default: "", trim: true, maxlength: 20 },

    // Duplicate-detection fingerprints of the room's photos (never exposed through any API).
    photos: {
      type: [{ _id: false, sha256: String, phash: { type: String, default: null } }],
      default: [],
    },

    // Availability / double-booking guard. Claimed atomically by the tenancy service.
    occupancy: {
      status: { type: String, enum: ["available", "occupied"], default: "available" },
      tenancyId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenancy", default: null },
      since: { type: Date, default: null },
      until: { type: Date, default: null },
    },
    // True when the listing was closed automatically because the room became occupied
    // (so it can be re-opened automatically when the tenancy ends).
    autoClosedByTenancy: { type: Boolean, default: false },

    isLive: { type: Boolean, default: true, index: true },
    retiredAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// A unit can only be listed once per property while live (race-safe backstop for the app-level duplicate check).
roomSchema.index({ propertyId: 1, unitKey: 1 }, { unique: true, partialFilterExpression: { isLive: true } });
roomSchema.index(
  { identityKey: 1 },
  { unique: true, partialFilterExpression: { isLive: true, identityKey: { $type: "string" } }, name: "unique_live_room_identity" }
);
roomSchema.index({ "photos.sha256": 1 });

roomSchema.pre("validate", async function () {
  if (this.isNew && !this.roomCode) {
    this.roomCode = await generateUniqueCode("room", (code) => Room.exists({ roomCode: code }));
  }
});

export const Room = mongoose.model("Room", roomSchema);

// =============================================================================
// Model: VerificationDocument
// =============================================================================
export const IDENTITY_DOC_TYPES = ["aadhaar", "pan", "voter_id", "passport", "driving_license"];
export const OWNERSHIP_DOC_TYPES = [
  "sale_deed",
  "property_tax_receipt",
  "electricity_bill",
  "water_bill",
  "khata_certificate",
  "mutation_certificate",
];

/**
 * Metadata for one uploaded identity / ownership document. The file itself is stored
 * encrypted in the private vault (see utils/documentVault.js); this record never contains
 * the file content, and storage details are never serialised to API clients.
 */
const verificationDocumentSchema = new mongoose.Schema(
  {
    uploaderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    purpose: { type: String, enum: ["identity", "ownership"], required: true, index: true },
    propertyId: { type: mongoose.Schema.Types.ObjectId, ref: "Property", default: null, index: true },
    docType: { type: String, required: true },

    originalName: { type: String, default: "document" },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },

    // Vault storage details (PRIVATE).
    storageKey: { type: String, required: true },
    iv: { type: String, required: true },
    tag: { type: String, required: true },
    sha256: { type: String, required: true, index: true },

    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: undefined },
    reviewedAt: { type: Date, default: undefined },
    reviewNote: { type: String, default: "" },

    // Admin-only fraud signal: the identical file was also uploaded by a different account.
    duplicateOfUploaderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: undefined },
  },
  { timestamps: true }
);

/** Safe view for the uploader: no storage details, no hashes, no fraud signals. */
verificationDocumentSchema.methods.toOwnerJSON = function () {
  return {
    id: this._id.toString(),
    purpose: this.purpose,
    propertyId: this.propertyId ? this.propertyId.toString() : null,
    docType: this.docType,
    originalName: this.originalName,
    mimeType: this.mimeType,
    size: this.size,
    status: this.status,
    reviewNote: this.status === "rejected" ? this.reviewNote || "" : "",
    uploadedAt: this.createdAt,
    reviewedAt: this.reviewedAt || null,
  };
};

/** Administrator view: adds the duplicate-upload flag (still no storage details). */
verificationDocumentSchema.methods.toAdminJSON = function () {
  return {
    ...this.toOwnerJSON(),
    reviewNote: this.reviewNote || "",
    duplicateUploadFlag: Boolean(this.duplicateOfUploaderId),
  };
};

export const VerificationDocument = mongoose.model("VerificationDocument", verificationDocumentSchema);

// =============================================================================
// Model: OwnerPermission
// =============================================================================
/**
 * Permission from a VERIFIED property owner allowing another user (for example a tenant,
 * caretaker or agent) to list rooms for that property. Without an active permission, only
 * the verified owner can list rooms. Permissions are created and revoked only by the owner
 * (the delegate may also give theirs up) and are re-checked on every listing action.
 */
const ownerPermissionSchema = new mongoose.Schema(
  {
    propertyId: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true, index: true },
    grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    delegateId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: { type: String, enum: ["active", "revoked"], default: "active", index: true },
    note: { type: String, default: "", trim: true, maxlength: 300 },
    expiresAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: undefined },
  },
  { timestamps: true }
);

// At most one active permission per (property, delegate).
ownerPermissionSchema.index(
  { propertyId: 1, delegateId: 1 },
  { unique: true, partialFilterExpression: { status: "active" } }
);

export const OwnerPermission = mongoose.model("OwnerPermission", ownerPermissionSchema);

// =============================================================================
// Model: AuditLog
// =============================================================================
/**
 * Append-only trail of sensitive actions (document views, verification decisions,
 * permission changes, tenancy decisions). Stores identifiers only, never document
 * content or personal details.
 */
const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true, index: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: undefined, index: true },
    actorRole: { type: String, default: "" },
    targetType: { type: String, default: "" },
    targetId: { type: String, default: "", index: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: undefined },
    ip: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const AuditLog = mongoose.model("AuditLog", auditLogSchema);

/** Records an audit event. Never throws: auditing must not break the action being audited. */
export async function recordAudit(req, action, targetType, targetId, meta) {
  try {
    await AuditLog.create({
      action,
      actorId: req?.userId || undefined,
      actorRole: req?.userRole || "",
      targetType,
      targetId: targetId ? String(targetId) : "",
      meta,
      ip: req?.ip || req?.socket?.remoteAddress || "",
    });
  } catch (err) {
    console.warn(`Audit log write failed for ${action}: ${err.message}`);
  }
}

// =============================================================================
// Model: Tenancy
// =============================================================================
/**
 * A rental agreement between a room owner and a tenant.
 *
 * pending  -> tenant has asked to rent; the owner has not decided
 * active   -> owner accepted; the room is held for this tenant
 * terminated -> ended early with the consent of BOTH owner and tenant
 * completed  -> ran to its agreed end date
 * declined / cancelled -> never started (owner declined / tenant withdrew)
 *
 * `holdsRoom` is true only while the tenancy occupies the room. A unique partial index on it
 * guarantees at most ONE tenancy can ever hold a given room (the database-level double-booking guard).
 * `rev` is a revision counter used for compare-and-swap updates so two simultaneous requests cannot both win.
 */
const terminationSchema = new mongoose.Schema(
  {
    status: { type: String, enum: ["none", "pending", "agreed", "rejected", "withdrawn"], default: "none" },
    initiatedBy: { type: String, enum: ["owner", "tenant"], default: null },
    ownerConsent: { type: Boolean, default: false },
    tenantConsent: { type: Boolean, default: false },
    reason: { type: String, default: "" },
    effectiveDate: { type: Date, default: null },
    requestedAt: { type: Date, default: null },
    respondedAt: { type: Date, default: null },
  },
  { _id: false }
);

const tenancySchema = new mongoose.Schema(
  {
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true, index: true },
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", required: true, index: true },
    propertyId: { type: mongoose.Schema.Types.ObjectId, ref: "Property", default: null },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    status: {
      type: String,
      enum: ["pending", "active", "terminated", "completed", "declined", "cancelled"],
      default: "pending",
      index: true,
    },
    holdsRoom: { type: Boolean, default: false },

    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    durationMonths: { type: Number, required: true },
    rentSnapshot: { type: Number, default: 0 },
    depositSnapshot: { type: Number, default: 0 },
    message: { type: String, default: "", maxlength: 500 },

    decidedAt: { type: Date, default: null },
    declineReason: { type: String, default: "" },
    terminatedAt: { type: Date, default: null },
    releasedAt: { type: Date, default: null },

    termination: { type: terminationSchema, default: () => ({}) },
    terminationHistory: {
      type: [
        {
          _id: false,
          initiatedBy: String,
          reason: String,
          outcome: String,
          requestedAt: Date,
          respondedAt: Date,
        },
      ],
      default: [],
    },

    rev: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Database-level double-booking guard: only one tenancy may hold a room at a time.
tenancySchema.index(
  { roomId: 1, holdsRoom: 1 },
  { unique: true, partialFilterExpression: { holdsRoom: true } }
);
// A tenant cannot spam several pending requests for the same room.
tenancySchema.index({ roomId: 1, tenantId: 1 }, { unique: true, partialFilterExpression: { status: "pending" } });

export const Tenancy = mongoose.model("Tenancy", tenancySchema);

// =============================================================================
// Service: room availability
// =============================================================================
const AVAILABLE_ROOM = {
  "occupancy.status": "available",
  "occupancy.tenancyId": null,
  "occupancy.since": null,
  "occupancy.until": null,
};

/**
 * Frees the room held by a tenancy. Idempotent and safe to call concurrently:
 * every step is conditional on the tenancy still holding the room.
 * An "active" tenancy that has run its course becomes "completed"; one that was
 * terminated early by mutual consent stays "terminated".
 */
export async function releaseHold(tenancy, now = new Date()) {
  const completed = await Tenancy.updateOne(
    { _id: tenancy._id, holdsRoom: true, status: "active" },
    { $set: { status: "completed", holdsRoom: false, releasedAt: now }, $inc: { rev: 1 } }
  );
  if (!completed.modifiedCount) {
    await Tenancy.updateOne(
      { _id: tenancy._id, holdsRoom: true },
      { $set: { holdsRoom: false, releasedAt: now }, $inc: { rev: 1 } }
    );
  }

  // Only free the room if THIS tenancy is still the one occupying it.
  const before = await Room.findOneAndUpdate(
    { _id: tenancy.roomId, "occupancy.tenancyId": tenancy._id },
    { $set: AVAILABLE_ROOM },
    { new: false }
  );

  // Re-open the listing only if the system (not the owner) closed it when the room was taken.
  if (before && before.autoClosedByTenancy) {
    await Listing.updateOne({ _id: before.listingId, status: "closed" }, { $set: { status: "active" } });
    await Room.updateOne({ _id: before._id }, { $set: { autoClosedByTenancy: false } });
  }
}

/**
 * Lazily releases every tenancy whose end date has passed (rooms become available again
 * without needing a background job). `filter` narrows the sweep, e.g. { roomId } or a user.
 */
export async function releaseElapsedTenancies(filter = {}, now = new Date()) {
  const due = await Tenancy.find({ holdsRoom: true, endDate: { $lte: now }, ...filter }).limit(200);
  for (const tenancy of due) {
    await releaseHold(tenancy, now);
  }
  return due.length;
}

/** Public-safe availability of a room (never includes who occupies it). */
export function describeAvailability(room, listing) {
  if (!room || !room.isLive || !listing) {
    return { status: "unavailable", availableFrom: null };
  }
  if (room.occupancy?.status === "occupied") {
    return { status: "occupied", availableFrom: room.occupancy.until || null };
  }
  if (listing.status !== "active") {
    return { status: "unavailable", availableFrom: null };
  }
  return { status: "available", availableFrom: listing.roomDetails?.availableFrom || null };
}

// =============================================================================
// Service: room listing gate & duplicate detection
// =============================================================================
/**
 * Every rule that decides whether someone may list a room lives here, on the backend.
 * Nothing the client sends (verified flags, IDs, ownership claims) is trusted.
 */

export const DUPLICATE_RULES = Object.freeze({
  photoOverlap: 0.5, // share of a room's photos that match another room's photos
  rentTolerance: 0.1, // +/-10% rent counts as "same price"
});

export const deny = (status, code, error) => ({ ok: false, status, code, error });

export const ROOM_IDENTITY_TAKEN_ERROR = "This room is already listed (same location, address, flat and room). It cannot be listed again.";

/**
 * Document verification (identity + ownership) is OPTIONAL by default so owners can list a room just by giving
 * its address. Set REQUIRE_OWNER_VERIFICATION=true in server/.env to restore the strict mode in which an admin must
 * verify the owner's identity and the property's ownership documents before any room can be listed or booked.
 */
export const strictVerification = () => String(process.env.REQUIRE_OWNER_VERIFICATION || "").toLowerCase() === "true";

export function sendDeny(res, result) {
  return res.status(result.status).json({
    success: false,
    error: result.error,
    code: result.code,
  });
}

export async function findPropertyByRef(ref) {
  if (typeof ref !== "string" && !(ref instanceof mongoose.Types.ObjectId)) return null;
  const value = String(ref).trim();
  if (!value) return null;
  if (isValidCode("property", value)) {
    return Property.findOne({ propertyCode: normalizeCode(value), isActive: true });
  }
  if (/^[0-9a-fA-F]{24}$/.test(value)) {
    return Property.findOne({ _id: value, isActive: true });
  }
  return null;
}

/**
 * Decides whether `user` may list rooms for the property.
 * Allowed ONLY when the property's ownership is verified, its owner's identity is verified, and
 * the user is either that owner or holds an active permission granted by that owner.
 */
export async function authorizeRoomListing(user, propertyRef) {
  if (user.role === "admin") {
    return deny(403, "ADMIN_CANNOT_LIST", "Master Admin accounts cannot post consumer marketplace listings. Use a regular user account.");
  }
  if (!propertyRef) {
    return deny(
      400,
      "PROPERTY_REQUIRED",
      "A verified property is required to list a room. Register your property, get its ownership verified, then send its propertyId."
    );
  }

  // Same answer whether the property is missing or belongs to someone else, so IDs cannot be probed.
  const notAllowed = deny(
    403,
    "NOT_AUTHORIZED_FOR_PROPERTY",
    "You are not authorised to list rooms for this property. Only its verified owner, or someone the owner has authorised, can do this."
  );

  const property = await findPropertyByRef(propertyRef);
  if (!property) return notAllowed;

  const isOwner = String(property.ownerId) === String(user._id);
  let permission = null;
  if (!isOwner) {
    permission = await OwnerPermission.findOne({
      propertyId: property._id,
      delegateId: user._id,
      grantedBy: property.ownerId,
      status: "active",
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    });
    if (!permission) return notAllowed;
  }

  if (strictVerification() && property.ownership?.status !== "verified") {
    return deny(403, "PROPERTY_NOT_VERIFIED", "This property's ownership has not been verified yet. Rooms can only be listed after an administrator verifies the ownership documents.");
  }

  const owner = isOwner ? user : await User.findById(property.ownerId);
  if (!owner) return notAllowed;
  if (strictVerification() && owner.identity?.status !== "verified") {
    return deny(403, "OWNER_NOT_VERIFIED", "The property owner's identity is not verified, so rooms cannot be listed for this property.");
  }
  if (!isOwner && typeof owner.isSuspended === "function" && owner.isSuspended().suspended) {
    return deny(403, "OWNER_SUSPENDED", "The property owner's account is currently suspended.");
  }

  return { ok: true, property, owner, via: isOwner ? "owner" : "permission", permission };
}

function rentsMatch(a, b) {
  const x = Number(a) || 0;
  const y = Number(b) || 0;
  if (x === 0 && y === 0) return true;
  return Math.abs(x - y) <= Math.max(x, y) * DUPLICATE_RULES.rentTolerance;
}

/**
 * Looks for an existing live room that the candidate duplicates.
 *  1. Same property + same unit/room number                              -> DUPLICATE_ROOM (address + room identity)
 *  2. Same property, mostly the same photos, same type and similar rent  -> DUPLICATE_ROOM (room details + photos)
 *  3. Mostly the same photos as a room in a different property           -> DUPLICATE_PHOTOS (re-used / stolen photos)
 * Photos that merely repeat inside ONE property with different rooms (shared building photos) are allowed.
 */
export async function findDuplicateRoom({ property, unitKey, roomType, rent, photoEntries, excludeRoomId = null }) {
  const notSelf = excludeRoomId ? { _id: { $ne: excludeRoomId } } : {};

  if (unitKey) {
    // Compare canonical forms, so rooms saved before the key was canonicalised ("room2") still match "2" / "R2".
    const inProperty = await Room.find({ propertyId: property._id, isLive: true, ...notSelf }).select("unitKey unitNumber").lean();
    const sameUnit = inProperty.find((r) => r.unitKey === unitKey || unitKeyOf(r.unitNumber) === unitKey);
    if (sameUnit) {
      return deny(409, "DUPLICATE_ROOM", "This room is already listed for this property (same room/unit number).");
    }
  }

  if (!photoEntries.length) return null;

  const shas = photoEntries.map((p) => p.sha256);
  const exact = await Room.find({ isLive: true, "photos.sha256": { $in: shas }, ...notSelf })
    .select("roomCode propertyId listingId photos")
    .lean();
  const candidates = new Map(exact.map((r) => [String(r._id), r]));

  if (photoEntries.some((p) => p.phash)) {
    const perceptual = await Room.find({ isLive: true, "photos.phash": { $type: "string" }, ...notSelf })
      .select("roomCode propertyId listingId photos")
      .limit(5000)
      .lean();
    for (const r of perceptual) candidates.set(String(r._id), r);
  }

  for (const other of candidates.values()) {
    if (photoOverlapRatio(photoEntries, other.photos || []) < DUPLICATE_RULES.photoOverlap) continue;

    const sameProperty = other.propertyId && String(other.propertyId) === String(property._id);
    if (!sameProperty) {
      return deny(409, "DUPLICATE_PHOTOS", "These photos are already used by another room listing. Please upload your own photos of this room.");
    }

    const otherListing = await Listing.findById(other.listingId).select("roomDetails").lean();
    const sameType = (otherListing?.roomDetails?.roomType || "Single") === (roomType || "Single");
    if (sameType && rentsMatch(otherListing?.roomDetails?.rent, rent)) {
      return deny(409, "DUPLICATE_ROOM", "A room with the same photos, type and rent is already listed for this property.");
    }
  }
  return null;
}

/**
 * Runs ALL checks for a new room listing and reserves its Room record (and Room ID).
 * Call this BEFORE creating the Listing; if creating the Listing then fails, call ctx.rollback().
 */
export async function reserveRoomForListing({ user, propertyRef, unitNumber, floor, roomType, rent, photos, latitude = null, longitude = null }) {
  const auth = await authorizeRoomListing(user, propertyRef);
  if (!auth.ok) return auth;
  const { property } = auth;

  const unit = typeof unitNumber === "number" ? String(unitNumber) : typeof unitNumber === "string" ? unitNumber.trim() : "";
  const unitKey = unitKeyOf(unit);
  if (!unitKey || unit.length > 40) {
    return deny(400, "UNIT_REQUIRED", "unitNumber (the room / flat number or name, up to 40 characters) is required.");
  }

  const { entries, invalid } = await fingerprintPhotos(Array.isArray(photos) ? photos : []);
  if (invalid.length) {
    return deny(400, "INVALID_PHOTO_SOURCE", "Room photos must be uploaded through the app. External or missing image links are not accepted.");
  }

  const identityKey = roomIdentityKey({ address: property.address, latitude, longitude, unitNumber: unit });
  if (identityKey && (await Room.exists({ identityKey, isLive: true }))) return deny(409, "DUPLICATE_ROOM", ROOM_IDENTITY_TAKEN_ERROR);

  const duplicate = await findDuplicateRoom({ property, unitKey, roomType, rent, photoEntries: entries });
  if (duplicate) return duplicate;

  const listingId = new mongoose.Types.ObjectId();
  // Room ID is generated from the property's address + the room/unit; a retired room with the same address keeps its ID, so use the next revision.
  let roomCode;
  for (let rev = 0; rev < 20; rev += 1) {
    const candidate = roomCodeFromAddress(property.addressKey, unitKey, rev);
    if (!(await Room.exists({ roomCode: candidate }))) {
      roomCode = candidate;
      break;
    }
  }
  let room;
  try {
    room = await Room.create({
      roomCode,
      listingId,
      propertyId: property._id,
      ownerId: property.ownerId,
      listedBy: user._id,
      listedVia: auth.via,
      permissionId: auth.permission?._id || null,
      unitNumber: unit,
      unitKey,
      ...(identityKey ? { identityKey } : {}),
      floor: String(floor ?? "").trim().slice(0, 20),
      photos: entries.map(({ sha256, phash }) => ({ sha256, phash })),
    });
  } catch (err) {
    // Two simultaneous requests for the same unit: the unique index lets exactly one through.
    if (err?.code === 11000 && (err.keyPattern?.identityKey || /unique_live_room_identity/.test(err.message || ""))) {
      return deny(409, "DUPLICATE_ROOM", ROOM_IDENTITY_TAKEN_ERROR);
    }
    if (err?.code === 11000 && err.keyPattern && "unitKey" in err.keyPattern) {
      return deny(409, "DUPLICATE_ROOM", "This room is already listed for this property (same room/unit number).");
    }
    throw err;
  }

  return {
    ok: true,
    listingId,
    roomCode: room.roomCode,
    propertyCode: property.propertyCode,
    property,
    room,
    rollback: async () => {
      await Room.deleteOne({ _id: room._id });
    },
  };
}

/** Stamps the server-controlled identity and location of a verified property onto a listing payload. */
export function applyReservedRoom(payload, ctx) {
  payload._id = ctx.listingId;
  payload.roomCode = ctx.roomCode;
  payload.propertyCode = ctx.propertyCode;
  payload.locality = ctx.property.address.locality;
  if (ctx.property.latitude != null && ctx.property.longitude != null) {
    payload.latitude = ctx.property.latitude;
    payload.longitude = ctx.property.longitude;
    payload.location = { type: "Point", coordinates: [ctx.property.longitude, ctx.property.latitude] };
  }
  return payload;
}

/** Room record for a listing, or null for legacy rooms that predate this feature. */
export async function getRoomForListing(listingId) {
  return Room.findOne({ listingId });
}

/** Creates the Room record (and Room ID) for a room listing that predates verification. */
export async function ensureRoomForListing(listing) {
  let room = await Room.findOne({ listingId: listing._id });
  if (room) return room;
  try {
    room = await Room.create({
      listingId: listing._id,
      propertyId: null,
      ownerId: listing.ownerId,
      listedBy: listing.ownerId,
      listedVia: "legacy",
      unitNumber: "Main",
      unitKey: `legacy${listing._id}`,
    });
  } catch (err) {
    if (err?.code === 11000) {
      room = await Room.findOne({ listingId: listing._id });
      if (room) return room;
    }
    throw err;
  }
  await Listing.updateOne({ _id: listing._id, roomCode: { $exists: false } }, { $set: { roomCode: room.roomCode } });
  return room;
}

/**
 * Validates replacing a room listing's photos (so duplicates cannot be slipped in after creation).
 * Returns { ok, commit } - call commit() after the listing has been saved.
 */
export async function prepareRoomPhotoUpdate(listing, newPhotos) {
  const room = await Room.findOne({ listingId: listing._id, isLive: true });
  if (!room || !room.propertyId) return { ok: true, commit: async () => {} };

  const { entries, invalid } = await fingerprintPhotos(newPhotos);
  if (invalid.length) {
    return deny(400, "INVALID_PHOTO_SOURCE", "Room photos must be uploaded through the app. External or missing image links are not accepted.");
  }
  const property = await Property.findById(room.propertyId);
  if (!property) return { ok: true, commit: async () => {} };

  const duplicate = await findDuplicateRoom({
    property,
    unitKey: null,
    roomType: listing.roomDetails?.roomType,
    rent: listing.roomDetails?.rent,
    photoEntries: entries,
    excludeRoomId: room._id,
  });
  if (duplicate) return duplicate;

  return {
    ok: true,
    commit: async () => {
      await Room.updateOne({ _id: room._id }, { $set: { photos: entries.map(({ sha256, phash }) => ({ sha256, phash })) } });
    },
  };
}

/** Re-checks authority before a room listing is switched back to "active". */
export async function assertRoomMayBeActive(listing, actor) {
  const room = await Room.findOne({ listingId: listing._id, isLive: true });
  if (!room) return { ok: true };

  await releaseElapsedTenancies({ roomId: room._id });
  const fresh = await Room.findById(room._id);
  if (fresh?.occupancy?.status === "occupied") {
    return deny(409, "ROOM_OCCUPIED", "This room is currently occupied, so it cannot be listed as available until the tenancy ends.");
  }
  if (actor.role === "admin" || !room.propertyId) return { ok: true };

  const auth = await authorizeRoomListing(actor, room.propertyId);
  return auth.ok ? { ok: true } : auth;
}

/** A room that is occupied cannot be deleted: that would end a tenancy without both parties' consent. */
export async function assertRoomDeletable(listingId) {
  const room = await Room.findOne({ listingId });
  if (!room) return { ok: true };
  await releaseElapsedTenancies({ roomId: room._id });
  const held = await Tenancy.exists({ roomId: room._id, holdsRoom: true });
  if (held) {
    return deny(409, "ROOM_HAS_ACTIVE_TENANCY", "This room has an active tenancy. It can only be ended early with the consent of both the owner and the tenant.");
  }
  return { ok: true };
}

/** Called after a room listing is deleted: retires its Room (the Room ID is never reused) and clears open requests. */
export async function retireRoomForListing(listingId) {
  const room = await Room.findOneAndUpdate(
    { listingId },
    { $set: { isLive: false, retiredAt: new Date() } },
    { new: true }
  );
  if (room) {
    await Tenancy.updateMany(
      { roomId: room._id, status: "pending" },
      { $set: { status: "declined", declineReason: "listing_removed", decidedAt: new Date() }, $inc: { rev: 1 } }
    );
  }
}

// =============================================================================
// Service: tenancies
// =============================================================================
const isObjectId = (v) => typeof v === "string" && /^[0-9a-fA-F]{24}$/.test(v);

const FREE_ROOM = {
  "occupancy.status": "available",
  "occupancy.tenancyId": null,
  "occupancy.since": null,
  "occupancy.until": null,
};

async function loadTenancyForParty(userId, tenancyId) {
  if (!isObjectId(String(tenancyId))) return { error: deny(404, "TENANCY_NOT_FOUND", "Tenancy not found.") };
  const tenancy = await Tenancy.findById(tenancyId);
  // Strangers get the same answer as a missing record.
  if (!tenancy || !sideOf(tenancy, userId)) return { error: deny(404, "TENANCY_NOT_FOUND", "Tenancy not found.") };
  return { tenancy, side: sideOf(tenancy, userId) };
}

/** Compare-and-swap update: succeeds only if nobody changed the tenancy since it was read. */
async function swap(tenancy, set, extra = {}) {
  return Tenancy.findOneAndUpdate({ _id: tenancy._id, rev: tenancy.rev }, { $set: set, $inc: { rev: 1 }, ...extra }, { new: true });
}

const conflict = () => deny(409, "CONFLICT", "This tenancy was just updated by someone else. Please refresh and try again.");

async function assertPropertyStillVerified(propertyId) {
  if (!propertyId) return { ok: true }; // legacy rooms have no property
  const property = await Property.findById(propertyId).select("ownership isActive");
  if (!property || !property.isActive || (strictVerification() && property.ownership?.status !== "verified")) {
    return deny(409, "PROPERTY_NOT_VERIFIED", "This property's ownership is no longer verified.");
  }
  return { ok: true };
}

// ------------------------------------------------------------------ availability
export async function getAvailability(listingId) {
  if (!isObjectId(String(listingId))) return deny(404, "ROOM_NOT_FOUND", "Room not found.");
  const listing = await Listing.findById(listingId).select("type status roomDetails roomCode");
  if (!listing || listing.type !== "room") return deny(404, "ROOM_NOT_FOUND", "Room not found.");
  const room = await Room.findOne({ listingId });
  if (!room) {
    // Legacy room that has never been booked: nothing can be occupying it.
    return {
      ok: true,
      data: {
        status: listing.status === "active" ? "available" : "unavailable",
        availableFrom: listing.status === "active" ? listing.roomDetails?.availableFrom || null : null,
      },
    };
  }
  await releaseElapsedTenancies({ roomId: room._id });
  const fresh = await Room.findById(room._id);
  const listingFresh = await Listing.findById(listingId).select("status roomDetails");
  return { ok: true, data: { ...describeAvailability(fresh, listingFresh) } };
}

// ------------------------------------------------------------------ booking
export async function requestBooking(tenant, body = {}) {
  if (tenant.role === "admin") {
    return deny(403, "ADMIN_CANNOT_BOOK", "Master Admin accounts cannot rent rooms. Use a standard user account.");
  }
  if (!isObjectId(String(body.listingId))) return deny(400, "LISTING_REQUIRED", "A valid listingId is required.");

  const listing = await Listing.findById(body.listingId);
  if (!listing || listing.type !== "room") return deny(404, "ROOM_NOT_FOUND", "Room not found.");

  const room = await ensureRoomForListing(listing);
  if (!room.isLive) return deny(404, "ROOM_NOT_FOUND", "Room not found.");

  if (String(room.ownerId) === String(tenant._id) || String(room.listedBy) === String(tenant._id)) {
    return deny(400, "OWN_ROOM", "You cannot rent your own room.");
  }

  await releaseElapsedTenancies({ roomId: room._id });
  const freshRoom = await Room.findById(room._id);
  const freshListing = await Listing.findById(listing._id);
  const availability = describeAvailability(freshRoom, freshListing);
  if (availability.status !== "available") {
    return {
      ...deny(409, "ROOM_NOT_AVAILABLE", "This room is not available for booking right now."),
      availableFrom: availability.availableFrom,
    };
  }

  const stillVerified = await assertPropertyStillVerified(room.propertyId);
  if (!stillVerified.ok) return stillVerified;

  const parsed = parseBookingInput(body, new Date(), { availableFrom: listing.roomDetails?.availableFrom });
  if (!parsed.ok) return parsed;

  try {
    const tenancy = await Tenancy.create({
      roomId: room._id,
      listingId: listing._id,
      propertyId: room.propertyId || null,
      ownerId: room.ownerId,
      tenantId: tenant._id,
      status: "pending",
      startDate: parsed.value.startDate,
      endDate: parsed.value.endDate,
      durationMonths: parsed.value.durationMonths,
      rentSnapshot: listing.roomDetails?.rent || 0,
      depositSnapshot: listing.roomDetails?.deposit || 0,
      message: parsed.value.message,
    });
    return { ok: true, tenancy };
  } catch (err) {
    if (err?.code === 11000) {
      return deny(409, "ALREADY_REQUESTED", "You already have a pending request for this room.");
    }
    throw err;
  }
}

export async function cancelBooking(req, tenancyId) {
  const { tenancy, side, error } = await loadTenancyForParty(req.userId, tenancyId);
  if (error) return error;
  if (side !== "tenant") return deny(403, "ONLY_TENANT", "Only the tenant can withdraw a booking request.");
  if (tenancy.status !== "pending") return deny(409, "NOT_PENDING", "Only a pending request can be withdrawn.");
  const updated = await swap(tenancy, { status: "cancelled", decidedAt: new Date() });
  if (!updated) return conflict();
  return { ok: true, tenancy: updated };
}

export async function declineBooking(req, tenancyId, reason) {
  const { tenancy, side, error } = await loadTenancyForParty(req.userId, tenancyId);
  if (error) return error;
  if (side !== "owner") return deny(403, "ONLY_OWNER", "Only the room owner can decline a booking request.");
  if (tenancy.status !== "pending") return deny(409, "NOT_PENDING", "Only a pending request can be declined.");
  const updated = await swap(tenancy, {
    status: "declined",
    decidedAt: new Date(),
    declineReason: typeof reason === "string" ? reason.trim().slice(0, 300) : "",
  });
  if (!updated) return conflict();
  await recordAudit(req, "tenancy.decline", "Tenancy", tenancy._id);
  return { ok: true, tenancy: updated };
}

/**
 * Owner accepts a request. The room is claimed with ONE atomic conditional update, so if two
 * requests are accepted at the same moment exactly one succeeds. A unique partial index on
 * Tenancy.holdsRoom is a second, database-level guard.
 */
export async function acceptBooking(req, tenancyId) {
  const { tenancy, side, error } = await loadTenancyForParty(req.userId, tenancyId);
  if (error) return error;
  if (side !== "owner") return deny(403, "ONLY_OWNER", "Only the room owner can accept a booking request.");
  if (tenancy.status !== "pending") return deny(409, "NOT_PENDING", "Only a pending request can be accepted.");

  const now = new Date();
  if (new Date(tenancy.endDate) <= now) {
    return deny(409, "REQUEST_EXPIRED", "This request's rental period has already passed. Ask the tenant to submit a new request.");
  }

  const stillVerified = await assertPropertyStillVerified(tenancy.propertyId);
  if (!stillVerified.ok) return stillVerified;

  await releaseElapsedTenancies({ roomId: tenancy.roomId });

  const claimed = await Room.findOneAndUpdate(
    { _id: tenancy.roomId, isLive: true, "occupancy.status": { $ne: "occupied" } },
    {
      $set: {
        "occupancy.status": "occupied",
        "occupancy.tenancyId": tenancy._id,
        "occupancy.since": now,
        "occupancy.until": tenancy.endDate,
      },
    },
    { new: true }
  );
  if (!claimed) {
    return deny(409, "ROOM_NOT_AVAILABLE", "This room has already been taken by another tenant.");
  }

  let activated = null;
  try {
    activated = await swap(tenancy, { status: "active", holdsRoom: true, decidedAt: now });
  } catch (err) {
    activated = null; // e.g. unique-index violation: some other tenancy already holds the room
  }
  if (!activated) {
    await Room.updateOne({ _id: tenancy.roomId, "occupancy.tenancyId": tenancy._id }, { $set: FREE_ROOM });
    return deny(409, "ROOM_NOT_AVAILABLE", "This room could not be reserved because it was just taken or the request changed.");
  }

  // Other open requests for this room can no longer be fulfilled.
  await Tenancy.updateMany(
    { roomId: tenancy.roomId, status: "pending", _id: { $ne: tenancy._id } },
    { $set: { status: "declined", declineReason: "room_taken", decidedAt: now }, $inc: { rev: 1 } }
  );

  // Take the listing off the public list while occupied (and remember the system did it, so it re-opens automatically).
  const closed = await Listing.updateOne({ _id: tenancy.listingId, status: "active" }, { $set: { status: "closed" } });
  if (closed.modifiedCount) {
    await Room.updateOne({ _id: tenancy.roomId }, { $set: { autoClosedByTenancy: true } });
  }

  await recordAudit(req, "tenancy.accept", "Tenancy", tenancy._id);
  return { ok: true, tenancy: activated };
}

// ------------------------------------------------------------------ early termination (needs BOTH parties)
async function runTermination(req, tenancyId, decide, auditAction) {
  const { tenancy, side, error } = await loadTenancyForParty(req.userId, tenancyId);
  if (error) return error;

  await releaseElapsedTenancies({ _id: tenancy._id });
  const current = await Tenancy.findById(tenancy._id);

  const decision = decide(current.toObject(), side);
  if (!decision.ok) return decision;

  const extra = decision.historyEntry ? { $push: { terminationHistory: decision.historyEntry } } : {};
  const updated = await swap(current, decision.set, extra);
  if (!updated) return conflict();

  await recordAudit(req, auditAction(decision), "Tenancy", tenancy._id);

  // Agreed early termination: free the room as soon as the effective date is reached.
  if (decision.outcome === "agreed") {
    await releaseElapsedTenancies({ _id: updated._id });
  }
  return { ok: true, tenancy: await Tenancy.findById(updated._id), outcome: decision.outcome || "requested" };
}

export function requestTermination(req, tenancyId, input = {}) {
  return runTermination(
    req,
    tenancyId,
    (t, side) => decideTerminationRequest(t, side, { reason: input.reason, effectiveDate: input.effectiveDate }),
    () => "tenancy.termination.request"
  );
}

export function respondToTermination(req, tenancyId, agree) {
  return runTermination(
    req,
    tenancyId,
    (t, side) => decideTerminationResponse(t, side, agree),
    (d) => `tenancy.termination.${d.outcome}`
  );
}

export function withdrawTermination(req, tenancyId) {
  return runTermination(
    req,
    tenancyId,
    (t, side) => decideTerminationWithdraw(t, side),
    () => "tenancy.termination.withdrawn"
  );
}

// ------------------------------------------------------------------ reading
export async function listTenancies(userId) {
  await releaseElapsedTenancies({ $or: [{ ownerId: userId }, { tenantId: userId }] });
  return Tenancy.find({ $or: [{ ownerId: userId }, { tenantId: userId }] }).sort({ createdAt: -1 }).limit(100);
}

export async function getTenancyForParty(userId, tenancyId) {
  const { tenancy, error } = await loadTenancyForParty(userId, tenancyId);
  if (error) return error;
  await releaseElapsedTenancies({ _id: tenancy._id });
  return { ok: true, tenancy: await Tenancy.findById(tenancy._id) };
}

/**
 * Builds API responses. Private details are shared only when appropriate:
 * the counterpart's phone/email and the property's full address are revealed only while the tenancy is active.
 */
export async function serializeTenancies(tenancies, viewerId) {
  const list = Array.isArray(tenancies) ? tenancies : [tenancies];
  const userIds = [...new Set(list.flatMap((t) => [String(t.ownerId), String(t.tenantId)]))];
  const listingIds = list.map((t) => t.listingId);
  const roomIds = list.map((t) => t.roomId);
  const propertyIds = list.filter((t) => t.propertyId).map((t) => t.propertyId);

  const [users, listings, rooms, properties] = await Promise.all([
    User.find({ _id: { $in: userIds } }).select("name userCode phone email").lean(),
    Listing.find({ _id: { $in: listingIds } }).select("title locality").lean(),
    Room.find({ _id: { $in: roomIds } }).select("roomCode unitNumber").lean(),
    Property.find({ _id: { $in: propertyIds } }).select("propertyCode address").lean(),
  ]);
  const byId = (arr) => new Map(arr.map((x) => [String(x._id), x]));
  const userMap = byId(users);
  const listingMap = byId(listings);
  const roomMap = byId(rooms);
  const propertyMap = byId(properties);

  const out = list.map((t) => {
    const side = sideOf(t, viewerId);
    const counterpartId = String(side === "owner" ? t.tenantId : t.ownerId);
    const counterpart = userMap.get(counterpartId);
    const reveal = t.status === "active";
    const listing = listingMap.get(String(t.listingId));
    const room = roomMap.get(String(t.roomId));
    const property = t.propertyId ? propertyMap.get(String(t.propertyId)) : null;

    return {
      id: t._id.toString(),
      myRole: side,
      status: t.status,
      room: {
        listingId: t.listingId.toString(),
        title: listing?.title || "Room",
        locality: listing?.locality || "",
        unitNumber: room?.unitNumber || undefined,
      },
      counterpart: counterpart
        ? {
            name: counterpart.name,
            userCode: counterpart.userCode || null,
            phone: reveal ? counterpart.phone || "" : undefined,
            email: reveal ? counterpart.email || "" : undefined,
          }
        : { name: "Deleted user" },
      address: reveal && property ? property.address : undefined,
      startDate: t.startDate,
      endDate: t.endDate,
      durationMonths: t.durationMonths,
      rent: t.rentSnapshot,
      deposit: t.depositSnapshot,
      message: t.message,
      declineReason: t.status === "declined" ? t.declineReason : undefined,
      termination:
        t.termination && t.termination.status !== "none"
          ? {
              status: t.termination.status,
              initiatedBy: t.termination.initiatedBy,
              ownerConsent: t.termination.ownerConsent,
              tenantConsent: t.termination.tenantConsent,
              reason: t.termination.reason,
              effectiveDate: t.termination.effectiveDate,
              requestedAt: t.termination.requestedAt,
              respondedAt: t.termination.respondedAt,
              awaitingMyResponse:
                t.termination.status === "pending" && t.termination.initiatedBy !== side && t.status === "active",
            }
          : undefined,
      terminatedAt: t.terminatedAt || undefined,
      createdAt: t.createdAt,
    };
  });
  return Array.isArray(tenancies) ? out : out[0];
}

// =============================================================================
// Service: account cleanup
// =============================================================================
/**
 * A user with a running tenancy cannot delete their account (or be deleted),
 * otherwise a party could end a tenancy without the other party's consent.
 */
export async function assertNoActiveTenancy(userId) {
  // Covers tenancies where the user is a party AND rooms the user listed (e.g. on someone else's property).
  const myRooms = await Room.find({ $or: [{ listedBy: userId }, { ownerId: userId }] }).select("_id");
  const party = { $or: [{ ownerId: userId }, { tenantId: userId }, { roomId: { $in: myRooms.map((r) => r._id) } }] };
  await releaseElapsedTenancies(party);
  const held = await Tenancy.exists({ holdsRoom: true, ...party });
  if (held) {
    return deny(
      409,
      "ACTIVE_TENANCY",
      "This account has an active tenancy. A running tenancy can only be ended early with the consent of both the owner and the tenant, so the account cannot be deleted yet."
    );
  }
  return { ok: true };
}

/**
 * Permanently erases the user's private verification data (DPDP Act erasure):
 * uploaded identity/ownership documents (encrypted files AND records), permissions,
 * properties, room records and tenancy history. Call AFTER assertNoActiveTenancy and
 * after the user's own listings have been removed.
 */
export async function purgeUserVerificationData(userId) {
  const now = new Date();

  // Ratings given or received by this user are part of their personal data.
  await UserRating.deleteMany({ $or: [{ raterId: userId }, { ratedUserId: userId }] });

  const documents = await VerificationDocument.find({ uploaderId: userId }).select("storageKey");
  for (const doc of documents) await deleteStored(doc.storageKey);
  await VerificationDocument.deleteMany({ uploaderId: userId });

  await OwnerPermission.deleteMany({ $or: [{ grantedBy: userId }, { delegateId: userId }] });

  // Rooms others listed on this user's properties: take them off the market and retire them.
  const properties = await Property.find({ ownerId: userId }).select("_id");
  const propertyIds = properties.map((p) => p._id);
  if (propertyIds.length) {
    const orphaned = await Room.find({ propertyId: { $in: propertyIds }, listedBy: { $ne: userId } }).select("listingId");
    await Listing.updateMany({ _id: { $in: orphaned.map((r) => r.listingId) } }, { $set: { status: "hidden" } });
    await Room.updateMany({ propertyId: { $in: propertyIds } }, { $set: { isLive: false, retiredAt: now } });
    const docsOnProperties = await VerificationDocument.find({ propertyId: { $in: propertyIds } }).select("storageKey");
    for (const doc of docsOnProperties) await deleteStored(doc.storageKey);
    await VerificationDocument.deleteMany({ propertyId: { $in: propertyIds } });
    await Property.deleteMany({ ownerId: userId });
  }

  // The user's own listings are deleted by the caller; remove their room records and all tenancy history.
  const listedRooms = await Room.find({ listedBy: userId }).select("_id");
  await Tenancy.deleteMany({
    $or: [{ ownerId: userId }, { tenantId: userId }, { roomId: { $in: listedRooms.map((r) => r._id) } }],
    holdsRoom: false,
  });
  await Room.deleteMany({ listedBy: userId });
}

// =============================================================================
// Service: verification documents
// =============================================================================
export const MAX_DOCS_PER_SUBJECT = 10;

// Held in memory only: the plaintext is encrypted before anything is written to disk.
const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1, fields: 10 },
  fileFilter(_req, file, cb) {
    if (ALLOWED_DOCUMENT_MIMES.includes(file.mimetype)) return cb(null, true);
    cb(new Error("Unsupported file type. Upload a PDF, JPG, PNG or WEBP document."), false);
  },
});

/** Express middleware: parses a single "document" file plus text fields, with friendly errors. */
export function handleDocumentUpload(req, res, next) {
  documentUpload.single("document")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const error =
        err.code === "LIMIT_FILE_SIZE"
          ? `Document is too large. Maximum size is ${Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024))}MB.`
          : err.message;
      return res.status(400).json({ success: false, error, code: "INVALID_UPLOAD" });
    }
    if (err) return res.status(400).json({ success: false, error: err.message, code: "INVALID_UPLOAD" });
    next();
  });
}

/** Validates, encrypts and records one uploaded document. */
export async function storeVerificationDocument({ uploader, file, purpose, docType, property = null }) {
  if (!file) return deny(400, "FILE_REQUIRED", "Attach the document file in the 'document' field.");

  const allowed = purpose === "identity" ? IDENTITY_DOC_TYPES : OWNERSHIP_DOC_TYPES;
  if (!allowed.includes(docType)) {
    return deny(400, "INVALID_DOC_TYPE", `docType must be one of: ${allowed.join(", ")}.`);
  }

  // Trust the file's real bytes, never the client-declared MIME type.
  const realMime = sniffMime(file.buffer);
  if (!realMime || !ALLOWED_DOCUMENT_MIMES.includes(realMime)) {
    return deny(400, "INVALID_FILE_TYPE", "The file is not a valid PDF, JPG, PNG or WEBP document.");
  }

  const count = await VerificationDocument.countDocuments(
    purpose === "identity"
      ? { uploaderId: uploader._id, purpose: "identity" }
      : { propertyId: property._id, purpose: "ownership" }
  );
  if (count >= MAX_DOCS_PER_SUBJECT) {
    return deny(409, "TOO_MANY_DOCUMENTS", `You can keep at most ${MAX_DOCS_PER_SUBJECT} documents here. Delete one before adding another.`);
  }

  const sha256 = sha256Hex(file.buffer);
  const reused = await VerificationDocument.findOne({ sha256, uploaderId: { $ne: uploader._id } }).select("uploaderId");

  const stored = await storeEncrypted(file.buffer); // throws a 503 error if the vault is not configured
  try {
    const doc = await VerificationDocument.create({
      uploaderId: uploader._id,
      purpose,
      propertyId: property ? property._id : null,
      docType,
      originalName: sanitizeFileName(file.originalname),
      mimeType: realMime,
      size: file.buffer.length,
      storageKey: stored.storageKey,
      iv: stored.iv,
      tag: stored.tag,
      sha256,
      duplicateOfUploaderId: reused ? reused.uploaderId : undefined,
    });
    return { ok: true, doc };
  } catch (err) {
    await deleteStored(stored.storageKey); // never leave an orphaned encrypted file behind
    throw err;
  }
}

/** Only the uploader or an administrator may read a document; everyone else gets "not found". */
export async function loadReadableDocument(req, id) {
  if (!/^[0-9a-fA-F]{24}$/.test(String(id))) return null;
  const doc = await VerificationDocument.findById(id);
  if (!doc) return null;
  const isUploader = String(doc.uploaderId) === String(req.userId);
  if (!isUploader && req.userRole !== "admin") return null;
  return doc;
}

export async function sendDocument(req, res, doc) {
  const plain = await readDecrypted(doc);
  await recordAudit(req, "document.view", "VerificationDocument", doc._id, { purpose: doc.purpose });
  const isImage = doc.mimeType.startsWith("image/");
  res.set({
    "Content-Type": doc.mimeType,
    "Content-Length": String(plain.length),
    "Content-Disposition": `${isImage ? "inline" : "attachment"}; filename="${sanitizeFileName(doc.originalName)}"`,
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cross-Origin-Resource-Policy": "same-origin",
  });
  return res.send(plain);
}

/** Removes a rejected/pending document (file + record) and fixes the subject's status if nothing is left to review. */
export async function removeDocument(doc) {
  await deleteStored(doc.storageKey);
  await doc.deleteOne();

  const stillPending = await VerificationDocument.exists(
    doc.purpose === "identity"
      ? { uploaderId: doc.uploaderId, purpose: "identity", status: "pending" }
      : { propertyId: doc.propertyId, purpose: "ownership", status: "pending" }
  );
  if (stillPending) return;
  if (doc.purpose === "identity") {
    await User.updateOne({ _id: doc.uploaderId, "identity.status": "pending" }, { $set: { "identity.status": "unverified" } });
  } else {
    await Property.updateOne({ _id: doc.propertyId, "ownership.status": "pending" }, { $set: { "ownership.status": "unverified" } });
  }
}

/** Takes the room listings of the given properties off the market (used when verification is revoked). */
export async function hideListingsForProperties(propertyIds, extraRoomFilter = {}) {
  if (!propertyIds.length) return 0;
  const rooms = await Room.find({ propertyId: { $in: propertyIds }, isLive: true, ...extraRoomFilter }).select("listingId");
  if (!rooms.length) return 0;
  const res = await Listing.updateMany(
    { _id: { $in: rooms.map((r) => r.listingId) }, status: { $in: ["active", "closed"] } },
    { $set: { status: "hidden" } }
  );
  return res.modifiedCount || 0;
}

export async function hideListingsForOwner(ownerId) {
  const properties = await Property.find({ ownerId }).select("_id");
  return hideListingsForProperties(properties.map((p) => p._id));
}

// =============================================================================
// Routes: /verification
// =============================================================================
const verificationRouter = Router();

export const documentUploadLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: "Document upload limit reached. Please wait a few minutes before uploading more documents.",
});

/**
 * GET /api/verification/me
 * The caller's own User ID, identity verification status and uploaded identity documents.
 */
verificationRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const userCode = await req.user.ensureUserCode();
    const documents = await VerificationDocument.find({ uploaderId: req.userId, purpose: "identity" }).sort({ createdAt: -1 });
    const properties = await Property.find({ ownerId: req.userId, isActive: true }).select("propertyCode ownership");
    res.json({
      success: true,
      data: {
        userCode,
        identity: {
          status: req.user.identity?.status || "unverified",
          note: req.user.identity?.status === "rejected" ? req.user.identity?.note || "" : "",
          reviewedAt: req.user.identity?.reviewedAt || null,
        },
        documents: documents.map((d) => d.toOwnerJSON()),
        properties: properties.map((p) => ({ id: p._id.toString(), ownershipStatus: p.ownership?.status || "unverified" })),
        acceptedDocumentTypes: { identity: IDENTITY_DOC_TYPES, ownership: OWNERSHIP_DOC_TYPES },
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/verification/identity/documents   (multipart: document=<file>, docType=<type>)
 * Uploads an identity document for administrator review.
 */
verificationRouter.post("/identity/documents", documentUploadLimiter, requireAuth, handleDocumentUpload, async (req, res, next) => {
  try {
    if (req.userRole === "admin") {
      return res.status(403).json({ success: false, error: "Administrator accounts do not need identity verification.", code: "ADMIN_NOT_ALLOWED" });
    }
    if (req.user.identity?.status === "verified") {
      return res.status(409).json({ success: false, error: "Your identity is already verified.", code: "ALREADY_VERIFIED" });
    }

    const result = await storeVerificationDocument({
      uploader: req.user,
      file: req.file,
      purpose: "identity",
      docType: String(req.body?.docType || "").trim(),
    });
    if (!result.ok) return sendDeny(res, result);

    await User.updateOne({ _id: req.userId }, { $set: { "identity.status": "pending", "identity.note": "" } });
    await recordAudit(req, "identity.document.upload", "VerificationDocument", result.doc._id);

    res.status(201).json({ success: true, data: { document: result.doc.toOwnerJSON(), identityStatus: "pending" } });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/verification/documents/:id/file
 * Streams a decrypted document. Only the uploader (or an administrator) may read it.
 */
verificationRouter.get("/documents/:id/file", requireAuth, async (req, res, next) => {
  try {
    const doc = await loadReadableDocument(req, req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: "Document not found.", code: "DOCUMENT_NOT_FOUND" });
    await sendDocument(req, res, doc);
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/verification/documents/:id - remove one of your own documents that has not been approved. */
verificationRouter.delete("/documents/:id", requireAuth, async (req, res, next) => {
  try {
    const doc = await loadReadableDocument(req, req.params.id);
    if (!doc || String(doc.uploaderId) !== String(req.userId)) {
      return res.status(404).json({ success: false, error: "Document not found.", code: "DOCUMENT_NOT_FOUND" });
    }
    if (doc.status === "approved") {
      return res.status(409).json({
        success: false,
        error: "An approved document is part of your verification record and cannot be removed. Delete your account to erase it.",
        code: "DOCUMENT_APPROVED",
      });
    }
    await removeDocument(doc);
    await recordAudit(req, "document.delete", "VerificationDocument", doc._id);
    res.json({ success: true, message: "Document deleted.", deletedId: req.params.id });
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// Routes: /properties
// =============================================================================
const propertyRouter = Router();
const MAX_PROPERTIES_PER_USER = 25;

const clean = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");

function parseAddress(body = {}) {
  const src = body.address && typeof body.address === "object" ? body.address : body;
  const address = {
    line1: clean(src.line1 ?? src.addressLine1, 160),
    line2: clean(src.line2 ?? src.addressLine2, 160),
    locality: clean(src.locality, 120),
    city: clean(src.city, 80),
    state: clean(src.state, 80),
    pincode: clean(String(src.pincode ?? ""), 6),
    landmark: clean(src.landmark, 160),
  };
  const errors = [];
  if (address.line1.length < 3) errors.push("addressLine1 (house/flat number and street) is required");
  if (address.locality.length < 2) errors.push("locality is required");
  if (address.city.length < 2) errors.push("city is required");
  if (address.state.length < 2) errors.push("state is required");
  if (!PINCODE_REGEX.test(address.pincode)) errors.push("pincode must be a valid 6-digit PIN code");
  return { address, errors };
}

function parseCoordinates(body = {}) {
  if (body.latitude == null && body.longitude == null) return { latitude: null, longitude: null };
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return { error: "latitude and longitude must be valid coordinates" };
  }
  return { latitude, longitude };
}

/** Owner, or someone the owner has authorised, may see a property's private details. */
async function loadAccessibleProperty(req, ref) {
  const property = await findPropertyByRef(ref);
  if (!property) return {};
  if (String(property.ownerId) === String(req.userId)) return { property, role: "owner" };
  if (req.userRole === "admin") return { property, role: "admin" };
  const permission = await OwnerPermission.findOne({
    propertyId: property._id,
    delegateId: req.userId,
    status: "active",
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  });
  return permission ? { property, role: "delegate" } : {};
}

const notFound = (res) => res.status(404).json({ success: false, error: "Property not found.", code: "PROPERTY_NOT_FOUND" });

/**
 * POST /api/properties
 * Registers a property under the caller. A unique Property ID (PRP-XXXXXXXX) is generated automatically.
 * The same physical address cannot be registered twice.
 */
propertyRouter.post("/", requireAuth, async (req, res, next) => {
  try {
    if (req.userRole === "admin") {
      return res.status(403).json({ success: false, error: "Administrator accounts cannot register properties.", code: "ADMIN_NOT_ALLOWED" });
    }

    const { address, errors } = parseAddress(req.body);
    const coords = parseCoordinates(req.body);
    if (coords.error) errors.push(coords.error);
    if (errors.length) {
      return res.status(400).json({ success: false, error: `Invalid property: ${errors.join("; ")}.`, code: "INVALID_PROPERTY" });
    }

    if ((await Property.countDocuments({ ownerId: req.userId, isActive: true })) >= MAX_PROPERTIES_PER_USER) {
      return res.status(409).json({ success: false, error: `You can register at most ${MAX_PROPERTIES_PER_USER} properties.`, code: "TOO_MANY_PROPERTIES" });
    }

    // Duplicate-address detection (exact fingerprint OR very similar text in the same PIN code).
    const sameArea = await Property.find({ isActive: true, "address.pincode": address.pincode }).select("propertyCode ownerId address latitude longitude").lean();
    const match = findSameProperty(sameArea, { address, latitude: coords.latitude, longitude: coords.longitude });
    if (match) {
      if (String(match.ownerId) === String(req.userId)) {
        return res.status(409).json({
          success: false,
          error: "You have already registered this property.",
          code: "DUPLICATE_PROPERTY",
        });
      }
      await recordAudit(req, "property.duplicate_claim", "Property", match._id);
      return res.status(409).json({
        success: false,
        error: "A property with this address is already registered by another account. If you are its rightful owner, please contact support so the claim can be reviewed.",
        code: "PROPERTY_ALREADY_REGISTERED",
      });
    }

    let property;
    try {
      property = await Property.create({ ownerId: req.userId, address, latitude: coords.latitude, longitude: coords.longitude });
    } catch (err) {
      if (err?.code === 11000 && err.keyPattern && "addressKey" in err.keyPattern) {
        return res.status(409).json({ success: false, error: "A property with this address is already registered.", code: "PROPERTY_ALREADY_REGISTERED" });
      }
      throw err;
    }

    await recordAudit(req, "property.register", "Property", property._id);
    res.status(201).json({ success: true, data: property.toOwnerJSON() });
  } catch (err) {
    next(err);
  }
});

/** GET /api/properties - properties you own, plus properties whose owners have authorised you to list rooms. */
propertyRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const owned = await Property.find({ ownerId: req.userId, isActive: true }).sort({ createdAt: -1 });
    const permissions = await OwnerPermission.find({
      delegateId: req.userId,
      status: "active",
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    });
    const delegated = permissions.length
      ? await Property.find({ _id: { $in: permissions.map((p) => p.propertyId) }, isActive: true })
      : [];

    res.json({
      success: true,
      data: {
        owned: owned.map((p) => p.toOwnerJSON()),
        authorisedFor: delegated.map((p) => ({ ...p.toOwnerJSON(), ownershipNote: undefined })),
      },
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/properties/:id - owner / authorised delegate / admin only. :id is the Property ID or the database id. */
propertyRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const { property, role } = await loadAccessibleProperty(req, req.params.id);
    if (!property) return notFound(res);

    const data = property.toOwnerJSON();
    if (role === "owner" || role === "admin") {
      const docs = await VerificationDocument.find({ propertyId: property._id, purpose: "ownership" }).sort({ createdAt: -1 });
      data.documents = docs.map((d) => (role === "admin" ? d.toAdminJSON() : d.toOwnerJSON()));
      data.liveRooms = await Room.countDocuments({ propertyId: property._id, isLive: true });
    } else {
      data.ownershipNote = undefined;
    }
    res.json({ success: true, data, yourRole: role });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/properties/:id/documents   (multipart: document=<file>, docType=<type>)
 * Uploads an ownership document (sale deed, property tax receipt, utility bill ...) for review.
 */
propertyRouter.post("/:id/documents", documentUploadLimiter, requireAuth, handleDocumentUpload, async (req, res, next) => {
  try {
    const { property, role } = await loadAccessibleProperty(req, req.params.id);
    if (!property || role !== "owner") return notFound(res);

    if (property.ownership?.status === "verified") {
      return res.status(409).json({ success: false, error: "This property's ownership is already verified.", code: "ALREADY_VERIFIED" });
    }

    const result = await storeVerificationDocument({
      uploader: req.user,
      file: req.file,
      purpose: "ownership",
      docType: String(req.body?.docType || "").trim(),
      property,
    });
    if (!result.ok) return sendDeny(res, result);

    await Property.updateOne({ _id: property._id }, { $set: { "ownership.status": "pending", "ownership.note": "" } });
    await recordAudit(req, "ownership.document.upload", "VerificationDocument", result.doc._id);

    res.status(201).json({ success: true, data: { document: result.doc.toOwnerJSON(), ownershipStatus: "pending" } });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/properties/:id - remove a property that has no live rooms (also erases its uploaded documents). */
propertyRouter.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const { property, role } = await loadAccessibleProperty(req, req.params.id);
    if (!property || role !== "owner") return notFound(res);

    if (await Room.exists({ propertyId: property._id, isLive: true })) {
      return res.status(409).json({
        success: false,
        error: "This property still has room listings. Remove them first.",
        code: "PROPERTY_HAS_ROOMS",
      });
    }

    const docs = await VerificationDocument.find({ propertyId: property._id });
    for (const doc of docs) await deleteStored(doc.storageKey);
    await VerificationDocument.deleteMany({ propertyId: property._id });
    await OwnerPermission.deleteMany({ propertyId: property._id });
    await property.deleteOne();

    await recordAudit(req, "property.delete", "Property", property._id);
    res.json({ success: true, message: "Property removed.", deletedId: String(property._id) });
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// Routes: /owner-permissions
// =============================================================================
const permissionRouter = Router();

const failJson = (res, status, code, error) => res.status(status).json({ success: false, error, code });

function serializePermission(permission, { property, owner, delegate }) {
  return {
    id: permission._id.toString(),
    status: permission.status,
    note: permission.note,
    expiresAt: permission.expiresAt,
    createdAt: permission.createdAt,
    revokedAt: permission.revokedAt,
    property: property ? { id: property._id.toString(), locality: property.address?.locality } : null,
    owner: owner ? { name: owner.name, userCode: owner.userCode || null } : null,
    delegate: delegate ? { name: delegate.name, userCode: delegate.userCode || null } : null,
  };
}

/**
 * POST /api/owner-permissions
 * body: { propertyId, delegateUserCode, note?, expiresAt? }
 * A VERIFIED owner authorises another user (identified by their User ID) to list rooms for the property.
 */
permissionRouter.post("/", requireAuth, async (req, res, next) => {
  try {
    if (req.userRole === "admin") return failJson(res, 403, "ADMIN_NOT_ALLOWED", "Administrator accounts cannot grant listing permissions.");

    const property = await findPropertyByRef(req.body?.propertyId);
    if (!property || String(property.ownerId) !== String(req.userId)) {
      return failJson(res, 404, "PROPERTY_NOT_FOUND", "Property not found among your properties.");
    }
    if (property.ownership?.status !== "verified" || req.user.identity?.status !== "verified") {
      return failJson(res, 403, "OWNER_NOT_VERIFIED", "Only a verified owner of a verified property can authorise others to list rooms.");
    }

    const code = normalizeCode(req.body?.delegateUserCode);
    if (!isValidCode("user", code)) return failJson(res, 400, "INVALID_USER_ID", "delegateUserCode must be a valid User ID like USR-XXXXXXXX.");

    const delegate = await User.findOne({ userCode: code });
    if (!delegate) return failJson(res, 404, "USER_NOT_FOUND", "No user was found with that User ID.");
    if (String(delegate._id) === String(req.userId)) return failJson(res, 400, "SELF_PERMISSION", "You are already the owner of this property.");
    if (delegate.role === "admin") return failJson(res, 400, "INVALID_DELEGATE", "That account cannot be authorised.");

    let expiresAt = null;
    if (req.body?.expiresAt) {
      expiresAt = new Date(req.body.expiresAt);
      if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
        return failJson(res, 400, "INVALID_EXPIRY", "expiresAt must be a future date.");
      }
    }
    const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 300) : "";

    let permission;
    try {
      permission = await OwnerPermission.create({
        propertyId: property._id,
        grantedBy: req.userId,
        delegateId: delegate._id,
        note,
        expiresAt,
      });
    } catch (err) {
      if (err?.code === 11000) return failJson(res, 409, "PERMISSION_EXISTS", "This user is already authorised for this property.");
      throw err;
    }

    await recordAudit(req, "permission.grant", "OwnerPermission", permission._id);
    res.status(201).json({ success: true, data: serializePermission(permission, { property, owner: req.user, delegate }) });
  } catch (err) {
    next(err);
  }
});

/** GET /api/owner-permissions - permissions you granted, and permissions granted to you. */
permissionRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const permissions = await OwnerPermission.find({ $or: [{ grantedBy: req.userId }, { delegateId: req.userId }] })
      .sort({ createdAt: -1 })
      .limit(200);

    const userIds = [...new Set(permissions.flatMap((p) => [String(p.grantedBy), String(p.delegateId)]))];
    const propertyIds = permissions.map((p) => p.propertyId);
    const [users, properties] = await Promise.all([
      User.find({ _id: { $in: userIds } }).select("name userCode"),
      Property.find({ _id: { $in: propertyIds } }).select("address.locality"),
    ]);
    const userMap = new Map(users.map((u) => [String(u._id), u]));
    const propMap = new Map(properties.map((p) => [String(p._id), p]));

    const rows = permissions.map((p) => ({
      ...serializePermission(p, { property: propMap.get(String(p.propertyId)), owner: userMap.get(String(p.grantedBy)), delegate: userMap.get(String(p.delegateId)) }),
      direction: String(p.grantedBy) === String(req.userId) ? "granted" : "received",
    }));
    res.json({
      success: true,
      data: { granted: rows.filter((r) => r.direction === "granted"), received: rows.filter((r) => r.direction === "received") },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/owner-permissions/:id/revoke
 * The owner (or the authorised user themselves) ends the permission. Rooms that user listed
 * under the permission are taken off the market immediately.
 */
permissionRouter.patch("/:id/revoke", requireAuth, async (req, res, next) => {
  try {
    if (!/^[0-9a-fA-F]{24}$/.test(req.params.id)) return failJson(res, 404, "PERMISSION_NOT_FOUND", "Permission not found.");
    const permission = await OwnerPermission.findById(req.params.id);
    const isParty =
      permission && (String(permission.grantedBy) === String(req.userId) || String(permission.delegateId) === String(req.userId));
    if (!isParty) return failJson(res, 404, "PERMISSION_NOT_FOUND", "Permission not found.");
    if (permission.status === "revoked") return failJson(res, 409, "ALREADY_REVOKED", "This permission is already revoked.");

    permission.status = "revoked";
    permission.revokedAt = new Date();
    permission.revokedBy = req.userId;
    await permission.save();

    const hidden = await hideListingsForProperties([permission.propertyId], { listedBy: permission.delegateId });
    await recordAudit(req, "permission.revoke", "OwnerPermission", permission._id, { hiddenListings: hidden });
    res.json({ success: true, message: "Permission revoked.", hiddenListings: hidden });
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// Routes: /tenancies and /room-availability
// =============================================================================
export const tenancyRouter = Router();
export const availabilityRouter = Router();

const bookingLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 30,
  message: "Too many booking actions. Please wait a few minutes and try again.",
});

/** Sends a service result: errors as JSON, success as the serialised tenancy. */
async function respond(req, res, result, successStatus = 200, extra = {}) {
  if (!result.ok) {
    return res.status(result.status).json({
      success: false,
      error: result.error,
      code: result.code,
      ...(result.availableFrom !== undefined ? { availableFrom: result.availableFrom } : {}),
    });
  }
  const data = await serializeTenancies(result.tenancy, req.userId);
  return res.status(successStatus).json({ success: true, data, ...extra });
}

const wrap = (handler) => async (req, res, next) => {
  try {
    await handler(req, res);
  } catch (err) {
    next(err);
  }
};

/** GET /api/room-availability/:listingId - public: is this room available, occupied or unavailable? */
availabilityRouter.get(
  "/:listingId",
  wrap(async (req, res) => {
    const result = await getAvailability(req.params.listingId);
    if (!result.ok) return sendDeny(res, result);
    res.json({ success: true, data: result.data });
  })
);

/** POST /api/tenancies - a tenant asks to rent a room. body: { listingId, startDate, durationMonths, message? } */
tenancyRouter.post(
  "/",
  bookingLimiter,
  requireAuth,
  wrap(async (req, res) => respond(req, res, await requestBooking(req.user, req.body), 201))
);

/** GET /api/tenancies - every tenancy where you are the owner or the tenant. */
tenancyRouter.get(
  "/",
  requireAuth,
  wrap(async (req, res) => {
    const tenancies = await listTenancies(req.userId);
    res.json({ success: true, count: tenancies.length, data: await serializeTenancies(tenancies, req.userId) });
  })
);

tenancyRouter.get(
  "/:id",
  requireAuth,
  wrap(async (req, res) => respond(req, res, await getTenancyForParty(req.userId, req.params.id)))
);

// ---- owner / tenant decisions on a booking request
tenancyRouter.patch("/:id/accept", requireAuth, wrap(async (req, res) => respond(req, res, await acceptBooking(req, req.params.id))));
tenancyRouter.patch("/:id/decline", requireAuth, wrap(async (req, res) => respond(req, res, await declineBooking(req, req.params.id, req.body?.reason))));
tenancyRouter.patch("/:id/cancel", requireAuth, wrap(async (req, res) => respond(req, res, await cancelBooking(req, req.params.id))));

// ---- early termination: needs the consent of BOTH owner and tenant
/** POST /api/tenancies/:id/termination - either party opens a request. body: { reason, effectiveDate? } */
tenancyRouter.post(
  "/:id/termination",
  bookingLimiter,
  requireAuth,
  wrap(async (req, res) => respond(req, res, await requestTermination(req, req.params.id, req.body), 201))
);

/** POST /api/tenancies/:id/termination/respond - the OTHER party agrees or rejects. body: { agree: true|false } */
tenancyRouter.post(
  "/:id/termination/respond",
  requireAuth,
  wrap(async (req, res) => {
    const result = await respondToTermination(req, req.params.id, req.body?.agree);
    return respond(req, res, result, 200, result.ok ? { outcome: result.outcome } : {});
  })
);

/** POST /api/tenancies/:id/termination/withdraw - the requester withdraws their own request. */
tenancyRouter.post(
  "/:id/termination/withdraw",
  requireAuth,
  wrap(async (req, res) => respond(req, res, await withdrawTermination(req, req.params.id)))
);

// =============================================================================
// Routes: /admin/verifications
// =============================================================================
const adminVerificationRouter = Router();
adminVerificationRouter.use(requireAuth, requireAdmin);

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const STATUSES = ["pending", "verified", "rejected"];

function parseDecision(body = {}) {
  const decision = body.decision;
  if (decision !== "approve" && decision !== "reject") return { error: "decision must be 'approve' or 'reject'." };
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
  if (decision === "reject" && note.length < 3) return { error: "A short reason (note) is required when rejecting." };
  return { decision, note };
}

const adminUserView = (u) => ({
  id: u._id.toString(),
  name: u.name,
  email: u.email,
  phone: u.phone || "",
  area: u.area || "",
  userCode: u.userCode || null,
  identityStatus: u.identity?.status || "unverified",
  joinedAt: u.createdAt,
});

/**
 * GET /api/admin/verifications?status=pending|verified|rejected
 * Review queues: owners awaiting identity verification and properties awaiting ownership verification.
 */
adminVerificationRouter.get("/", async (req, res, next) => {
  try {
    const status = STATUSES.includes(req.query.status) ? req.query.status : "pending";

    const users = await User.find({ "identity.status": status, role: "user" })
      .select("name email phone area userCode identity createdAt")
      .sort({ updatedAt: -1 })
      .limit(100);
    const properties = await Property.find({ "ownership.status": status, isActive: true }).sort({ updatedAt: -1 }).limit(100);
    const owners = await User.find({ _id: { $in: properties.map((p) => p.ownerId) } }).select("name email phone area userCode identity createdAt");
    const ownerMap = new Map(owners.map((o) => [String(o._id), o]));

    const [identityDocs, ownershipDocs] = await Promise.all([
      VerificationDocument.find({ purpose: "identity", uploaderId: { $in: users.map((u) => u._id) } }).sort({ createdAt: -1 }),
      VerificationDocument.find({ purpose: "ownership", propertyId: { $in: properties.map((p) => p._id) } }).sort({ createdAt: -1 }),
    ]);

    res.json({
      success: true,
      status,
      data: {
        identity: users.map((u) => ({
          user: adminUserView(u),
          documents: identityDocs.filter((d) => String(d.uploaderId) === String(u._id)).map((d) => d.toAdminJSON()),
        })),
        ownership: properties.map((p) => ({
          property: p.toAdminJSON(),
          owner: ownerMap.get(String(p.ownerId)) ? adminUserView(ownerMap.get(String(p.ownerId))) : null,
          documents: ownershipDocs.filter((d) => String(d.propertyId) === String(p._id)).map((d) => d.toAdminJSON()),
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/admin/verifications/documents/:id/file - view a document (every view is audit-logged). */
adminVerificationRouter.get("/documents/:id/file", async (req, res, next) => {
  try {
    const doc = await loadReadableDocument(req, req.params.id);
    if (!doc) return failJson(res, 404, "DOCUMENT_NOT_FOUND", "Document not found.");
    await sendDocument(req, res, doc);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/admin/verifications/identity/:userId   body: { decision: "approve"|"reject", note? }
 */
adminVerificationRouter.patch("/identity/:userId", async (req, res, next) => {
  try {
    if (!OBJECT_ID.test(req.params.userId)) return failJson(res, 404, "USER_NOT_FOUND", "User not found.");
    const parsed = parseDecision(req.body);
    if (parsed.error) return failJson(res, 400, "INVALID_DECISION", parsed.error);

    const user = await User.findById(req.params.userId);
    if (!user || user.role === "admin") return failJson(res, 404, "USER_NOT_FOUND", "User not found.");

    const reviewable = await VerificationDocument.countDocuments({
      uploaderId: user._id,
      purpose: "identity",
      status: { $in: ["pending", "approved"] },
    });
    const now = new Date();

    if (parsed.decision === "approve") {
      if (!reviewable) return failJson(res, 409, "NO_DOCUMENTS", "This user has not uploaded any identity document to approve.");
      await VerificationDocument.updateMany(
        { uploaderId: user._id, purpose: "identity", status: "pending" },
        { $set: { status: "approved", reviewedBy: req.userId, reviewedAt: now, reviewNote: parsed.note } }
      );
      await User.updateOne(
        { _id: user._id },
        { $set: { "identity.status": "verified", "identity.reviewedBy": req.userId, "identity.reviewedAt": now, "identity.verifiedAt": now, "identity.note": parsed.note } }
      );
    } else {
      const wasVerified = user.identity?.status === "verified";
      await VerificationDocument.updateMany(
        { uploaderId: user._id, purpose: "identity", status: { $in: ["pending", "approved"] } },
        { $set: { status: "rejected", reviewedBy: req.userId, reviewedAt: now, reviewNote: parsed.note } }
      );
      await User.updateOne(
        { _id: user._id },
        { $set: { "identity.status": "rejected", "identity.reviewedBy": req.userId, "identity.reviewedAt": now, "identity.note": parsed.note } }
      );
      // A revoked identity can no longer back any listing.
      if (wasVerified) await hideListingsForOwner(user._id);
    }

    await recordAudit(req, `verification.identity.${parsed.decision}`, "User", user._id);
    res.json({ success: true, message: `Identity ${parsed.decision === "approve" ? "verified" : "rejected"}.`, identityStatus: parsed.decision === "approve" ? "verified" : "rejected" });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/admin/verifications/property/:propertyId   body: { decision: "approve"|"reject", note? }
 * A property can only be verified once its owner's identity is verified.
 */
adminVerificationRouter.patch("/property/:propertyId", async (req, res, next) => {
  try {
    if (!OBJECT_ID.test(req.params.propertyId)) return failJson(res, 404, "PROPERTY_NOT_FOUND", "Property not found.");
    const parsed = parseDecision(req.body);
    if (parsed.error) return failJson(res, 400, "INVALID_DECISION", parsed.error);

    const property = await Property.findById(req.params.propertyId);
    if (!property || !property.isActive) return failJson(res, 404, "PROPERTY_NOT_FOUND", "Property not found.");

    const reviewable = await VerificationDocument.countDocuments({
      propertyId: property._id,
      purpose: "ownership",
      status: { $in: ["pending", "approved"] },
    });
    const now = new Date();

    if (parsed.decision === "approve") {
      const owner = await User.findById(property.ownerId).select("identity");
      if (!owner || owner.identity?.status !== "verified") {
        return failJson(res, 409, "OWNER_IDENTITY_NOT_VERIFIED", "Verify the owner's identity before verifying their property.");
      }
      if (!reviewable) return failJson(res, 409, "NO_DOCUMENTS", "No ownership document has been uploaded for this property.");

      await VerificationDocument.updateMany(
        { propertyId: property._id, purpose: "ownership", status: "pending" },
        { $set: { status: "approved", reviewedBy: req.userId, reviewedAt: now, reviewNote: parsed.note } }
      );
      await Property.updateOne(
        { _id: property._id },
        { $set: { "ownership.status": "verified", "ownership.reviewedBy": req.userId, "ownership.reviewedAt": now, "ownership.verifiedAt": now, "ownership.note": parsed.note } }
      );
    } else {
      const wasVerified = property.ownership?.status === "verified";
      await VerificationDocument.updateMany(
        { propertyId: property._id, purpose: "ownership", status: { $in: ["pending", "approved"] } },
        { $set: { status: "rejected", reviewedBy: req.userId, reviewedAt: now, reviewNote: parsed.note } }
      );
      await Property.updateOne(
        { _id: property._id },
        { $set: { "ownership.status": "rejected", "ownership.reviewedBy": req.userId, "ownership.reviewedAt": now, "ownership.note": parsed.note } }
      );
      if (wasVerified) await hideListingsForProperties([property._id]);
    }

    await recordAudit(req, `verification.property.${parsed.decision}`, "Property", property._id);
    res.json({ success: true, message: `Ownership ${parsed.decision === "approve" ? "verified" : "rejected"}.`, ownershipStatus: parsed.decision === "approve" ? "verified" : "rejected" });
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// Service: address-based listing (address is compulsory; the IDs are generated from it)
// =============================================================================
/**
 * Used by POST /api/rooms (web) and POST /api/v1/listings (mobile) when the request does not name an
 * existing property. The owner just types the address:
 *   1. Every address field is compulsory (house/flat + street, locality, city, state, 6-digit PIN code).
 *   2. If that address is already registered by SOMEONE ELSE (exact or near-identical), listing is refused,
 *      unless the registrant has authorised this user. The refusal never reveals who or which ID.
 *   3. If the same user already registered it, the room is added under that property (different room/unit).
 *   4. Otherwise a property is created and its Property ID is generated from the address.
 * Returns { ok: true, propertyRef } on success or a deny() result.
 */
export async function resolvePropertyForListing(user, body = {}, req = null) {
  if (user.role === "admin") {
    return deny(403, "ADMIN_CANNOT_LIST", "Master Admin accounts cannot post consumer marketplace listings. Use a regular user account.");
  }
  if (body.propertyId) return { ok: true, propertyRef: body.propertyId };

  const { address, errors } = parseAddress(body);
  if (errors.length) {
    return deny(400, "ADDRESS_REQUIRED", `A complete address is required to list a room: ${errors.join("; ")}.`);
  }
  const coords = parseCoordinates(body);
  if (coords.error) return deny(400, "INVALID_COORDINATES", coords.error);

  const sameArea = await Property.find({ isActive: true, "address.pincode": address.pincode }).select("ownerId address latitude longitude").lean();
  const match = findSameProperty(sameArea, { address, latitude: coords.latitude, longitude: coords.longitude });

  if (match) {
    if (String(match.ownerId) === String(user._id)) return { ok: true, propertyRef: String(match._id) };
    const permitted = await OwnerPermission.exists({
      propertyId: match._id,
      delegateId: user._id,
      status: "active",
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    });
    if (permitted) return { ok: true, propertyRef: String(match._id) };
    await recordAudit(req || { userId: user._id, userRole: user.role }, "property.duplicate_address_blocked", "Property", match._id);
    return deny(
      409,
      "ADDRESS_ALREADY_LISTED",
      "This address is already registered by another account, so it cannot be listed again. If you are the rightful owner, please contact support."
    );
  }

  try {
    const property = await Property.create({ ownerId: user._id, address, latitude: coords.latitude, longitude: coords.longitude });
    await recordAudit(req || { userId: user._id, userRole: user.role }, "property.register", "Property", property._id);
    return { ok: true, propertyRef: String(property._id) };
  } catch (err) {
    if (err?.code === 11000) {
      return deny(409, "ADDRESS_ALREADY_LISTED", "This address is already registered by another account, so it cannot be listed again.");
    }
    throw err;
  }
}

// =============================================================================
// Mounting - called once from server/index.js
// =============================================================================
/**
 * Mounts every route of this feature. Must be called BEFORE the generic /api/:resource handlers so they are
 * never shadowed. (Tenancies live at /api/tenancies because /api/rentals is the vehicle-rental resource.)
 */
export function mountRoomVerification(app) {
  for (const base of ["/api", "/api/v1"]) {
    app.use(`${base}/verification`, verificationRouter);
    app.use(`${base}/properties`, propertyRouter);
    app.use(`${base}/owner-permissions`, permissionRouter);
    app.use(`${base}/tenancies`, tenancyRouter);
    app.use(`${base}/room-availability`, availabilityRouter);
  }
  app.use("/api/admin/verifications", adminVerificationRouter);
}

/** Exposed for the listing controller's early duplicate check. */
export const parseAddressForKey = (body) => parseAddress(body);
