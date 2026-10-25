import { Router } from "express";
import { Review } from "../models/Review.js";
import { Listing } from "../models/Listing.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

/**
 * Recalculate average rating and total reviews on a listing and persist
 */
export async function syncListingRating(listingId) {
  const reviews = await Review.find({ listingId }).lean();
  const count = reviews.length;
  let avg = 0;
  if (count > 0) {
    const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
    avg = Math.round((sum / count) * 10) / 10;
  }

  const listing = await Listing.findById(listingId);
  if (listing) {
    listing.averageRating = avg;
    listing.reviewsCount = count;
    if (listing.type === "service" && listing.serviceDetails) {
      listing.serviceDetails.rating = avg > 0 ? avg : 5.0;
      listing.serviceDetails.jobsCount = count;
    }
    await listing.save();
  }
  return { averageRating: avg, reviewsCount: count };
}

/**
 * GET /api/reviews?listingId=...
 * Fetch reviews for a specific listing + breakdown stats
 */
router.get("/", async (req, res, next) => {
  try {
    const { listingId } = req.query;
    if (!listingId) {
      return res.status(400).json({ success: false, error: "listingId query param is required." });
    }

    const reviews = await Review.find({ listingId }).sort({ createdAt: -1 }).lean();
    const count = reviews.length;
    let avg = 0;
    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

    if (count > 0) {
      const sum = reviews.reduce((acc, r) => {
        const roundedStar = Math.min(5, Math.max(1, Math.round(r.rating)));
        distribution[roundedStar] = (distribution[roundedStar] || 0) + 1;
        return acc + r.rating;
      }, 0);
      avg = Math.round((sum / count) * 10) / 10;
    }

    return res.json({
      success: true,
      data: reviews.map((r) => ({
        id: r._id.toString(),
        _id: r._id.toString(),
        listingId: r.listingId.toString(),
        listingType: r.listingType,
        userId: r.userId.toString(),
        userName: r.userName,
        userArea: r.userArea || "",
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      stats: {
        averageRating: avg,
        totalReviews: count,
        distribution,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/reviews
 * Post or update a rating/review on a listing (Room, Vehicle, Service)
 */
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const { listingId, rating, comment } = req.body;

    if (!listingId) {
      return res.status(400).json({ success: false, error: "listingId is required." });
    }

    // Administrator accounts stay invisible to members, so they never appear as a review author.
    if (req.userRole === "admin") {
      return res.status(403).json({ success: false, error: "Administrator accounts cannot post reviews." });
    }

    const numRating = Number(rating);
    if (!numRating || numRating < 1 || numRating > 5) {
      return res.status(400).json({ success: false, error: "Rating must be a whole number between 1 and 5." });
    }

    if (!comment || typeof comment !== "string" || comment.trim().length < 3) {
      return res.status(400).json({ success: false, error: "Review comment must be at least 3 characters." });
    }

    const listing = await Listing.findById(listingId);
    if (!listing) {
      return res.status(404).json({ success: false, error: "Listing not found." });
    }

    // Anti-fraud: cannot review own listing
    if (listing.ownerId.toString() === req.userId) {
      return res.status(400).json({
        success: false,
        error: "Fraud Prevention: You cannot write a review on your own listing.",
      });
    }

    // Check if user already reviewed -> update, otherwise create
    let review = await Review.findOne({ listingId, userId: req.userId });
    let isUpdate = false;

    if (review) {
      review.rating = numRating;
      review.comment = comment.trim();
      review.userName = req.userName;
      review.userArea = req.user?.area || "";
      await review.save();
      isUpdate = true;
    } else {
      review = await Review.create({
        listingId,
        listingType: listing.type,
        userId: req.userId,
        userName: req.userName,
        userArea: req.user?.area || "",
        rating: numRating,
        comment: comment.trim(),
      });
    }

    // Sync listing average rating
    const updatedStats = await syncListingRating(listingId);

    console.log(`⭐ [Review System] ${isUpdate ? "Updated" : "Created"} ${numRating}-star review on "${listing.title}" by ${req.userName}. New Avg: ${updatedStats.averageRating} (${updatedStats.reviewsCount} reviews)`);

    return res.status(isUpdate ? 200 : 201).json({
      success: true,
      message: isUpdate ? "Your review has been updated." : "Thank you for reviewing! Your feedback helps neighbors make informed choices.",
      data: {
        id: review._id.toString(),
        _id: review._id.toString(),
        listingId: review.listingId.toString(),
        listingType: review.listingType,
        userId: review.userId.toString(),
        userName: review.userName,
        userArea: review.userArea,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
        updatedAt: review.updatedAt,
      },
      stats: updatedStats,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/reviews/:id
 * Delete a review (Author or Admin)
 */
router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ success: false, error: "Review not found." });
    }

    // Only review author or admin can delete
    if (review.userId.toString() !== req.userId && req.userRole !== "admin") {
      return res.status(403).json({ success: false, error: "Not authorized to delete this review." });
    }

    const listingId = review.listingId;
    await review.deleteOne();

    const updatedStats = await syncListingRating(listingId);

    console.log(`⭐ [Review System] Deleted review on listing ${listingId}. New Avg: ${updatedStats.averageRating} (${updatedStats.reviewsCount} reviews)`);

    return res.json({
      success: true,
      message: "Review deleted successfully.",
      stats: updatedStats,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

