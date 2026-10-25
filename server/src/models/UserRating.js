import mongoose from "mongoose";
import { Review } from "./Review.js";
import { Listing } from "./Listing.js";
import { buildRatingSummary } from "../utils/ratingSummary.js";

/**
 * Person-to-person star rating (1-5) that builds a user's account rating.
 *
 *  customer_to_provider : the buyer / customer rates the service provider (listing owner)
 *  provider_to_customer : the service provider rates the customer
 *
 * A rating can only be given for a real interaction: an ACCEPTED request between the two people.
 * One rating per direction per request (it can be edited, never duplicated).
 */
const userRatingSchema = new mongoose.Schema(
  {
    raterId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    raterName: { type: String, required: true, trim: true },
    ratedUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    direction: { type: String, enum: ["customer_to_provider", "provider_to_customer"], required: true, index: true },
    requestId: { type: mongoose.Schema.Types.ObjectId, ref: "Request", required: true, index: true },
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", default: undefined },
    listingTitle: { type: String, default: "", trim: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: "", trim: true, maxlength: 500 },
    // Quick labels the rater picked (see RATING_TAGS). Unknown tags are dropped by the route.
    tags: { type: [String], default: [] },
    // Would the rater deal with this person again?
    wouldRecommend: { type: Boolean, default: undefined },
  },
  { timestamps: true }
);

// One rating per person, per request, per direction.
userRatingSchema.index({ raterId: 1, requestId: 1, direction: 1 }, { unique: true });

export const UserRating = mongoose.model("UserRating", userRatingSchema);

/** Quick labels a rater can attach, split by who is being rated. */
export const RATING_TAGS = {
  provider: ["Responsive", "Honest", "Fair price", "Clean & as described", "On time", "Helpful"],
  customer: ["Polite", "Paid on time", "Respectful", "Clear communication", "Took good care", "Easy to deal with"],
};
export const ALL_RATING_TAGS = [...RATING_TAGS.provider, ...RATING_TAGS.customer];

export { buildRatingSummary };

const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));

/**
 * Everything a user has RECEIVED, as raw rows:
 *   - person-to-person ratings (UserRating): customer_to_provider counts as "provider", provider_to_customer as "customer"
 *   - star reviews written on listings the user owns (Review): these also count as "provider" ratings
 * One source of truth in MongoDB; nothing is cached on the user.
 */
async function receivedRows(userIds) {
  const ids = userIds.map(toObjectId);
  const [personRows, owned] = await Promise.all([
    UserRating.find({ ratedUserId: { $in: ids } }).select("ratedUserId direction rating tags wouldRecommend").lean(),
    Listing.find({ ownerId: { $in: ids } }).select("_id ownerId").lean(),
  ]);
  const ownerOf = new Map(owned.map((l) => [String(l._id), String(l.ownerId)]));
  const reviewRows = ownerOf.size
    ? await Review.find({ listingId: { $in: [...ownerOf.keys()].map(toObjectId) } }).select("listingId rating").lean()
    : [];

  const byUser = new Map(userIds.map((id) => [String(id), { provider: [], customer: [] }]));
  for (const r of personRows) {
    const bucket = byUser.get(String(r.ratedUserId));
    if (bucket) bucket[r.direction === "customer_to_provider" ? "provider" : "customer"].push(r);
  }
  for (const r of reviewRows) {
    const bucket = byUser.get(ownerOf.get(String(r.listingId)));
    if (bucket) bucket.provider.push({ rating: r.rating });
  }
  return byUser;
}

const summaryOf = ({ provider, customer }) => ({
  overall: buildRatingSummary([...provider, ...customer]),
  asProvider: buildRatingSummary(provider),
  asCustomer: buildRatingSummary(customer),
});

/** { overall, asProvider, asCustomer } for ONE user, calculated from the same rows. */
export async function getRatingOverview(userId) {
  const byUser = await receivedRows([userId]);
  return summaryOf(byUser.get(String(userId)));
}

/** Map<userId, {average, count}> of the provider-side rating for many users (listing cards). Same calculation. */
export async function getProviderSummaries(userIds = []) {
  const ids = [...new Set(userIds.map(String))];
  const out = new Map();
  if (!ids.length) return out;
  const byUser = await receivedRows(ids);
  for (const [id, rows] of byUser) {
    const s = buildRatingSummary(rows.provider);
    out.set(id, { average: s.average, count: s.count });
  }
  return out;
}

/**
 * Summary of what a user has received. direction: "customer_to_provider" (as provider),
 * "provider_to_customer" (as customer), or omitted for the overall weighted summary.
 */
export async function summarizeRatings(userId, direction = null) {
  const o = await getRatingOverview(userId);
  if (direction === "customer_to_provider") return o.asProvider;
  if (direction === "provider_to_customer") return o.asCustomer;
  return o.overall;
}
