import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    listingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Listing",
      required: [true, "Listing ID is required"],
      index: true,
    },
    listingType: {
      type: String,
      enum: ["room", "vehicle", "service", "lost_found", "alert"],
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
      index: true,
    },
    userName: {
      type: String,
      required: [true, "User name is required"],
      trim: true,
    },
    userArea: {
      type: String,
      default: "",
      trim: true,
    },
    rating: {
      type: Number,
      required: [true, "Rating is required"],
      min: [1, "Rating must be at least 1 star"],
      max: [5, "Rating cannot exceed 5 stars"],
    },
    comment: {
      type: String,
      required: [true, "Review comment is required"],
      trim: true,
      minlength: [3, "Comment must be at least 3 characters"],
      maxlength: [1000, "Comment cannot exceed 1000 characters"],
    },
  },
  {
    timestamps: true,
  }
);

// Enforce one review per user per listing
reviewSchema.index({ listingId: 1, userId: 1 }, { unique: true });

export const Review = mongoose.model("Review", reviewSchema);

