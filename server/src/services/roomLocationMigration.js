import { Listing } from "../models/Listing.js";
import { normalizeCoordinates, locationKeyFor, getDuplicateRadiusM } from "../utils/roomLocation.js";
import { acquireRoomLocationLock, findRoomAtLocation } from "./roomLocationGuard.js";

// The old app silently filled New Delhi's centre in when GPS was missing; those are not real room locations.
const isLegacyDefault = (lat, lng) => lat === 28.6139 && lng === 77.209;

/**
 * Gives every EXISTING room listing a locationKey, oldest first.
 *  - never changes latitude / longitude / location, room ids, codes, photos or bookings
 *  - a room whose spot is already taken by an older room is NOT touched; it is reported as a conflict
 *  - rooms without usable coordinates are reported, not guessed
 *  - safe to re-run: only rooms that still have no locationKey are looked at
 *
 * @returns {{scanned, assigned, conflicts: object[], missingCoordinates: object[], alreadyKeyed}}
 */
export async function backfillRoomLocations({ dryRun = false, log = () => {} } = {}) {
  const radius = getDuplicateRadiusM();
  const report = { scanned: 0, assigned: 0, alreadyKeyed: 0, conflicts: [], missingCoordinates: [] };
  if (radius <= 0) {
    log("ROOM_DUPLICATE_RADIUS_M is 0: the location rule is disabled, nothing to do.");
    return report;
  }
  report.alreadyKeyed = await Listing.countDocuments({ type: "room", locationKey: { $type: "string" } });

  const rooms = await Listing.find({ type: "room", $or: [{ locationKey: { $exists: false } }, { locationKey: null }] })
    .sort({ createdAt: 1, _id: 1 })
    .select("title latitude longitude ownerId createdAt")
    .lean();

  for (const room of rooms) {
    report.scanned += 1;
    const norm = normalizeCoordinates(room.latitude, room.longitude);
    if (!norm.ok || isLegacyDefault(norm.lat, norm.lng)) {
      report.missingCoordinates.push({ id: String(room._id), title: room.title, latitude: room.latitude ?? null, longitude: room.longitude ?? null });
      continue;
    }
    const lock = await acquireRoomLocationLock(norm.lat, norm.lng);
    try {
      const clash = await findRoomAtLocation(norm.lat, norm.lng, { excludeListingId: room._id });
      if (clash) {
        report.conflicts.push({ id: String(room._id), title: room.title, conflictsWith: String(clash._id), distanceM: clash.distanceM });
        continue;
      }
      if (!dryRun) {
        const key = locationKeyFor(norm.lat, norm.lng, radius);
        try {
          await Listing.updateOne(
            { _id: room._id, $or: [{ locationKey: { $exists: false } }, { locationKey: null }] },
            { $set: { locationKey: key, locationClaimKey: key, locationSource: "manual" } }
          );
        } catch (err) {
          if (err?.code === 11000) {
            report.conflicts.push({ id: String(room._id), title: room.title, conflictsWith: "(same cell)", distanceM: 0 });
            continue;
          }
          throw err;
        }
      }
      report.assigned += 1;
      log(`${dryRun ? "[dry-run] would key" : "keyed"} ${room._id} "${room.title}"`);
    } finally {
      await lock.release();
    }
  }
  return report;
}
