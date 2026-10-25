import mongoose from "mongoose";

const listingSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Owner ID is required"],
      index: true,
    },
    ownerName: {
      type: String,
      required: [true, "Owner name is required"],
      trim: true,
    },
    ownerPhone: {
      type: String,
      default: "",
      trim: true,
    },
    type: {
      type: String,
      required: [true, "Listing type is required"],
      enum: {
        values: ["room", "vehicle", "lost_found", "service", "alert"],
        message: "{VALUE} is not a supported listing category",
      },
      index: true,
    },
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      minlength: [3, "Title must be at least 3 characters"],
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    locality: {
      type: String,
      required: [true, "Locality/Area is required"],
      trim: true,
    },
    latitude: {
      type: Number,
      default: null,
    },
    longitude: {
      type: Number,
      default: null,
    },
    // ---- Room location identity (rooms only; set by the server from validated coordinates, never from photos) ----
    // locationKey: deterministic spatial-cell key of the stored GPS point (see utils/roomLocation.js).
    // locationClaimKey: equals locationKey for as long as the room record exists (active, hidden, draft, or closed/rented -
    //   a rented room still physically occupies its spot). A unique index on it is the database-level guarantee that two
    //   rooms cannot claim the same cell. Deleting the room frees the spot.
    locationKey: { type: String, default: undefined },
    locationClaimKey: { type: String, default: undefined },
    locationSource: { type: String, enum: ["gps", "manual"], default: undefined },
    locationAccuracyM: { type: Number, default: undefined, min: 0 },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: undefined,
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: undefined,
      },
    },
    status: {
      type: String,
      enum: ["active", "closed", "draft", "hidden"],
      default: "active",
      index: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Public identifiers for room listings (set by the server only). Private data
    // (full address, photo hashes, availability) lives in the Property and Room models.
    roomCode: { type: String, default: undefined },
    propertyCode: { type: String, default: undefined },
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
      index: true,
    },
    reviewsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    photos: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    videos: {
      type: [
        {
          url: { type: String, required: true },
          name: { type: String, default: "" },
          size: { type: Number, default: 0 },
        },
      ],
      default: [],
    },

    // Category 1: Room Rent
    roomDetails: {
      rent: { type: Number, min: 0 },
      deposit: { type: Number, min: 0, default: 0 },
      maintenance: { type: Number, min: 0, default: 0 },
      availableFrom: { type: Date, default: null },
      roomType: {
        type: String,
        enum: ["Single", "1RK", "1BHK", "2BHK", "Shared", "PG", "Other"],
        default: "Single",
      },
      period: { type: String, default: "month" },
      amenities: { type: [String], default: [] },
      verified: { type: Boolean, default: false },
      availabilityConfirmedAt: { type: Date, default: Date.now },
    },

    // Category 2: Vehicle Rent
    vehicleDetails: {
      vehicleType: {
        type: String,
        enum: ["Scooty", "Bike", "Car", "Other"],
        default: "Bike",
      },
      rentalPrice: { type: Number, min: 0 },
      pricingPeriod: { type: String, default: "hour" },
      available: { type: Boolean, default: true },
      // Compulsory for every vehicle. Stored normalised (UPPERCASE, no spaces) and kept
      // for as long as the listing exists, even while the vehicle is booked, so the same
      // vehicle can never be listed a second time.
      plateNumber: { type: String, default: undefined, trim: true, uppercase: true },
      // true = vehicle is currently rented out; hidden from the public list until the owner clicks Unbook.
      booked: { type: Boolean, default: false },
      bookedAt: { type: Date, default: null },
    },

    // Category 3: Lost & Found
    lostFoundDetails: {
      kind: {
        type: String,
        enum: ["lost", "found"],
        default: "found",
      },
      category: {
        type: String,
        default: "Other",
      },
      itemName: { type: String, trim: true },
      description: { type: String, default: "" },
      where: { type: String, default: "" },
      incidentDate: { type: Date, default: Date.now },
      contactPhone: { type: String, default: "" },
      reward: { type: String, default: "" },
      isUrgent: { type: Boolean, default: false },
      alertBroadcastId: { type: mongoose.Schema.Types.ObjectId, ref: "Listing" },
    },

    // Category 4: Civil Help / Local Services
    serviceDetails: {
      serviceCategory: {
        type: String,
        enum: ["Electrician", "Mechanic", "Plumber", "Notes", "Other"],
        default: "Other",
      },
      pricingInfo: { type: String, default: "Contact for quote" },
      shopPhoto: { type: String, default: "", trim: true },
      rating: { type: Number, default: 5.0, min: 1, max: 5 },
      jobsCount: { type: Number, default: 0, min: 0 },
      available: { type: Boolean, default: true },
    },

    // Category 5: Local Alerts / Emergency
    alertDetails: {
      alertType: {
        type: String,
        enum: ["Stuck", "Medical", "Blood", "Safety", "Other"],
        default: "Stuck",
      },
      helpersCount: { type: Number, default: 0, min: 0 },
    },
  },
  {
    timestamps: true,
  }
);

// Compound and geospatial indexes for fast retrieval
listingSchema.index({ type: 1, createdAt: -1 });
listingSchema.index({ type: 1, status: 1 });
listingSchema.index({ location: "2dsphere" });
listingSchema.index({ latitude: 1, longitude: 1 });
// Room location identity: fast neighbour-cell lookups + a DB-level "one room per cell" guarantee.
// (Rooms in adjacent cells that are still inside the duplicate radius are caught by the guarded Haversine check.)
listingSchema.index({ type: 1, locationKey: 1 });
listingSchema.index(
  { locationClaimKey: 1 },
  { unique: true, partialFilterExpression: { locationClaimKey: { $type: "string" } }, name: "unique_room_location_claim" }
);
// The claim always mirrors the key, so status changes made with plain updateOne() (bookings, suspensions) can never desync it.
listingSchema.pre("validate", function () {
  if (this.type !== "room") return;
  this.locationClaimKey = this.locationKey || undefined;
});
// One number plate = one vehicle listing, platform-wide (enforced by the database, not just the UI).
listingSchema.index(
  { "vehicleDetails.plateNumber": 1 },
  {
    unique: true,
    partialFilterExpression: { type: "vehicle", "vehicleDetails.plateNumber": { $type: "string" } },
  }
);

listingSchema.methods.toFormattedJSON = function (options = {}) {
  const isLegacyDefaultLocation =
    (this.latitude === 28.6139 && this.longitude === 77.209) ||
    (this.location?.coordinates?.[0] === 77.209 && this.location?.coordinates?.[1] === 28.6139);
  const latitude = isLegacyDefaultLocation ? null : this.latitude;
  const longitude = isLegacyDefaultLocation ? null : this.longitude;
  const publicLatitude = latitude == null ? null : Number(latitude.toFixed(2));
  const publicLongitude = longitude == null ? null : Number(longitude.toFixed(2));

  return {
    id: this._id.toString(),
    ownerId: this.ownerId.toString(),
    ownerName: this.ownerName,
    type: this.type,
    title: this.title,
    description: this.description,
    locality: this.locality,
    latitude: publicLatitude,
    longitude: publicLongitude,
    location: publicLatitude == null || publicLongitude == null
      ? null
      : { type: "Point", coordinates: [publicLongitude, publicLatitude] },
    status: this.status,
    // System-generated address IDs are PRIVATE: only an administrator ever receives them.
    ...(options.includeIds ? { roomCode: this.roomCode, propertyCode: this.propertyCode } : {}),
    photos: this.photos,
    videos: this.videos,
    roomDetails: this.roomDetails,
    vehicleDetails: this.vehicleDetails,
    lostFoundDetails: this.lostFoundDetails,
    serviceDetails: this.serviceDetails,
    alertDetails: this.alertDetails,
    averageRating: this.averageRating || 0,
    reviewsCount: this.reviewsCount || 0,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const Listing = mongoose.model("Listing", listingSchema);
