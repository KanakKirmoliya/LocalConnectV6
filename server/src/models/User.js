import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

// Public User ID generator (USR-XXXXXXXX): random, non-sequential, Crockford base32 (no I, L, O, U).
const USER_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
async function generateUniqueUserCode(exists) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const bytes = crypto.randomBytes(8);
    let code = "USR-";
    for (let i = 0; i < 8; i += 1) code += USER_CODE_ALPHABET[bytes[i] % USER_CODE_ALPHABET.length];
    if (!(await exists(code))) return code;
  }
  throw new Error("Could not generate a unique user ID. Please retry.");
}

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email address"],
      index: true,
    },
    passwordHash: {
      type: String,
      required: [true, "Password is required"],
    },
    area: {
      type: String,
      default: "",
      trim: true,
    },
    phone: {
      type: String,
      default: "",
      trim: true,
    },
    // Profile photo (a /uploads/listings/... URL) and short public bio.
    avatar: { type: String, default: "", trim: true },
    bio: { type: String, default: "", trim: true, maxlength: 300 },
    // Saved map centre (set from the profile screen via GPS or by typing a locality).
    coordinates: {
      lat: { type: Number, default: undefined },
      lng: { type: Number, default: undefined },
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    isBanned: {
      type: Boolean,
      default: false,
      index: true,
    },
    banReason: {
      type: String,
      default: "",
      trim: true,
    },
    suspensionStatus: {
      type: String,
      enum: ["none", "temporary", "permanent"],
      default: "none",
      index: true,
    },
    suspendedUntil: {
      type: Date,
      default: null,
    },
    reportCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Auto-generated public User ID (USR-XXXXXXXX). Never client-supplied.
    userCode: {
      type: String,
      default: undefined,
    },
    // Owner identity verification. Only administrators can set this to "verified".
    identity: {
      status: {
        type: String,
        enum: ["unverified", "pending", "verified", "rejected"],
        default: "unverified",
      },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: undefined },
      reviewedAt: { type: Date, default: undefined },
      verifiedAt: { type: Date, default: undefined },
      note: { type: String, default: "" },
    },
  },
  {
    timestamps: true,
  }
);

// Unique only when present, so users created before this feature (no userCode yet) do not collide.
userSchema.index({ userCode: 1 }, { unique: true, partialFilterExpression: { userCode: { $type: "string" } } });

// Every new user automatically receives a unique User ID.
userSchema.pre("validate", async function () {
  if (this.isNew && !this.userCode) {
    this.userCode = await generateUniqueUserCode((code) => User.exists({ userCode: code }));
  }
});

// Assigns a User ID to a user created before this feature existed (idempotent, skips validation).
userSchema.methods.ensureUserCode = async function () {
  if (this.userCode) return this.userCode;
  const code = await generateUniqueUserCode((candidate) => User.exists({ userCode: candidate }));
  const res = await User.updateOne(
    { _id: this._id, $or: [{ userCode: { $exists: false } }, { userCode: null }, { userCode: "" }] },
    { $set: { userCode: code } }
  );
  if (res.modifiedCount === 1) {
    this.userCode = code;
    return code;
  }
  const fresh = await User.findById(this._id).select("userCode");
  this.userCode = fresh?.userCode;
  return this.userCode;
};

// Method to verify candidate password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

// Method to check suspension status and auto-lift expired temporary suspensions
userSchema.methods.isSuspended = function () {
  if (!this.isBanned && this.suspensionStatus === "none") {
    return { suspended: false };
  }

  // Check if temporary suspension period has passed
  if (this.suspensionStatus === "temporary" && this.suspendedUntil) {
    if (new Date() >= new Date(this.suspendedUntil)) {
      // Auto-lift expired temporary suspension
      this.isBanned = false;
      this.suspensionStatus = "none";
      this.suspendedUntil = null;
      this.banReason = "";
      this.save().catch(() => {});
      return { suspended: false };
    }
    return {
      suspended: true,
      type: "temporary",
      until: this.suspendedUntil,
      reason: this.banReason || "Account temporarily suspended due to community fraud/misuse reports.",
    };
  }

  return {
    suspended: true,
    type: "permanent",
    until: null,
    reason: this.banReason || "Account permanently suspended by administration.",
  };
};

// Method to return safe public object
userSchema.methods.toPublicJSON = function () {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    phone: this.phone || "",
    area: this.area,
    avatar: this.avatar || "",
    bio: this.bio || "",
    coordinates:
      typeof this.coordinates?.lat === "number" && typeof this.coordinates?.lng === "number"
        ? { lat: this.coordinates.lat, lng: this.coordinates.lng }
        : null,
    role: this.role,
    isBanned: this.isBanned || false,
    banReason: this.banReason || "",
    suspensionStatus: this.suspensionStatus || "none",
    suspendedUntil: this.suspendedUntil || null,
    reportCount: this.reportCount || 0,
    userCode: this.userCode || null,
    identityStatus: this.identity?.status || "unverified",
    createdAt: this.createdAt,
  };
};

// What OTHER members may see: no email, phone, ban state or role.
userSchema.methods.toPeerJSON = function () {
  return {
    id: this._id.toString(),
    name: this.name,
    avatar: this.avatar || "",
    bio: this.bio || "",
    area: this.area || "",
    userCode: this.userCode || null,
    identityStatus: this.identity?.status || "unverified",
    memberSince: this.createdAt,
  };
};

export const User = mongoose.model("User", userSchema);
