import crypto from "node:crypto";
import { Listing } from "../models/Listing.js";
import { RoomLocationLock } from "../models/RoomLocationLock.js";
import {
  distanceMetres,
  getDuplicateRadiusM,
  locationKeyFor,
  neighbourCellKeys,
  validateRoomLocationInput,
} from "../utils/roomLocation.js";

export const ROOM_LOCATION_TAKEN_ERROR = "A room listing already exists at this location.";
const LOCK_TTL_MS = 15_000;
const LOCK_ATTEMPTS = 40;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The location rule is switched off when ROOM_DUPLICATE_RADIUS_M=0. */
export const roomLocationRuleEnabled = () => getDuplicateRadiusM() > 0;

/**
 * Takes an exclusive lock on every cell around the point (all-or-nothing, retried with jitter).
 * Two requests for the same or nearby places therefore run one after the other, so the
 * "check for a neighbour, then insert" sequence below cannot race.
 * @returns {{release: () => Promise<void>}}
 */
export async function acquireRoomLocationLock(lat, lng) {
  const keys = [...neighbourCellKeys(lat, lng)].sort();
  const token = crypto.randomUUID();
  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt++) {
    const taken = [];
    let conflict = false;
    for (const key of keys) {
      try {
        // Reclaim an expired lock whose TTL sweep has not run yet.
        await RoomLocationLock.deleteOne({ _id: key, expiresAt: { $lt: new Date() } });
        await RoomLocationLock.create({ _id: key, token, expiresAt: new Date(Date.now() + LOCK_TTL_MS) });
        taken.push(key);
      } catch (err) {
        if (err?.code === 11000) {
          conflict = true;
          break;
        }
        await RoomLocationLock.deleteMany({ _id: { $in: taken }, token }).catch(() => {});
        throw err;
      }
    }
    if (!conflict) {
      return { release: () => RoomLocationLock.deleteMany({ _id: { $in: keys }, token }).then(() => {}, () => {}) };
    }
    await RoomLocationLock.deleteMany({ _id: { $in: taken }, token }).catch(() => {});
    await sleep(15 + Math.floor(Math.random() * 45));
  }
  const err = new Error("Another room is being listed at this spot right now. Please try again in a moment.");
  err.status = 409;
  err.code = "LOCATION_BUSY";
  throw err;
}

/**
 * Looks for another room (any status: a rented or hidden room still occupies its spot) within the duplicate radius.
 * Cell keys narrow the search through an index; Haversine distance decides.
 * @returns {Promise<{_id, distanceM}|null>}
 */
export async function findRoomAtLocation(lat, lng, { excludeListingId = null } = {}) {
  const radius = getDuplicateRadiusM();
  const query = {
    type: "room",
    locationKey: { $in: neighbourCellKeys(lat, lng, radius) },
  };
  if (excludeListingId) query._id = { $ne: excludeListingId };
  const candidates = await Listing.find(query).select("latitude longitude").lean();
  for (const c of candidates) {
    if (typeof c.latitude !== "number" || typeof c.longitude !== "number") continue;
    const d = distanceMetres(lat, lng, c.latitude, c.longitude);
    if (d <= radius) return { _id: c._id, distanceM: Math.round(d * 10) / 10 };
  }
  return null;
}

/**
 * One call for create and edit:
 *   validates the posted coordinates -> locks the surrounding cells -> checks for a neighbour.
 * On success the caller MUST persist and then call `release()` (use try/finally).
 * On failure nothing is locked.
 *
 * @returns {Promise<{ok:true, loc, release}|{ok:false, status, code, error}>}
 */
export async function reserveRoomLocation(input, { excludeListingId = null } = {}) {
  const loc = validateRoomLocationInput(input);
  if (!loc.ok) return loc;
  const lock = await acquireRoomLocationLock(loc.lat, loc.lng);
  try {
    const clash = await findRoomAtLocation(loc.lat, loc.lng, { excludeListingId });
    if (clash) {
      await lock.release();
      return { ok: false, status: 409, code: "ROOM_LOCATION_TAKEN", error: ROOM_LOCATION_TAKEN_ERROR };
    }
  } catch (err) {
    await lock.release();
    throw err;
  }
  return { ok: true, loc, release: lock.release };
}

/** Fields to store on a room so its identity follows its coordinates. */
export function locationFieldsFor(loc) {
  return {
    latitude: loc.lat,
    longitude: loc.lng,
    location: { type: "Point", coordinates: [loc.lng, loc.lat] },
    locationKey: loc.locationKey,
    locationSource: loc.source,
    ...(loc.accuracyM != null ? { locationAccuracyM: loc.accuracyM } : {}),
  };
}

/** Recognises the unique-index error raised when two rooms try to hold the same cell. */
export const isLocationClaimConflict = (err) =>
  err?.code === 11000 && (/locationClaimKey|unique_room_location_claim/.test(err?.message || "") || err?.keyPattern?.locationClaimKey);

export { locationKeyFor };
