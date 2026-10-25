import mongoose from "mongoose";

const reportSchema = new mongoose.Schema(
  {
    reporterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    reporterName: {
      type: String,
      required: true,
      trim: true,
    },
    targetType: {
      type: String,
      enum: ["listing", "user"],
      required: true,
      index: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    reportedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    targetTitle: {
      type: String,
      default: "",
      trim: true,
    },
    reason: {
      type: String,
      enum: ["fake", "duplicate", "misleading", "expired", "inappropriate", "scam", "harassment", "misuse", "commercial_spam", "other"],
      required: true,
    },
    details: {
      type: String,
      default: "",
      trim: true,
      maxlength: [1000, "Details cannot exceed 1000 characters"],
    },
    status: {
      type: String,
      enum: ["pending", "reviewed", "dismissed", "action_taken"],
      default: "pending",
      index: true,
    },
    autoSuspensionTriggered: {
      type: String,
      enum: ["none", "temporary", "permanent"],
      default: "none",
    },
    moderationAction: {
      type: String,
      enum: ["none", "listing_hidden", "listing_deleted", "user_warned", "user_suspended_temp", "user_banned", "suspension_lifted"],
      default: "none",
    },
    moderatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    moderatorName: {
      type: String,
      default: "",
    },
    moderationNotes: {
      type: String,
      default: "",
      trim: true,
    },
    reviewedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

reportSchema.index({ reporterId: 1, targetId: 1, createdAt: 1 });
reportSchema.index({ reportedUserId: 1, status: 1 });

export const Report = mongoose.model("Report", reportSchema);
