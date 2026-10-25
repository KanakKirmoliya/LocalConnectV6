/**
 * One-time (idempotent) migration for the GPS room-location rule.
 *
 *   node scripts/backfill-room-locations.mjs --dry-run     # report only
 *   node scripts/backfill-room-locations.mjs               # assign location keys
 *
 * Gives each existing room a deterministic locationKey (oldest room wins a contested spot). It NEVER edits
 * coordinates, room ids, room codes, photos or bookings, never deletes anything, and can be re-run safely.
 * Rooms that share a spot with an older room, or have no coordinates, are listed in the report for manual review.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const { connectDB, disconnectDB } = await import("../src/config/db.js");
const { Listing } = await import("../src/models/Listing.js");
const { RoomLocationLock } = await import("../src/models/RoomLocationLock.js");
const { backfillRoomLocations } = await import("../src/services/roomLocationMigration.js");

const dryRun = process.argv.includes("--dry-run");

const conn = await connectDB();
if (!conn) {
  console.error("❌ No database connection. Check MONGODB_URI in server/.env.");
  process.exit(1);
}
try {
  // Make sure the new indexes exist before we start claiming spots.
  await Listing.syncIndexes();
  await RoomLocationLock.syncIndexes();

  const report = await backfillRoomLocations({ dryRun, log: (m) => console.log("  " + m) });
  console.log(`\n${dryRun ? "DRY RUN - nothing was written.\n" : ""}Rooms scanned:        ${report.scanned}`);
  console.log(`Location keys ${dryRun ? "to assign" : "assigned"}:  ${report.assigned}`);
  console.log(`Already had a key:    ${report.alreadyKeyed}`);
  console.log(`Needs review (spot taken by an older room): ${report.conflicts.length}`);
  for (const c of report.conflicts) console.log(`   - ${c.id} "${c.title}" is ${c.distanceM} m from ${c.conflictsWith}`);
  console.log(`Needs review (no usable coordinates):       ${report.missingCoordinates.length}`);
  for (const m of report.missingCoordinates) console.log(`   - ${m.id} "${m.title}" (${m.latitude}, ${m.longitude})`);
  if (report.conflicts.length || report.missingCoordinates.length) {
    console.log("\nNothing above was changed or deleted. Fix them by editing the room (new pin) or removing the duplicate, then re-run.");
  }
} finally {
  await disconnectDB();
}
