/**
 * One-time (idempotent) backfill: gives every EXISTING user a User ID and every EXISTING room
 * listing a Room ID. New users and rooms get theirs automatically; run this once after deploying.
 *
 *   npm run backfill:ids --prefix server
 *
 * Safe to run repeatedly: records that already have an ID are skipped. Nothing is deleted.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const { connectDB, disconnectDB } = await import("../src/config/db.js");
const { User } = await import("../src/models/User.js");
const { Listing } = await import("../src/models/Listing.js");
const { ensureRoomForListing } = await import("../src/roomVerification.js");

async function main() {
  const conn = await connectDB();
  if (!conn) {
    console.error("❌ No database connection. Check MONGODB_URI in server/.env.");
    process.exit(1);
  }

  let users = 0;
  const missingUsers = await User.find({ $or: [{ userCode: { $exists: false } }, { userCode: null }, { userCode: "" }] });
  for (const user of missingUsers) {
    await user.ensureUserCode();
    users += 1;
  }

  let rooms = 0;
  const roomListings = await Listing.find({ type: "room", $or: [{ roomCode: { $exists: false } }, { roomCode: null }] });
  for (const listing of roomListings) {
    await ensureRoomForListing(listing);
    rooms += 1;
  }

  console.log(`✅ Backfill complete: ${users} user ID(s) and ${rooms} room ID(s) assigned.`);
  await disconnectDB();
}

main().catch(async (err) => {
  console.error("❌ Backfill failed:", err.message);
  await disconnectDB();
  process.exit(1);
});
