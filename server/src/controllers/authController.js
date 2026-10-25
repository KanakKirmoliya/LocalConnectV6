import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import { Listing } from "../models/Listing.js";
import { Request } from "../models/Request.js";
import { UserRating } from "../models/UserRating.js";
import { cleanupMediaFiles } from "../routes/uploadRoutes.js";
import { signToken } from "../middleware/auth.js";
import { assertNoActiveTenancy, purgeUserVerificationData, sendDeny } from "../roomVerification.js";

export async function signup(req, res, next) {
  try {
    const { name, email, password, area, phone } = req.body;

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: "An account with this email already exists. Try logging in.",
      });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      passwordHash,
      area: area || "",
      phone: phone || "",
      role: "user",
    });

    const token = signToken({ id: user._id.toString(), role: user.role });

    return res.status(201).json({
      success: true,
      user: user.toPublicJSON(),
      token,
    });
  } catch (error) {
    next(error);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({
        success: false,
        error: "Email or password is incorrect.",
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: "Email or password is incorrect.",
      });
    }

    const suspension = typeof user.isSuspended === "function" ? user.isSuspended() : { suspended: user.isBanned, reason: user.banReason };
    if (suspension.suspended) {
      const msg = suspension.type === "temporary" && suspension.until
        ? `Your account is temporarily suspended until ${new Date(suspension.until).toLocaleString()} due to community fraud/misuse reports.${suspension.reason ? ` Reason: ${suspension.reason}` : ""}`
        : `Your account has been suspended by administration.${suspension.reason ? ` Reason: ${suspension.reason}` : " Please contact platform support."}`;

      return res.status(403).json({
        success: false,
        error: msg,
        suspension: {
          type: suspension.type || "permanent",
          until: suspension.until || null,
          reason: suspension.reason || user.banReason || "",
        },
      });
    }

    const token = signToken({ id: user._id.toString(), role: user.role });

    return res.json({
      success: true,
      user: user.toPublicJSON(),
      token,
    });
  } catch (error) {
    next(error);
  }
}

export async function getMe(req, res) {
  return res.json({
    success: true,
    user: req.user.toPublicJSON(),
  });
}

/**
 * PATCH /api/auth/me
 * Edit my own profile: name, phone, bio, area, profile photo and the saved map centre (GPS).
 * Only the fields that are sent are changed. Role / ban state / email can never be changed here.
 */
export async function updateMe(req, res, next) {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ success: false, error: "User account not found." });

    const { name, phone, area, bio, avatar, coordinates } = req.body;
    const previousAvatar = user.avatar;

    if (name !== undefined) user.name = name;
    if (phone !== undefined) user.phone = phone;
    if (area !== undefined) user.area = area;
    if (bio !== undefined) user.bio = bio;
    if (avatar !== undefined) user.avatar = avatar;
    if (coordinates === null) user.coordinates = { lat: undefined, lng: undefined };
    else if (coordinates) user.coordinates = { lat: coordinates.lat, lng: coordinates.lng };

    await user.save();

    // Keep the copies of my name / phone that were written onto my listings, requests and ratings in step.
    const listingSet = {};
    if (name !== undefined) listingSet.ownerName = user.name;
    if (phone !== undefined) listingSet.ownerPhone = user.phone;
    if (Object.keys(listingSet).length) await Listing.updateMany({ ownerId: user._id }, { $set: listingSet });
    if (name !== undefined) {
      await Request.updateMany({ buyerId: user._id }, { $set: { buyerName: user.name } });
      await UserRating.updateMany({ raterId: user._id }, { $set: { raterName: user.name } });
    }

    // Remove the replaced profile photo from disk.
    if (avatar !== undefined && previousAvatar && previousAvatar !== user.avatar) cleanupMediaFiles([previousAvatar], []);

    return res.json({ success: true, user: user.toPublicJSON() });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/auth/me
 * DPDP Act 2023 Section 12: Right to Correction and Erasure of Personal Data
 * Permanently deletes user account, active listings, media files, inquiries, and alerts.
 */
export async function deleteMe(req, res, next) {
  try {
    const { password } = req.body;
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "User account not found." });
    }

    if (user.role === "admin") {
      return res.status(400).json({
        success: false,
        error: "Master Admin accounts cannot be self-deleted. Contact system owner.",
      });
    }

    if (!password) {
      return res.status(400).json({
        success: false,
        error: "Please provide your current password to confirm permanent account deletion.",
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: "Incorrect password. Account deletion aborted.",
      });
    }

    // A running tenancy can only end with both parties' consent, so the account cannot be deleted meanwhile.
    const tenancyCheck = await assertNoActiveTenancy(user._id);
    if (!tenancyCheck.ok) return sendDeny(res, tenancyCheck);

    // 1. Clean up user's listings and disk media files
    const userListings = await Listing.find({ ownerId: user._id });
    for (const l of userListings) {
      cleanupMediaFiles(l.photos, l.videos);
      await l.deleteOne();
    }

    // 2. Clean up user's buyer and seller requests / chats
    await Request.deleteMany({ $or: [{ buyerId: user._id }, { sellerId: user._id }] });

    // 2b. Erase private identity/ownership documents, properties, permissions and tenancy history
    await purgeUserVerificationData(user._id);

    // 3. Clean up user document (and profile photo + ratings given/received)
    if (user.avatar) cleanupMediaFiles([user.avatar], []);
    await UserRating.deleteMany({ $or: [{ raterId: user._id }, { ratedUserId: user._id }] });
    await user.deleteOne();

    console.log(`🔒 [DPDP Compliance] User account "${user.email}" and all associated personal data permanently erased by user.`);

    return res.json({
      success: true,
      message: "Your account and all associated personal data have been permanently erased in compliance with the Digital Personal Data Protection Act, 2023.",
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/auth/me/export
 * DPDP Act 2023 Section 11: Right to Access Information About Personal Data & Portability
 * Returns full readable data dump of the user's personal identifiers, listings, and messages.
 */
export async function exportMe(req, res, next) {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "User account not found." });
    }

    const listings = await Listing.find({ ownerId: user._id }).lean();
    const sentRequests = await Request.find({ buyerId: user._id }).lean();
    const receivedRequests = await Request.find({ sellerId: user._id }).lean();

    const dataDump = {
      exportMetadata: {
        platform: "NearNest Hyperlocal Community",
        legalBasis: "Digital Personal Data Protection Act (DPDP), 2023",
        exportedAt: new Date().toISOString(),
      },
      profile: user.toPublicJSON(),
      personalIdentifiers: {
        name: user.name,
        email: user.email,
        phone: user.phone || "Not provided",
        registeredArea: user.area || "Not provided",
      },
      listingsCount: listings.length,
      listings,
      inquiries: {
        sentCount: sentRequests.length,
        sent: sentRequests,
        receivedCount: receivedRequests.length,
        received: receivedRequests,
      },
    };

    return res.json({
      success: true,
      data: dataDump,
    });
  } catch (error) {
    next(error);
  }
}
