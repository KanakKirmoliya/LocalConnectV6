import { Router } from "express";
import { Report } from "../models/Report.js";
import { Listing } from "../models/Listing.js";
import { User } from "../models/User.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { cleanupMediaFiles } from "./uploadRoutes.js";

const router = Router();

// Suspension threshold constants
export const REPORT_THRESHOLD_TEMP = 3; // 3 distinct reports = 48-hour temporary suspension
export const REPORT_THRESHOLD_PERM = 5; // 5 distinct reports = permanent suspension / ban
export const TEMP_SUSPENSION_HOURS = 48;

/**
 * Re-evaluate user report count and automatic suspension state
 */
export async function evaluateUserSuspension(userId) {
  if (!userId) return null;
  const user = await User.findById(userId);
  if (!user || user.role === "admin") return null;

  // Count distinct community members who filed non-dismissed reports
  const uniqueReporters = await Report.distinct("reporterId", {
    reportedUserId: userId,
    status: { $ne: "dismissed" },
  });

  const distinctCount = uniqueReporters.length;
  user.reportCount = distinctCount;

  let triggered = "none";

  if (distinctCount >= REPORT_THRESHOLD_PERM) {
    if (user.suspensionStatus !== "permanent") {
      user.isBanned = true;
      user.suspensionStatus = "permanent";
      user.suspendedUntil = null;
      user.banReason = `Account permanently suspended following ${distinctCount} community reports for fraud or non-intended usage.`;
      triggered = "permanent";

      // Hide all listings by this user to protect community
      await Listing.updateMany(
        { ownerId: userId, status: "active" },
        { status: "hidden" }
      );
      console.log(`🛑 [Auto-Suspension] User "${user.name}" (${user.email}) permanently suspended (${distinctCount} reports).`);
    }
  } else if (distinctCount >= REPORT_THRESHOLD_TEMP) {
    if (user.suspensionStatus === "none") {
      user.isBanned = true;
      user.suspensionStatus = "temporary";
      user.suspendedUntil = new Date(Date.now() + TEMP_SUSPENSION_HOURS * 3600 * 1000);
      user.banReason = `Account temporarily suspended for ${TEMP_SUSPENSION_HOURS} hours following ${distinctCount} community reports for fraud or non-intended usage.`;
      triggered = "temporary";

      // Hide active listings during temporary suspension
      await Listing.updateMany(
        { ownerId: userId, status: "active" },
        { status: "hidden" }
      );
      console.log(`⚠️ [Auto-Suspension] User "${user.name}" (${user.email}) temporarily suspended for ${TEMP_SUSPENSION_HOURS}h (${distinctCount} reports).`);
    }
  }

  await user.save();
  return { distinctCount, triggered, user };
}

/**
 * POST /api/reports
 * Submit a community abuse/spam/fraud report on a listing or user account
 */
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const { targetType, targetId, reason, details } = req.body;

    if (!["listing", "user"].includes(targetType)) {
      return res.status(400).json({ success: false, error: "Invalid target type for report. Must be 'listing' or 'user'." });
    }

    if (!targetId) {
      return res.status(400).json({ success: false, error: "Target ID is required." });
    }

    const validReasons = [
      "fake",
      "duplicate",
      "misleading",
      "expired",
      "inappropriate",
      "scam",
      "harassment",
      "misuse",
      "commercial_spam",
      "other",
    ];
    if (!validReasons.includes(reason)) {
      return res.status(400).json({
        success: false,
        error: `Invalid report reason. Choose from: ${validReasons.join(", ")}`,
      });
    }

    // Check for duplicate report within last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000);
    const existing = await Report.findOne({
      reporterId: req.userId,
      targetId,
      createdAt: { $gte: oneDayAgo },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        error: "You have already reported this item within the last 24 hours. Our moderation team is reviewing it.",
      });
    }

    let targetTitle = "";
    let reportedUserId = null;

    if (targetType === "listing") {
      const listing = await Listing.findById(targetId);
      if (!listing) {
        return res.status(404).json({ success: false, error: "Reported listing not found." });
      }
      if (listing.ownerId.toString() === req.userId) {
        return res.status(400).json({ success: false, error: "You cannot report your own listing." });
      }
      targetTitle = listing.title;
      reportedUserId = listing.ownerId;
    } else if (targetType === "user") {
      if (targetId.toString() === req.userId) {
        return res.status(400).json({ success: false, error: "You cannot report your own account." });
      }
      const targetUser = await User.findById(targetId);
      if (!targetUser) {
        return res.status(404).json({ success: false, error: "Reported user not found." });
      }
      targetTitle = targetUser.name;
      reportedUserId = targetUser._id;
    }

    const report = await Report.create({
      reporterId: req.userId,
      reporterName: req.userName || "Neighbor",
      targetType,
      targetId,
      reportedUserId,
      targetTitle,
      reason,
      details: details ? details.trim() : "",
      status: "pending",
    });

    console.log(`🚩 [Abuse Moderation] New ${reason.toUpperCase()} report filed by ${req.userName} on ${targetType} "${targetTitle}"`);

    // Re-evaluate fraud/misuse suspension thresholds against the reported user
    const evalResult = await evaluateUserSuspension(reportedUserId);
    if (evalResult?.triggered && evalResult.triggered !== "none") {
      report.autoSuspensionTriggered = evalResult.triggered;
      await report.save();
    }

    let userMessage = "Thank you for reporting. NearNest moderators will review this item to protect the community.";
    if (evalResult?.triggered === "temporary") {
      userMessage = "Report received. This account has accumulated 3 community reports and has been automatically suspended for 48 hours pending investigation.";
    } else if (evalResult?.triggered === "permanent") {
      userMessage = "Report received. This account has reached 5 community reports and has been permanently suspended from NearNest.";
    }

    return res.status(201).json({
      success: true,
      message: userMessage,
      data: report,
      autoSuspended: evalResult?.triggered !== "none",
      suspensionType: evalResult?.triggered || "none",
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/reports/admin (or GET /api/reports with requireAdmin)
 * Fetch reports for administrator review
 */
router.get("/admin", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { status } = req.query;
    const query = {};
    if (status && status !== "all") {
      query.status = status;
    }

    const reports = await Report.find(query)
      .populate("reportedUserId", "name email role isBanned suspensionStatus suspendedUntil reportCount")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.json({
      success: true,
      data: reports,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/reports/admin/:id
 * Admin moderation action on report (Dismiss, Hide Listing, Restore Listing, Delete Listing, Ban User, Lift Suspension)
 */
router.patch("/admin/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { action, notes } = req.body;
    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, error: "Report not found." });
    }

    const validActions = [
      "dismiss",
      "hide_listing",
      "restore_listing",
      "delete_listing",
      "user_suspended_temp",
      "ban_user",
      "suspension_lifted",
    ];
    if (!validActions.includes(action)) {
      return res.status(400).json({ success: false, error: `Invalid moderation action. Choose from: ${validActions.join(", ")}` });
    }

    let actionTakenDesc = "No destructive action taken.";

    if (action === "dismiss") {
      report.status = "dismissed";
      report.moderationAction = "none";
      actionTakenDesc = "Report dismissed as unfounded.";

      // Re-evaluate user active report count
      if (report.reportedUserId) {
        await evaluateUserSuspension(report.reportedUserId);
      }
    } else if (action === "hide_listing") {
      if (report.targetType === "listing") {
        const listing = await Listing.findById(report.targetId);
        if (listing) {
          listing.status = "hidden";
          await listing.save();
          actionTakenDesc = `Listing "${listing.title}" hidden from marketplace feeds.`;
        }
      }
      report.status = "action_taken";
      report.moderationAction = "listing_hidden";
    } else if (action === "restore_listing") {
      if (report.targetType === "listing") {
        const listing = await Listing.findById(report.targetId);
        if (listing) {
          listing.status = "active";
          await listing.save();
          actionTakenDesc = `Listing "${listing.title}" restored to active status.`;
        }
      }
      report.status = "reviewed";
      report.moderationAction = "none";
    } else if (action === "delete_listing") {
      if (report.targetType === "listing") {
        const listing = await Listing.findById(report.targetId);
        if (listing) {
          cleanupMediaFiles(listing.photos, listing.videos);
          await listing.deleteOne();
          actionTakenDesc = `Listing "${listing.title}" permanently deleted and media purged.`;
        }
      }
      report.status = "action_taken";
      report.moderationAction = "listing_deleted";
    } else if (action === "user_suspended_temp") {
      const userId = report.reportedUserId || (report.targetType === "user" ? report.targetId : null);
      if (userId) {
        const targetUser = await User.findById(userId);
        if (targetUser && targetUser.role !== "admin") {
          targetUser.isBanned = true;
          targetUser.suspensionStatus = "temporary";
          targetUser.suspendedUntil = new Date(Date.now() + 48 * 3600 * 1000);
          targetUser.banReason = notes || `Account temporarily suspended for 48 hours following admin investigation (${report.reason}).`;
          await targetUser.save();
          await Listing.updateMany({ ownerId: targetUser._id, status: "active" }, { status: "hidden" });
          actionTakenDesc = `User "${targetUser.name}" temporarily suspended for 48 hours.`;
        }
      }
      report.status = "action_taken";
      report.moderationAction = "user_suspended_temp";
    } else if (action === "ban_user") {
      const userId = report.reportedUserId || (report.targetType === "user" ? report.targetId : null);
      if (userId) {
        const targetUser = await User.findById(userId);
        if (targetUser && targetUser.role !== "admin") {
          targetUser.isBanned = true;
          targetUser.suspensionStatus = "permanent";
          targetUser.suspendedUntil = null;
          targetUser.banReason = notes || `Account permanently banned following confirmed community report (${report.reason}).`;
          await targetUser.save();
          await Listing.updateMany({ ownerId: targetUser._id, status: "active" }, { status: "hidden" });
          actionTakenDesc = `User "${targetUser.name}" permanently banned from platform.`;
        }
      }
      report.status = "action_taken";
      report.moderationAction = "user_banned";
    } else if (action === "suspension_lifted") {
      const userId = report.reportedUserId || (report.targetType === "user" ? report.targetId : null);
      if (userId) {
        const targetUser = await User.findById(userId);
        if (targetUser) {
          targetUser.isBanned = false;
          targetUser.suspensionStatus = "none";
          targetUser.suspendedUntil = null;
          targetUser.banReason = "";
          await targetUser.save();
          actionTakenDesc = `Suspension lifted for user "${targetUser.name}". Account restored.`;
        }
      }
      report.status = "reviewed";
      report.moderationAction = "suspension_lifted";
    }

    report.moderatedBy = req.userId;
    report.moderatorName = req.userName || "Admin";
    report.moderationNotes = notes || actionTakenDesc;
    report.reviewedAt = new Date();
    await report.save();

    console.log(`🛡️ [Admin Moderation] Report ${report._id} updated with action "${action}" by ${req.userName}. Outcome: ${actionTakenDesc}`);

    return res.json({
      success: true,
      message: actionTakenDesc,
      data: report,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
