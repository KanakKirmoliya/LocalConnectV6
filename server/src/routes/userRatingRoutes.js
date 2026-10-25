import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth.js";
import { Request } from "../models/Request.js";
import { Listing } from "../models/Listing.js";
import { User } from "../models/User.js";
import { UserRating, getRatingOverview, ALL_RATING_TAGS, RATING_TAGS } from "../models/UserRating.js";

const router = Router();
const isId = (v) => mongoose.isValidObjectId(String(v));

/**
 * POST /api/user-ratings   body: { requestId, rating (1-5), comment? }
 *  - the BUYER of an accepted request rates the provider  -> customer_to_provider
 *  - the SELLER / provider of an accepted request rates the buyer -> provider_to_customer
 * Posting again for the same request updates the earlier rating.
 */
router.post("/", requireAuth, async (req, res, next) => {
  try {
    if (req.userRole === "admin") {
      return res.status(403).json({ success: false, error: "Administrator accounts cannot rate users." });
    }
    const { requestId, comment } = req.body || {};
    const rating = Number(req.body?.rating);
    if (!isId(requestId)) return res.status(400).json({ success: false, error: "A valid requestId is required." });
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, error: "Rating must be a whole number of stars from 1 to 5." });
    }
    const text = typeof comment === "string" ? comment.trim().slice(0, 500) : "";
    const tags = Array.isArray(req.body?.tags)
      ? [...new Set(req.body.tags.filter((t) => typeof t === "string" && ALL_RATING_TAGS.includes(t)))].slice(0, 4)
      : [];
    const wouldRecommend = typeof req.body?.wouldRecommend === "boolean" ? req.body.wouldRecommend : null;

    const request = await Request.findById(requestId);
    const isBuyer = request && String(request.buyerId) === req.userId;
    const isSeller = request && String(request.sellerId) === req.userId;
    // Strangers get the same answer as a missing request.
    if (!request || (!isBuyer && !isSeller)) {
      return res.status(404).json({ success: false, error: "Request not found." });
    }
    if (request.status !== "accepted") {
      return res.status(409).json({ success: false, error: "You can rate the other person only after the request has been accepted." });
    }

    const direction = isBuyer ? "customer_to_provider" : "provider_to_customer";
    const ratedUserId = isBuyer ? request.sellerId : request.buyerId;

    const saved = await UserRating.findOneAndUpdate(
      { raterId: req.userId, requestId: request._id, direction },
      {
        $set: { raterName: req.userName, ratedUserId, listingId: request.listingId, listingTitle: request.listingTitle, rating, comment: text, tags, wouldRecommend },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );

    // Fresh numbers straight from the database so the client can update every rating display immediately.
    const overview = await getRatingOverview(ratedUserId);
    res.status(201).json({
      success: true,
      data: { id: saved._id.toString(), direction, rating: saved.rating, comment: saved.comment, tags: saved.tags },
      ratedUserId: String(ratedUserId),
      summary: overview.overall,
      overview,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/user-ratings/me
 * Everything the "My account" screen needs: my rating as a provider and as a customer, the latest ratings
 * I received, and the accepted requests I can still rate (or have already rated).
 */
router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const [{ overall, asProvider, asCustomer }, received] = await Promise.all([
      getRatingOverview(req.userId),
      UserRating.find({ ratedUserId: req.userId }).sort({ createdAt: -1 }).limit(20).lean(),
    ]);

    const accepted = await Request.find({
      status: "accepted",
      $or: [{ buyerId: req.userId }, { sellerId: req.userId }],
    })
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();
    const mine = await UserRating.find({ raterId: req.userId, requestId: { $in: accepted.map((r) => r._id) } }).lean();
    const mineByRequest = new Map(mine.map((r) => [String(r.requestId), r]));

    const otherIds = accepted.map((r) => (String(r.buyerId) === req.userId ? r.sellerId : r.buyerId));
    const others = await User.find({ _id: { $in: otherIds } }).select("name").lean();
    const nameOf = new Map(others.map((u) => [String(u._id), u.name]));

    const canRate = accepted.map((r) => {
      const iAmBuyer = String(r.buyerId) === req.userId;
      const otherId = String(iAmBuyer ? r.sellerId : r.buyerId);
      const given = mineByRequest.get(String(r._id));
      return {
        requestId: r._id.toString(),
        otherId,
        listingTitle: r.listingTitle,
        otherName: nameOf.get(otherId) || r.buyerName || "User",
        iAm: iAmBuyer ? "customer" : "provider",
        ratingTarget: iAmBuyer ? "provider" : "customer",
        myRating: given ? given.rating : null,
        myComment: given ? given.comment : "",
        myTags: given ? given.tags || [] : [],
        myRecommend: given && typeof given.wouldRecommend === "boolean" ? given.wouldRecommend : null,
      };
    });

    res.json({
      success: true,
      data: {
        overall,
        asProvider,
        asCustomer,
        received: received.map((r) => ({
          id: r._id.toString(),
          direction: r.direction,
          rating: r.rating,
          comment: r.comment,
          fromName: r.raterName,
          tags: r.tags || [],
          listingTitle: r.listingTitle,
          createdAt: r.createdAt,
        })),
        canRate,
        tagOptions: RATING_TAGS,
      },
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/user-ratings/user/:id - public star summary for a provider (no comments, no raters). */
router.get("/user/:id", async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ success: false, error: "User not found." });
    const target = await User.findById(req.params.id).select("role");
    if (!target || target.role === "admin") return res.status(404).json({ success: false, error: "User not found." });
    const { overall, asProvider, asCustomer } = await getRatingOverview(req.params.id);
    res.json({ success: true, data: { overall, asProvider, asCustomer } });
  } catch (err) {
    next(err);
  }
});

export default router;
