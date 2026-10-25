import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { Listing } from "../models/Listing.js";
import { UserRating, getRatingOverview } from "../models/UserRating.js";

const router = Router();
const isId = (v) => mongoose.isValidObjectId(String(v));

/**
 * GET /api/users/:id/profile
 * The public profile card of a community member: photo, name, bio, area, member-since, star ratings
 * (as provider and as customer), what they currently offer and a few recent reviews.
 *
 * Never exposes email, phone, ban state or role. Administrator accounts are invisible: they (and
 * suspended accounts) answer exactly like a user that does not exist.
 */
router.get("/:id/profile", requireAuth, async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ success: false, error: "User not found." });
    const user = await User.findById(req.params.id);
    const viewerIsAdmin = req.userRole === "admin";
    const isSelf = user && String(user._id) === req.userId;
    if (!user || (user.role === "admin" && !isSelf) || (!viewerIsAdmin && !isSelf && user.isBanned)) {
      return res.status(404).json({ success: false, error: "User not found." });
    }

    const [{ overall, asProvider, asCustomer }, listingRows, reviews] = await Promise.all([
      getRatingOverview(user._id),
      Listing.aggregate([
        { $match: { ownerId: user._id, status: "active", type: { $in: ["room", "vehicle", "service", "lost_found"] } } },
        { $group: { _id: "$type", count: { $sum: 1 } } },
      ]),
      UserRating.find({ ratedUserId: user._id, comment: { $ne: "" } }).sort({ createdAt: -1 }).limit(6).lean(),
    ]);

    const offers = { room: 0, vehicle: 0, service: 0, lost_found: 0 };
    for (const row of listingRows) offers[row._id] = row.count;

    res.json({
      success: true,
      data: {
        ...user.toPeerJSON(),
        overall,
        asProvider,
        asCustomer,
        offers,
        reviews: reviews.map((r) => ({
          id: r._id.toString(),
          rating: r.rating,
          comment: r.comment,
          tags: r.tags || [],
          // first name only
          fromName: String(r.raterName || "Member").split(" ")[0],
          direction: r.direction,
          createdAt: r.createdAt,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
