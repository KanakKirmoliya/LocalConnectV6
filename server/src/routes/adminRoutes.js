import { Router } from "express";
import { User } from "../models/User.js";
import { Listing } from "../models/Listing.js";
import { Request } from "../models/Request.js";
import { Report } from "../models/Report.js";
import { Review } from "../models/Review.js";
import { UserRating, getRatingOverview } from "../models/UserRating.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { cleanupMediaFiles } from "./uploadRoutes.js";
import { resolveLocalityCoordinates } from "../utils/geo.js";
import { assertRoomDeletable, retireRoomForListing, sendDeny, assertNoActiveTenancy, purgeUserVerificationData } from "../roomVerification.js";

const router = Router();

/**
 * Admins may block or delete ANY account, including other administrators, with two safety rails:
 * you cannot do it to yourself, and the last active administrator can never be blocked or deleted
 * (otherwise nobody could run the platform any more).
 */
async function guardAdminTarget(req, target, action) {
  if (String(target._id) === String(req.userId)) {
    return `You cannot ${action} your own account from the admin console.`;
  }
  if (target.role === "admin") {
    const otherActiveAdmins = await User.countDocuments({ role: "admin", isBanned: { $ne: true }, _id: { $ne: target._id } });
    if (otherActiveAdmins < 1) return `Cannot ${action} the last active administrator account.`;
  }
  return "";
}

// All routes require authentication and admin privileges
router.use(requireAuth, requireAdmin);

router.post("/broadcasts", async (req, res, next) => {
  try {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
    const locality = typeof req.body?.locality === "string" ? req.body.locality.trim() : "";
    if (title.length < 3 || title.length > 120 || !locality || locality.length > 120) {
      return res.status(400).json({ success: false, error: "A title (3-120 characters) and locality (up to 120 characters) are required." });
    }
    if (description.length > 2000) {
      return res.status(400).json({ success: false, error: "Broadcast description must be 2,000 characters or fewer." });
    }

    const coordinates = resolveLocalityCoordinates(locality);
    const broadcast = await Listing.create({
      ownerId: req.userId,
      ownerName: "NearNest Alerts", // admin identity is never shown to members
      type: "alert",
      title,
      description,
      locality,
      status: "active",
      alertDetails: { alertType: "Safety", helpersCount: 0 },
      ...(coordinates
        ? {
            latitude: coordinates.lat,
            longitude: coordinates.lng,
            location: {
              type: "Point",
              coordinates: [coordinates.lng, coordinates.lat],
            },
          }
        : {}),
    });
    return res.status(201).json({
      success: true,
      data: { id: broadcast._id.toString(), title: broadcast.title, locality: broadcast.locality },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/overview
 * Real-time metrics and system health
 */
router.get("/overview", async (req, res, next) => {
  try {
    const [
      totalUsers,
      totalListings,
      roomCount,
      vehicleCount,
      serviceCount,
      lostFoundCount,
      alertCount,
      totalRequests,
      requestsWithMessages,
      bannedUsersCount,
      temporarilySuspendedUsersCount,
      permanentlySuspendedUsersCount,
      abuseReportsCount,
      pendingReportsCount,
      totalReviewsCount,
      verifiedListingsCount,
    ] = await Promise.all([
      User.countDocuments(),
      Listing.countDocuments(),
      Listing.countDocuments({ type: "room" }),
      Listing.countDocuments({ type: "vehicle" }),
      Listing.countDocuments({ type: "service" }),
      Listing.countDocuments({ type: "lost_found" }),
      Listing.countDocuments({ type: "alert" }),
      Request.countDocuments(),
      Request.find({}, "messages").lean(),
      User.countDocuments({ isBanned: true }),
      User.countDocuments({ suspensionStatus: "temporary", isBanned: true }),
      User.countDocuments({ suspensionStatus: "permanent", isBanned: true }),
      Report.countDocuments(),
      Report.countDocuments({ status: "pending" }),
      Review.countDocuments(),
      Listing.countDocuments({ $or: [{ isVerified: true }, { "roomDetails.verified": true }] }),
    ]);

    const totalMessages = requestsWithMessages.reduce(
      (sum, r) => sum + (Array.isArray(r.messages) ? r.messages.length : 0),
      0
    );

    const stats = {
      totalUsers,
      totalListings,
      roomCount,
      vehicleCount,
      serviceCount,
      lostFoundCount,
      alertCount,
      totalRequests,
      totalMessages,
      bannedUsersCount,
      temporarilySuspendedUsersCount,
      permanentlySuspendedUsersCount,
      abuseReportsCount,
      pendingReportsCount,
      totalReviewsCount,
      verifiedListingsCount,
    };

    return res.json({
      success: true,
      data: stats,
      metrics: stats,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/listings
 * Fetch all listings across all categories for admin moderation
 */
router.get("/listings", async (req, res, next) => {
  try {
    const { type, search, ownerId } = req.query;
    const query = {};

    if (type && type !== "all") {
      query.type = type;
    }

    if (ownerId) {
      query.ownerId = ownerId;
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      query.$or = [{ title: regex }, { locality: regex }, { ownerName: regex }];
    }

    const listings = await Listing.find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    // Admin-only: the address-generated Room ID / Property ID and the full private address behind them.
    const roomListingIds = listings.filter((l) => l.type === "room").map((l) => l._id);
    const { Room, Property } = await import("../roomVerification.js");
    const rooms = roomListingIds.length ? await Room.find({ listingId: { $in: roomListingIds } }).select("listingId propertyId unitNumber").lean() : [];
    const props = rooms.length ? await Property.find({ _id: { $in: rooms.map((r) => r.propertyId).filter(Boolean) } }).select("address").lean() : [];
    const roomByListing = new Map(rooms.map((r) => [String(r.listingId), r]));
    const propById = new Map(props.map((p) => [String(p._id), p]));
    const fullAddress = (a) => (a ? [a.line1, a.line2, a.locality, a.city, a.state, a.pincode].filter(Boolean).join(", ") : "");

    const formatted = listings.map((l) => ({
      id: l._id.toString(),
      _id: l._id.toString(),
      roomCode: l.roomCode || undefined,
      propertyCode: l.propertyCode || undefined,
      privateAddress: l.type === "room" ? fullAddress(propById.get(String(roomByListing.get(String(l._id))?.propertyId))?.address) || undefined : undefined,
      unitNumber: l.type === "room" ? roomByListing.get(String(l._id))?.unitNumber : undefined,
      title: l.title,
      type: l.type,
      owner: l.ownerName,
      ownerId: l.ownerId.toString(),
      ownerPhone: l.ownerPhone || "",
      locality: l.locality,
      latitude: l.latitude,
      longitude: l.longitude,
      status: l.status,
      isVerified: Boolean(l.isVerified || l.roomDetails?.verified),
      photosCount: Array.isArray(l.photos) ? l.photos.length : 0,
      videosCount: Array.isArray(l.videos) ? l.videos.length : 0,
      photos: l.photos || [],
      videos: l.videos || [],
      rent: l.roomDetails?.rent,
      amenities: l.roomDetails?.amenities || [],
      rate: l.vehicleDetails?.rentalPrice,
      trade: l.serviceDetails?.serviceCategory,
      kind: l.lostFoundDetails?.kind,
      createdAt: l.createdAt,
    }));

    return res.json({
      success: true,
      data: formatted,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/admin/listings/:id/verify
 * Toggle verified badge on listing
 */
router.patch("/listings/:id/verify", async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({ success: false, error: "Listing not found." });
    }

    const currentStatus = Boolean(listing.isVerified || listing.roomDetails?.verified);
    const newStatus = !currentStatus;

    listing.isVerified = newStatus;
    if (listing.roomDetails) {
      listing.roomDetails.verified = newStatus;
    }
    await listing.save();

    console.log(`🛡️ [Admin Moderation] Listing "${listing.title}" verified status set to ${newStatus} by Admin ${req.userName}`);

    return res.json({
      success: true,
      isVerified: newStatus,
      message: `Listing "${listing.title}" is now ${newStatus ? "verified" : "unverified"}.`,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/listings/:id
 * Delete any listing as admin and remove uploaded media
 */
router.delete("/listings/:id", async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({ success: false, error: "Listing not found." });
    }

    // A room with a running tenancy cannot be deleted (hide it instead): that would end the tenancy without both parties' consent.
    if (listing.type === "room") {
      const deletable = await assertRoomDeletable(listing._id);
      if (!deletable.ok) return sendDeny(res, deletable);
    }

    // Clean up disk media files
    cleanupMediaFiles(listing.photos, listing.videos);

    await listing.deleteOne();
    if (listing.type === "room") await retireRoomForListing(listing._id);
    console.log(`🛡️ [Admin Moderation] Listing "${listing.title}" (${listing._id}) deleted by Admin ${req.userName}`);

    return res.json({
      success: true,
      message: `Listing "${listing.title}" successfully deleted by Admin.`,
      deletedId: req.params.id,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/requests
 * Fetch all buyer-seller inquiry and contact requests
 */
router.get("/requests", async (req, res, next) => {
  try {
    const requests = await Request.find()
      .populate("buyerId", "name email phone")
      .populate("sellerId", "name email phone")
      .populate("listingId", "title type locality")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const formatted = requests.map((r) => ({
      id: r._id.toString(),
      _id: r._id.toString(),
      listingTitle: r.listingId?.title || "Listing Removed",
      listingType: r.listingId?.type || "unknown",
      locality: r.listingId?.locality || "",
      buyerName: r.buyerId?.name || "Anonymous",
      buyerEmail: r.buyerId?.email || "",
      buyerPhone: r.buyerId?.phone || "",
      sellerName: r.sellerId?.name || "Anonymous",
      sellerEmail: r.sellerEmail || r.sellerId?.email || "",
      sellerPhone: r.sellerPhone || r.sellerId?.phone || "",
      status: r.status,
      message: r.message,
      messageCount: Array.isArray(r.messages) ? r.messages.length : 0,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    return res.json({
      success: true,
      data: formatted,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/requests/:id
 * Delete spam or test inquiries
 */
router.delete("/requests/:id", async (req, res, next) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ success: false, error: "Request not found." });
    }

    await request.deleteOne();
    console.log(`🛡️ [Admin Moderation] Request ${request._id} deleted by Admin ${req.userName}`);

    return res.json({
      success: true,
      message: "Request successfully deleted by Admin.",
      deletedId: req.params.id,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/users
 * Fetch all registered users
 */
router.get("/users", async (req, res, next) => {
  try {
    const users = await User.find({}, "-passwordHash")
      .sort({ createdAt: -1 })
      .lean();

    // Count listings per user
    const userIds = users.map((u) => u._id);
    const listingCounts = await Listing.aggregate([
      { $match: { ownerId: { $in: userIds } } },
      { $group: { _id: "$ownerId", count: { $sum: 1 } } },
    ]);

    const countMap = {};
    listingCounts.forEach((c) => {
      countMap[c._id.toString()] = c.count;
    });

    const formatted = users.map((u) => ({
      id: u._id.toString(),
      _id: u._id.toString(),
      name: u.name,
      email: u.email,
      phone: u.phone || "",
      area: u.area || "",
      avatar: u.avatar || "",
      bio: u.bio || "",
      userCode: u.userCode || null,
      identityStatus: u.identity?.status || "unverified",
      role: u.role || "user",
      isBanned: Boolean(u.isBanned),
      banReason: u.banReason || "",
      suspensionStatus: u.suspensionStatus || (u.isBanned ? "permanent" : "none"),
      suspendedUntil: u.suspendedUntil || null,
      reportCount: u.reportCount || 0,
      listingsCount: countMap[u._id.toString()] || 0,
      createdAt: u.createdAt,
    }));

    return res.json({
      success: true,
      data: formatted,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/admin/users/:id/ban
 * Ban, temporarily suspend, or unban user from accessing platform
 */
router.patch("/users/:id/ban", async (req, res, next) => {
  try {
    const { ban, status, reason, durationHours } = req.body;
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: "User not found." });
    }

    if (ban) {
      const guard = await guardAdminTarget(req, targetUser, "block");
      if (guard) return res.status(400).json({ success: false, error: guard });
    }

    if (!ban) {
      targetUser.isBanned = false;
      targetUser.suspensionStatus = "none";
      targetUser.suspendedUntil = null;
      targetUser.banReason = "";
    } else {
      targetUser.isBanned = true;
      if (status === "temporary") {
        const hours = Number(durationHours) || 48;
        targetUser.suspensionStatus = "temporary";
        targetUser.suspendedUntil = new Date(Date.now() + hours * 3600 * 1000);
        targetUser.banReason = reason || `Account temporarily suspended for ${hours}h by administrator.`;
      } else {
        targetUser.suspensionStatus = "permanent";
        targetUser.suspendedUntil = null;
        targetUser.banReason = reason || "Account permanently banned by administrator.";
      }
    }

    await targetUser.save();

    console.log(`🛡️ [Admin Moderation] User "${targetUser.name}" (${targetUser.email}) suspension set to [ban: ${ban}, status: ${targetUser.suspensionStatus}] by Admin ${req.userName}`);

    return res.json({
      success: true,
      message: `User "${targetUser.name}" has been ${
        !ban
          ? "reactivated"
          : targetUser.suspensionStatus === "temporary"
          ? `temporarily suspended until ${new Date(targetUser.suspendedUntil).toLocaleString()}`
          : "permanently suspended/banned"
      }.`,
      user: targetUser.toPublicJSON(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/users/:id
 * Permanently delete user and clean up all their listings & media
 */
router.delete("/users/:id", async (req, res, next) => {
  try {
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: "User not found." });
    }

    const guard = await guardAdminTarget(req, targetUser, "delete");
    if (guard) return res.status(400).json({ success: false, error: guard });

    const tenancyCheck = await assertNoActiveTenancy(targetUser._id);
    if (!tenancyCheck.ok) return sendDeny(res, tenancyCheck);

    // Clean up listings & media uploaded by this user
    const userListings = await Listing.find({ ownerId: targetUser._id });
    for (const l of userListings) {
      cleanupMediaFiles(l.photos, l.videos);
      await l.deleteOne();
    }

    // Clean up user's requests
    await Request.deleteMany({ $or: [{ buyerId: targetUser._id }, { sellerId: targetUser._id }] });

    // Erase private identity/ownership documents, properties, permissions and tenancy history
    await purgeUserVerificationData(targetUser._id);

    if (targetUser.avatar) cleanupMediaFiles([targetUser.avatar], []);
    await UserRating.deleteMany({ $or: [{ raterId: targetUser._id }, { ratedUserId: targetUser._id }] });
    await Review.deleteMany({ userId: targetUser._id }).catch(() => {});
    await targetUser.deleteOne();
    console.log(`🛡️ [Admin Moderation] User "${targetUser.name}" (${targetUser.email}) and listings deleted by Admin ${req.userName}`);

    return res.json({
      success: true,
      message: `User "${targetUser.name}" and all associated listings were permanently deleted by Admin.`,
      deletedId: req.params.id,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/admin/users/:id/role
 * Promote or demote user role
 */
router.patch("/users/:id/role", async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!["user", "admin"].includes(role)) {
      return res.status(400).json({ success: false, error: "Invalid role specified." });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found." });
    }

    if (role === "user") {
      const guard = await guardAdminTarget(req, user, "demote");
      if (guard) return res.status(400).json({ success: false, error: guard });
    }

    user.role = role;
    await user.save();
    console.log(`🛡️ [Admin Moderation] User "${user.name}" (${user.email}) role updated to "${role}" by Admin ${req.userName}`);

    return res.json({
      success: true,
      message: `User ${user.name} is now ${role}.`,
      user: user.toPublicJSON(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/users/:id/full
 * Everything the platform holds about one account (for investigations): profile, listings, every request
 * and chat they took part in, ratings given and received, and reports filed by or against them.
 */
router.get("/users/:id/full", async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select("-passwordHash").lean();
    if (!user) return res.status(404).json({ success: false, error: "User not found." });

    const [listings, requests, ratingsGiven, ratingsReceived, reportsAgainst, reportsFiled, ratingOverview] = await Promise.all([
      Listing.find({ ownerId: user._id }).sort({ createdAt: -1 }).limit(200).lean(),
      Request.find({ $or: [{ buyerId: user._id }, { sellerId: user._id }] }).sort({ updatedAt: -1 }).limit(100).lean(),
      UserRating.find({ raterId: user._id }).sort({ createdAt: -1 }).limit(100).lean(),
      UserRating.find({ ratedUserId: user._id }).sort({ createdAt: -1 }).limit(100).lean(),
      Report.find({ reportedUserId: user._id }).sort({ createdAt: -1 }).limit(100).lean(),
      Report.find({ reporterId: user._id }).sort({ createdAt: -1 }).limit(100).lean(),
      getRatingOverview(user._id),
    ]);

    const { id: _omit, ...rest } = user;
    return res.json({
      success: true,
      data: {
        profile: { ...rest, id: user._id.toString() },
        ratingSummary: ratingOverview,
        listings: listings.map((l) => ({
          id: l._id.toString(), type: l.type, title: l.title, status: l.status, locality: l.locality,
          isVerified: Boolean(l.isVerified || l.roomDetails?.verified), photos: (l.photos || []).length, createdAt: l.createdAt,
        })),
        requests: requests.map((r) => ({
          id: r._id.toString(),
          role: String(r.buyerId) === String(user._id) ? "buyer" : "seller",
          listingTitle: r.listingTitle, status: r.status, message: r.message,
          buyerName: r.buyerName, messageCount: Array.isArray(r.messages) ? r.messages.length : 0,
          messages: (r.messages || []).slice(-30).map((m) => ({ senderName: m.senderName, text: m.text, createdAt: m.createdAt })),
          createdAt: r.createdAt,
        })),
        ratingsGiven: ratingsGiven.map(ratingRow),
        ratingsReceived: ratingsReceived.map(ratingRow),
        reportsAgainst: reportsAgainst.map(reportRow),
        reportsFiled: reportsFiled.map(reportRow),
      },
    });
  } catch (err) {
    next(err);
  }
});

const ratingRow = (r) => ({
  id: r._id.toString(),
  raterId: String(r.raterId), raterName: r.raterName, ratedUserId: String(r.ratedUserId),
  direction: r.direction, rating: r.rating, comment: r.comment, tags: r.tags || [],
  listingTitle: r.listingTitle, createdAt: r.createdAt,
});
const reportRow = (r) => ({
  id: r._id.toString(), targetType: r.targetType, targetTitle: r.targetTitle, reason: r.reason,
  details: r.details || r.description || "", status: r.status, createdAt: r.createdAt,
});

/** GET /api/admin/ratings - every person-to-person rating, newest first (moderation). */
router.get("/ratings", async (req, res, next) => {
  try {
    const query = {};
    if (req.query.max) query.rating = { $lte: Math.min(5, Math.max(1, Number(req.query.max) || 5)) };
    const rows = await UserRating.find(query).sort({ createdAt: -1 }).limit(200).lean();
    const ids = [...new Set(rows.map((r) => String(r.ratedUserId)))];
    const users = await User.find({ _id: { $in: ids } }).select("name").lean();
    const nameOf = new Map(users.map((u) => [String(u._id), u.name]));
    return res.json({
      success: true,
      data: rows.map((r) => ({ ...ratingRow(r), ratedName: nameOf.get(String(r.ratedUserId)) || "Deleted user" })),
    });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/admin/ratings/:id - remove an abusive or fake rating (the user's average updates automatically). */
router.delete("/ratings/:id", async (req, res, next) => {
  try {
    const rating = await UserRating.findById(req.params.id);
    if (!rating) return res.status(404).json({ success: false, error: "Rating not found." });
    await rating.deleteOne();
    console.log(`🛡️ [Admin Moderation] Rating ${rating._id} deleted by Admin ${req.userName}`);
    return res.json({ success: true, message: "Rating removed.", deletedId: req.params.id });
  } catch (err) {
    next(err);
  }
});

export default router;
