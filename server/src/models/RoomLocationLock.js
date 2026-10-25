import mongoose from "mongoose";

/**
 * Short-lived mutual-exclusion lock on one spatial cell. The cell key is the document _id, so the database itself
 * guarantees that only one request holds a given cell at a time. A TTL index sweeps up locks left behind by a crash.
 */
const schema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    token: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false }
);
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RoomLocationLock = mongoose.models.RoomLocationLock || mongoose.model("RoomLocationLock", schema);
