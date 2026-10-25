import mongoose from "mongoose";

const requestSchema = new mongoose.Schema(
  {
    listingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Listing",
      required: [true, "Listing ID is required"],
      index: true,
    },
    listingTitle: {
      type: String,
      required: true,
      trim: true,
    },
    listingType: {
      type: String,
      enum: ["room", "vehicle", "lost_found", "service", "alert"],
    },
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Buyer ID is required"],
      index: true,
    },
    buyerName: {
      type: String,
      required: true,
      trim: true,
    },
    buyerEmail: {
      type: String,
      default: "",
    },
    buyerPhone: {
      type: String,
      default: "",
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Seller ID is required"],
      index: true,
    },
    sellerEmail: {
      type: String,
      default: "",
    },
    sellerPhone: {
      type: String,
      default: "",
    },
    message: {
      type: String,
      default: "Hi, I am interested in this listing. Is it still available?",
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined"],
      default: "pending",
      index: true,
    },
    buyerLastReadAt: {
      type: Date,
      default: () => new Date(0),
    },
    sellerLastReadAt: {
      type: Date,
      default: () => new Date(0),
    },
    messages: {
      type: [
        {
          senderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
          },
          senderName: {
            type: String,
            required: true,
          },
          text: {
            type: String,
            required: true,
            trim: true,
          },
          createdAt: {
            type: Date,
            default: Date.now,
          },
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

export const Request = mongoose.model("Request", requestSchema);
