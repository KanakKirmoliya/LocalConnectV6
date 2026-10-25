import { Listing } from "../models/Listing.js";
import { User } from "../models/User.js";
import { getOptionalViewer } from "../middleware/auth.js";
import { distanceMetres } from "../utils/roomLocation.js";
import {
  reserveRoomLocation,
  locationFieldsFor,
  roomLocationRuleEnabled,
  isLocationClaimConflict,
  ROOM_LOCATION_TAKEN_ERROR,
} from "../services/roomLocationGuard.js";
import { checkVehicleListingInput, formatPlate, PLATE_TAKEN_ERROR } from "../utils/vehiclePlate.js";
import { cleanupMediaFiles } from "../routes/uploadRoutes.js";
import {
  reserveRoomForListing,
  applyReservedRoom,
  getRoomForListing,
  prepareRoomPhotoUpdate,
  assertRoomMayBeActive,
  assertRoomDeletable,
  retireRoomForListing,
  resolvePropertyForListing,
  sendDeny,
  roomIdentityKey,
  parseAddressForKey,
  Room,
  ROOM_IDENTITY_TAKEN_ERROR,
} from "../roomVerification.js";

// Administrator accounts are invisible to members: whatever an admin posted is shown as "NearNest Alerts".
async function hideAdminOwners(req, rows) {
  const viewer = await getOptionalViewer(req);
  if (viewer?.isAdmin) return rows;
  const ids = [...new Set(rows.map((r) => r.ownerId).filter(Boolean))];
  if (!ids.length) return rows;
  const admins = await User.find({ _id: { $in: ids }, role: "admin" }).select("_id").lean();
  if (!admins.length) return rows;
  const adminIds = new Set(admins.map((a) => String(a._id)));
  return rows.map((r) => (adminIds.has(String(r.ownerId)) ? { ...r, ownerId: "", ownerName: "NearNest Alerts" } : r));
}

export async function getListings(req, res, next) {
  try {
    const {
      type,
      status = "active",
      search,
      page = 1,
      limit = 20,
      // Room filters
      maxRent,
      minRent,
      roomType,
      amenity,
      availableFrom,
      // Vehicle filters
      vehicleType,
      // Lost & Found filters
      kind,
      // Service filters
      serviceCategory,
    } = req.query;

    const query = {};

    if (type) {
      query.type = type;
    }

    if (status && status !== "all") {
      query.status = status;
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$or = [{ title: searchRegex }, { description: searchRegex }, { locality: searchRegex }];
    }

    // Category specific query filters
    if (type === "room") {
      if (minRent !== undefined || maxRent !== undefined) {
        query["roomDetails.rent"] = {};
        if (minRent !== undefined) query["roomDetails.rent"].$gte = Number(minRent);
        if (maxRent !== undefined) query["roomDetails.rent"].$lte = Number(maxRent);
      }
      if (roomType) query["roomDetails.roomType"] = roomType;
      if (amenity) query["roomDetails.amenities"] = amenity;
      if (availableFrom) {
        const date = new Date(availableFrom);
        if (!Number.isNaN(date.getTime())) {
          query.$and = [
            ...(query.$and || []),
            {
              $or: [
                { "roomDetails.availableFrom": null },
                { "roomDetails.availableFrom": { $lte: date } },
              ],
            },
          ];
        }
      }
    } else if (type === "vehicle") {
      if (vehicleType && vehicleType !== "All") {
        query["vehicleDetails.vehicleType"] = vehicleType;
      }
    } else if (type === "lost_found") {
      if (kind && (kind === "lost" || kind === "found")) {
        query["lostFoundDetails.kind"] = kind;
      }
    } else if (type === "service") {
      if (serviceCategory && serviceCategory !== "All") {
        query["serviceDetails.serviceCategory"] = serviceCategory;
      }
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [total, listings] = await Promise.all([
      Listing.countDocuments(query),
      Listing.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
    ]);

    return res.json({
      success: true,
      count: listings.length,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum) || 1,
      },
      data: await hideAdminOwners(req, listings.map((l) => l.toFormattedJSON())),
    });
  } catch (error) {
    next(error);
  }
}

export async function getListingById(req, res, next) {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({
        success: false,
        error: "Listing not found.",
      });
    }
    const [safe] = await hideAdminOwners(req, [listing.toFormattedJSON()]);
    return res.json({
      success: true,
      data: safe,
    });
  } catch (error) {
    next(error);
  }
}

export async function confirmAvailability(req, res, next) {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({ success: false, error: "Listing not found." });
    }
    if (listing.type !== "room") {
      return res.status(400).json({ success: false, error: "Only room listings have availability confirmation." });
    }
    if (listing.ownerId.toString() !== req.userId && req.userRole !== "admin") {
      return res.status(403).json({ success: false, error: "Only the listing owner can confirm availability." });
    }

    listing.roomDetails = listing.roomDetails || {};
    listing.roomDetails.availabilityConfirmedAt = new Date();
    await listing.save();
    return res.json({
      success: true,
      availabilityConfirmedAt: listing.roomDetails.availabilityConfirmedAt,
    });
  } catch (error) {
    next(error);
  }
}

export async function createListing(req, res, next) {
  try {
    if (req.userRole === "admin") {
      return res.status(403).json({
        success: false,
        error: "Master Admin accounts cannot post consumer marketplace listings. Use a regular user account.",
      });
    }

    const listingData = {
      ...req.body,
      ownerId: req.userId,
      ownerName: req.userName,
    };
    if (listingData.roomDetails) {
      listingData.roomDetails.verified = false;
    }
    // Location identity is server-owned: never trust these fields from the client.
    for (const k of ["locationKey", "locationClaimKey", "location", "locationSource", "locationAccuracyM"]) delete listingData[k];

    // Vehicles: number plate + photo are compulsory, and one plate can only ever be listed once.
    if (listingData.type === "vehicle") {
      const check = checkVehicleListingInput({
        plateNumber: listingData.vehicleDetails?.plateNumber ?? listingData.plateNumber,
        photos: listingData.photos,
      });
      if (!check.ok) return res.status(check.status).json({ success: false, error: check.error });
      const taken = await Listing.exists({ type: "vehicle", "vehicleDetails.plateNumber": check.plate });
      if (taken) return res.status(409).json({ success: false, error: PLATE_TAKEN_ERROR });
      listingData.vehicleDetails = {
        ...(listingData.vehicleDetails || {}),
        plateNumber: check.plate,
        booked: false,
        bookedAt: null,
      };
      delete listingData.plateNumber;
    }

    // Same coordinates + address + flat + room as a live room? Refuse before anything is created.
    if (listingData.type === "room") {
      const { address } = parseAddressForKey({ ...listingData, ...(listingData.address || {}) });
      const key = roomIdentityKey({ address, latitude: req.body.latitude, longitude: req.body.longitude, unitNumber: listingData.unitNumber || "Main" });
      if (key && (await Room.exists({ identityKey: key, isLive: true }))) {
        return res.status(409).json({ success: false, error: ROOM_IDENTITY_TAKEN_ERROR, code: "DUPLICATE_ROOM" });
      }
    }

    // Room location identity: validated coordinates -> exclusive lock -> neighbour check (held until the room is saved).
    let locationLock = null;
    if (listingData.type === "room" && roomLocationRuleEnabled()) {
      const reserved = await reserveRoomLocation({
        latitude: req.body.latitude,
        longitude: req.body.longitude,
        locationSource: req.body.locationSource,
        locationAccuracyM: req.body.locationAccuracyM,
      });
      if (!reserved.ok) return res.status(reserved.status).json({ success: false, error: reserved.error, code: reserved.code });
      locationLock = reserved;
      listingData.latitude = reserved.loc.lat;
      listingData.longitude = reserved.loc.lng;
    }

    try {
    // Rooms can only be listed by a verified owner (or someone the verified owner authorised).
    // All checks run here on the backend; nothing the client sends is trusted.
    let roomCtx = null;
    if (listingData.type === "room") {
      // Address is compulsory: the property (and its hidden ID) is created from it; duplicates by another owner are refused.
      const resolved = await resolvePropertyForListing(req.user, { ...listingData, ...(listingData.address || {}) }, req);
      if (!resolved.ok) return sendDeny(res, resolved);
      roomCtx = await reserveRoomForListing({
        user: req.user,
        propertyRef: resolved.propertyRef,
        unitNumber: listingData.unitNumber || "Main",
        latitude: listingData.latitude,
        longitude: listingData.longitude,
        floor: listingData.floor,
        roomType: listingData.roomDetails?.roomType,
        rent: listingData.roomDetails?.rent,
        photos: listingData.photos,
      });
      if (!roomCtx.ok) return sendDeny(res, roomCtx);
      applyReservedRoom(listingData, roomCtx);
    }
    if (locationLock) Object.assign(listingData, locationFieldsFor(locationLock.loc));
    delete listingData.propertyId;
    delete listingData.unitNumber;
    delete listingData.floor;

    if (listingData.latitude != null && listingData.longitude != null) {
      listingData.location = {
        type: "Point",
        coordinates: [listingData.longitude, listingData.latitude],
      };
    }

    let listing;
    try {
      listing = await Listing.create(listingData);
    } catch (createError) {
      if (roomCtx) await roomCtx.rollback();
      // Two people submitting the same plate at the same moment: the unique index stops the second one.
      if (createError?.code === 11000 && listingData.type === "vehicle") {
        return res.status(409).json({ success: false, error: PLATE_TAKEN_ERROR });
      }
      if (listingData.type === "room" && isLocationClaimConflict(createError)) {
        return res.status(409).json({ success: false, error: ROOM_LOCATION_TAKEN_ERROR, code: "ROOM_LOCATION_TAKEN" });
      }
      throw createError;
    }

    return res.status(201).json({
      success: true,
      data: listing.toFormattedJSON(),
    });
    } finally {
      if (locationLock) await locationLock.release();
    }
  } catch (error) {
    next(error);
  }
}

export async function updateListing(req, res, next) {
  // The location lock (if any) is held until the listing is saved, then always released.
  const holder = { lock: null };
  try {
    await updateListingInner(req, res, next, holder);
  } finally {
    if (holder.lock) await holder.lock.release().catch(() => {});
  }
}

async function updateListingInner(req, res, next, holder) {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({
        success: false,
        error: "Listing not found.",
      });
    }

    // Strict ownership verification: only owner or admin can edit
    if (listing.ownerId.toString() !== req.userId && req.userRole !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Unauthorized: You can only edit your own listings.",
      });
    }

    const body = req.body || {};

    // Rooms tied to a verified property: the backend keeps their location, photos and activation honest.
    let roomPhotoCheck = null;
    let lockLocation = false;
    if (listing.type === "room") {
      const roomRecord = await getRoomForListing(listing._id);
      lockLocation = Boolean(roomRecord?.propertyId);
      if (body.status === "active" && listing.status !== "active") {
        const allowed = await assertRoomMayBeActive(listing, req.user);
        if (!allowed.ok) return sendDeny(res, allowed);
      }
      if (Array.isArray(body.photos)) {
        roomPhotoCheck = await prepareRoomPhotoUpdate(listing, body.photos);
        if (!roomPhotoCheck.ok) return sendDeny(res, roomPhotoCheck);
      }
    }

    // Room location identity: a changed point must pass the same checks as a new room.
    let newRoomLocation = null;
    if (listing.type === "room" && roomLocationRuleEnabled()) {
      const posted = body.latitude !== undefined || body.longitude !== undefined;
      if (posted) {
        const source = { latitude: body.latitude, longitude: body.longitude, locationSource: body.locationSource, locationAccuracyM: body.locationAccuracyM };
        const reserved = await reserveRoomLocation(source, { excludeListingId: listing._id });
        if (!reserved.ok) return res.status(reserved.status).json({ success: false, error: reserved.error, code: reserved.code });
        holder.lock = reserved;
        const moved = typeof listing.latitude === "number" && typeof listing.longitude === "number"
          ? distanceMetres(listing.latitude, listing.longitude, reserved.loc.lat, reserved.loc.lng)
          : Infinity;
        if (lockLocation && moved > 0.5) {
          return res.status(403).json({
            success: false,
            code: "LOCATION_LOCKED",
            error: "This room's location is fixed to its verified property and cannot be moved. Contact support if the pin is wrong.",
          });
        }
        newRoomLocation = reserved.loc;
      }
    }

    // Common fields
    if (body.title !== undefined) listing.title = body.title.trim();
    if (body.description !== undefined) listing.description = body.description.trim();
    if (body.locality !== undefined && !lockLocation) listing.locality = body.locality.trim();
    if (body.status !== undefined) listing.status = body.status;

    // Media
    if (Array.isArray(body.photos)) listing.photos = body.photos;
    if (Array.isArray(body.videos)) listing.videos = body.videos;

    // Geo coordinates (fixed by the verified property for property-linked rooms)
    if (newRoomLocation) {
      Object.assign(listing, locationFieldsFor(newRoomLocation));
    } else if (!lockLocation && (listing.type !== "room" || !roomLocationRuleEnabled()) && (body.latitude !== undefined || body.longitude !== undefined)) {
      const lat = body.latitude === null ? null : body.latitude !== undefined ? Number(body.latitude) : listing.latitude;
      const lng = body.longitude === null ? null : body.longitude !== undefined ? Number(body.longitude) : listing.longitude;
      listing.latitude = lat;
      listing.longitude = lng;
      listing.location = lat == null || lng == null
        ? undefined
        : { type: "Point", coordinates: [lng, lat] };
    }

    // Category-specific details
    if (listing.type === "room") {
      const roomUpdates = body.roomDetails || {};
      if (!listing.roomDetails) listing.roomDetails = {};
      if (body.rent !== undefined || roomUpdates.rent !== undefined) listing.roomDetails.rent = Number(body.rent ?? roomUpdates.rent);
      if (body.deposit !== undefined || roomUpdates.deposit !== undefined) listing.roomDetails.deposit = Number(body.deposit ?? roomUpdates.deposit);
      if (body.maintenance !== undefined || roomUpdates.maintenance !== undefined) listing.roomDetails.maintenance = Number(body.maintenance ?? roomUpdates.maintenance);
      if (body.roomType !== undefined || roomUpdates.roomType !== undefined) listing.roomDetails.roomType = body.roomType ?? roomUpdates.roomType;
      if (body.availableFrom !== undefined || roomUpdates.availableFrom !== undefined) {
        listing.roomDetails.availableFrom = body.availableFrom ?? roomUpdates.availableFrom ?? null;
      }
      if (body.period !== undefined || roomUpdates.period !== undefined) listing.roomDetails.period = body.period ?? roomUpdates.period;
      const amenities = body.amenities ?? roomUpdates.amenities;
      if (Array.isArray(amenities)) {
        listing.roomDetails.amenities = amenities;
      } else if (typeof amenities === "string") {
        listing.roomDetails.amenities = amenities.split(",").map((s) => s.trim()).filter(Boolean);
      }
      const verified = body.verified ?? roomUpdates.verified;
      if (verified !== undefined && req.userRole === "admin") {
        listing.roomDetails.verified = Boolean(verified);
      }
    } else if (listing.type === "vehicle") {
      if (!listing.vehicleDetails) listing.vehicleDetails = {};
      if (body.rate !== undefined || body.rentalPrice !== undefined) {
        listing.vehicleDetails.rentalPrice = Number(body.rate ?? body.rentalPrice);
      }
      if (body.type !== undefined || body.vehicleType !== undefined) {
        listing.vehicleDetails.vehicleType = body.type ?? body.vehicleType;
      }
      // Older listings created before plates were compulsory can add their plate once.
      if (!listing.vehicleDetails.plateNumber && body.plateNumber !== undefined) {
        const check = checkVehicleListingInput({ plateNumber: body.plateNumber, photos: listing.photos });
        if (!check.ok) return res.status(check.status).json({ success: false, error: check.error });
        const taken = await Listing.exists({ _id: { $ne: listing._id }, type: "vehicle", "vehicleDetails.plateNumber": check.plate });
        if (taken) return res.status(409).json({ success: false, error: PLATE_TAKEN_ERROR });
        listing.vehicleDetails.plateNumber = check.plate;
      }
      // The number plate is permanent for the life of the listing (it cannot be edited or reused).
      // "available" can't be used to sneak a booked vehicle back onto the list: only Unbook does that.
      if (body.available !== undefined && !listing.vehicleDetails.booked) {
        listing.vehicleDetails.available = Boolean(body.available);
      }
    } else if (listing.type === "lost_found") {
      if (!listing.lostFoundDetails) listing.lostFoundDetails = {};
      if (body.kind !== undefined) listing.lostFoundDetails.kind = body.kind;
      if (body.title !== undefined) listing.lostFoundDetails.itemName = body.title;
    } else if (listing.type === "service") {
      if (!listing.serviceDetails) listing.serviceDetails = {};
      if (body.trade !== undefined || body.serviceCategory !== undefined) {
        listing.serviceDetails.serviceCategory = body.trade ?? body.serviceCategory;
      }
      if (body.price !== undefined || body.pricingInfo !== undefined) {
        listing.serviceDetails.pricingInfo = body.price ?? body.pricingInfo;
      }
      if (body.available !== undefined) listing.serviceDetails.available = Boolean(body.available);
    } else if (listing.type === "alert") {
      if (!listing.alertDetails) listing.alertDetails = {};
      if (body.type !== undefined || body.alertType !== undefined) {
        listing.alertDetails.alertType = body.type ?? body.alertType;
      }
    }

    await listing.save();
    if (roomPhotoCheck) await roomPhotoCheck.commit();

    // Format web object so frontend can update state seamlessly
    const isLegacyDefaultLocation =
      (listing.latitude === 28.6139 && listing.longitude === 77.209) ||
      (listing.location?.coordinates?.[0] === 77.209 && listing.location?.coordinates?.[1] === 28.6139);
    const publicLatitude = listing.latitude == null || isLegacyDefaultLocation ? null : Number(listing.latitude.toFixed(2));
    const publicLongitude = listing.longitude == null || isLegacyDefaultLocation ? null : Number(listing.longitude.toFixed(2));
    const webItem = {
      id: listing._id.toString(),
      _id: listing._id.toString(),
      title: listing.title,
      owner: listing.ownerName,
      ownerId: listing.ownerId.toString(),
      locality: listing.locality,
      latitude: publicLatitude,
      longitude: publicLongitude,
      location: publicLatitude == null || publicLongitude == null
        ? null
        : { type: "Point", coordinates: [publicLongitude, publicLatitude] },
      photos: listing.photos,
      videos: listing.videos,
      status: listing.status,
      rent: listing.roomDetails?.rent,
      deposit: listing.roomDetails?.deposit,
      maintenance: listing.roomDetails?.maintenance,
      roomType: listing.roomDetails?.roomType,
      availableFrom: listing.roomDetails?.availableFrom,
      availabilityConfirmedAt: listing.roomDetails?.availabilityConfirmedAt,
      amenities: listing.roomDetails?.amenities,
      verified: listing.roomDetails?.verified,
      name: listing.title,
      type: listing.vehicleDetails?.vehicleType || listing.alertDetails?.alertType,
      rate: listing.vehicleDetails?.rentalPrice,
      available: listing.vehicleDetails?.available,
      plateNumber: formatPlate(listing.vehicleDetails?.plateNumber),
      booked: Boolean(listing.vehicleDetails?.booked),
      kind: listing.lostFoundDetails?.kind,
      where: listing.locality,
      by: listing.ownerName,
      trade: listing.serviceDetails?.serviceCategory,
      price: listing.serviceDetails?.pricingInfo,
      rating: listing.serviceDetails?.rating,
      jobs: listing.serviceDetails?.jobsCount,
      helpers: listing.alertDetails?.helpersCount || 0,
      description: listing.description,
      createdAt: listing.createdAt,
      updatedAt: listing.updatedAt,
      km: null,
      ang: 30,
    };

    return res.json({
      success: true,
      data: webItem,
      ...webItem,
    });
  } catch (error) {
    if (isLocationClaimConflict(error)) {
      return res.status(409).json({ success: false, error: ROOM_LOCATION_TAKEN_ERROR, code: "ROOM_LOCATION_TAKEN" });
    }
    next(error);
  }
}

export async function deleteListing(req, res, next) {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({
        success: false,
        error: "Listing not found.",
      });
    }

    // Strict ownership verification: only owner or admin can delete
    if (listing.ownerId.toString() !== req.userId && req.userRole !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Unauthorized: You can only delete your own listings.",
      });
    }

    // A room with a running tenancy cannot simply be deleted: that would end the tenancy without both parties' consent.
    if (listing.type === "room") {
      const deletable = await assertRoomDeletable(listing._id);
      if (!deletable.ok) return sendDeny(res, deletable);
    }

    // Clean up persistent media from disk
    cleanupMediaFiles(listing.photos, listing.videos);

    await listing.deleteOne();
    if (listing.type === "room") await retireRoomForListing(listing._id);

    return res.json({
      success: true,
      message: "Listing deleted successfully.",
      deletedId: req.params.id,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/rentals/:id/booking   (also PATCH /api/v1/listings/:id/booking)
 * Body: { booked: true | false }
 *   booked: true  -> "Book":   vehicle is rented out, removed from the public list.
 *   booked: false -> "Unbook": vehicle is back on the public list.
 * The number plate stays stored in both states, so nobody can list the same vehicle again.
 * Only the listing owner (or an admin) can change this.
 */
export async function setVehicleBooking(req, res, next) {
  try {
    if (typeof req.body?.booked !== "boolean") {
      return res.status(400).json({ success: false, error: "Send { booked: true } to book or { booked: false } to unbook." });
    }
    const wantBooked = req.body.booked;

    const listing = await Listing.findById(req.params.id);
    if (!listing || listing.type !== "vehicle") {
      return res.status(404).json({ success: false, error: "Vehicle listing not found." });
    }
    if (listing.ownerId.toString() !== req.userId && req.userRole !== "admin") {
      return res.status(403).json({ success: false, error: "Only the vehicle owner can book or unbook this vehicle." });
    }

    const current = Boolean(listing.vehicleDetails?.booked);
    if (current === wantBooked) {
      return res.status(409).json({
        success: false,
        error: wantBooked ? "This vehicle is already marked as booked." : "This vehicle is already unbooked and visible in the list.",
      });
    }

    listing.vehicleDetails.booked = wantBooked;
    listing.vehicleDetails.bookedAt = wantBooked ? new Date() : null;
    listing.vehicleDetails.available = !wantBooked;
    await listing.save();

    return res.json({
      success: true,
      message: wantBooked
        ? "Vehicle booked. It is hidden from the rental list until you click Unbook."
        : "Vehicle unbooked. It is visible in the rental list again.",
      data: {
        id: listing._id.toString(),
        plateNumber: formatPlate(listing.vehicleDetails.plateNumber),
        booked: listing.vehicleDetails.booked,
        available: listing.vehicleDetails.available,
        bookedAt: listing.vehicleDetails.bookedAt,
      },
    });
  } catch (error) {
    next(error);
  }
}
