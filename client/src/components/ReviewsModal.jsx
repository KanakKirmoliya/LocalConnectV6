import { useState, useEffect } from "react";
import { Star, Trash2, CheckCircle2, MessageSquare, AlertCircle } from "lucide-react";
import { Modal, Field, Empty } from "./ui.jsx";
import UserLink from "./UserLink.jsx";
import { notifyRatingsChanged } from "./StarRating.jsx";
import { getFull, post, del } from "../api.js";
import { useStore } from "../store.jsx";

const STAR_LABELS = {
  1: "Poor (1 / 5)",
  2: "Fair (2 / 5)",
  3: "Average (3 / 5)",
  4: "Very Good (4 / 5)",
  5: "Excellent (5 / 5)",
};

export default function ReviewsModal({ listing, onClose, onReviewUpdated }) {
  const { user, notify } = useStore();
  const listingId = listing.id || listing._id;
  const isOwner = user && (listing.ownerId === user.id || listing.ownerId === user._id || listing.owner === user.name);

  const [reviews, setReviews] = useState([]);
  const [stats, setStats] = useState({ averageRating: 0, totalReviews: 0, distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } });
  const [loading, setLoading] = useState(true);

  // Form state
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [myReviewId, setMyReviewId] = useState(null);

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const res = await getFull("reviews", { listingId });
      const list = Array.isArray(res) ? res : res.data || [];
      // Prefer the server's stats; otherwise work them out from the reviews themselves (never show 0.0 for rated listings).
      let reviewStats = res.stats;
      if (!reviewStats) {
        const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        let sum = 0;
        for (const r of list) {
          const n = Math.min(5, Math.max(1, Math.round(r.rating)));
          distribution[n] += 1;
          sum += Number(r.rating) || 0;
        }
        reviewStats = {
          averageRating: list.length ? Math.round((sum / list.length) * 10) / 10 : 0,
          totalReviews: list.length,
          distribution,
        };
      }

      setReviews(list);
      setStats(reviewStats);
      return reviewStats;

      // Check if logged in user already left a review
      if (user) {
        const found = list.find((r) => r.userId === user.id || r.userId === user._id);
        if (found) {
          setMyReviewId(found.id || found._id);
          setRating(found.rating);
          setComment(found.comment);
        }
      }
    } catch (err) {
      console.error("Failed to load reviews:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, [listingId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!comment.trim() || comment.trim().length < 3) {
      setFormError("Please enter at least 3 characters for your review.");
      return;
    }

    setSubmitting(true);
    setFormError("");
    try {
      const res = await post("reviews", {
        listingId,
        rating,
        comment: comment.trim(),
      });

      notify(myReviewId ? "Your review has been updated." : "Thank you! Your review has been posted.");
      notifyRatingsChanged({ listingId: listing?.id || listing?._id });
      const fresh = await fetchReviews();
      if (onReviewUpdated && fresh) onReviewUpdated(fresh);
    } catch (err) {
      setFormError(err.message || "Failed to submit review.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteReview = async () => {
    if (!myReviewId) return;
    if (!window.confirm("Are you sure you want to delete your review?")) return;

    try {
      setSubmitting(true);
      const res = await del("reviews", myReviewId);
      notify("Your review has been removed.");
      setMyReviewId(null);
      setComment("");
      setRating(5);
      notifyRatingsChanged({ listingId: listing?.id || listing?._id });
      const fresh = await fetchReviews();
      if (onReviewUpdated && fresh) onReviewUpdated(fresh);
    } catch (err) {
      notify(err.message || "Failed to delete review.");
    } finally {
      setSubmitting(false);
    }
  };

  const total = stats.totalReviews || 0;
  const avg = stats.averageRating ? stats.averageRating.toFixed(1) : "0.0";
  const activeRating = hoverRating || rating;

  return (
    <Modal title={`Reviews & Ratings · ${listing.title || listing.name}`} onClose={onClose}>
      <div style={{ display: "grid", gap: 16 }}>
        {/* Listing Context Info */}
        <div style={{ fontSize: "0.85rem", color: "var(--mute)", borderBottom: "1px solid var(--line)", paddingBottom: 10 }}>
          <span>📍 {listing.locality || "Local Area"}</span>
          <span style={{ margin: "0 8px" }}>·</span>
          <span>Listed by <strong><UserLink id={listing.ownerId} name={listing.owner || listing.ownerName || "Neighbor"} /></strong></span>
        </div>

        {/* Rating Scorecard Banner */}
        <div
          style={{
            background: "#F8FAFC",
            border: "1px solid #E2E8F0",
            borderRadius: 12,
            padding: "16px 18px",
            display: "grid",
            gridTemplateColumns: "130px 1fr",
            gap: 16,
            alignItems: "center",
          }}
        >
          {/* Big Score */}
          <div style={{ textAlign: "center", borderRight: "1px solid #E2E8F0", paddingRight: 12 }}>
            <div style={{ fontSize: "2.4rem", fontWeight: 800, fontFamily: "var(--display)", color: "#1E293B", lineHeight: 1 }}>
              {total > 0 ? avg : "New"}
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 2, margin: "6px 0 4px" }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  size={16}
                  fill={star <= Math.round(stats.averageRating || 0) ? "#F59E0B" : "none"}
                  color="#F59E0B"
                />
              ))}
            </div>
            <small style={{ color: "var(--mute)", fontSize: "0.78rem" }}>
              {total} {total === 1 ? "review" : "reviews"}
            </small>
          </div>

          {/* Star Distribution Breakdown */}
          <div style={{ display: "grid", gap: 4 }}>
            {[5, 4, 3, 2, 1].map((star) => {
              const count = stats.distribution?.[star] || 0;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={star} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.75rem" }}>
                  <span style={{ width: 22, textAlign: "right", color: "var(--mute)" }}>{star}★</span>
                  <div style={{ flex: 1, height: 7, background: "#E2E8F0", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: "#F59E0B", borderRadius: 999 }} />
                  </div>
                  <span style={{ width: 28, textAlign: "right", color: "var(--mute)", fontVariantNumeric: "tabular-nums" }}>
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Write / Edit Review Section */}
        {isOwner ? (
          <div
            style={{
              background: "#F1F5F9",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: "0.82rem",
              color: "#475569",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <AlertCircle size={16} color="#64748B" />
            <span>You are the owner of this listing. Reviews are written by community neighbors.</span>
          </div>
        ) : user ? (
          <form
            onSubmit={handleSubmit}
            style={{
              background: "#FFFFFF",
              border: "1.5px solid var(--line)",
              borderRadius: 12,
              padding: "14px 16px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <strong style={{ fontSize: "0.92rem" }}>
                {myReviewId ? "Update Your Review" : "Leave a Rating & Review"}
              </strong>
              {myReviewId && (
                <button
                  type="button"
                  onClick={handleDeleteReview}
                  className="btn"
                  style={{ padding: "2px 8px", fontSize: "0.75rem", color: "#DC2626", borderColor: "#FCA5A5" }}
                  disabled={submitting}
                >
                  <Trash2 size={12} style={{ marginRight: 3 }} /> Delete Review
                </button>
              )}
            </div>

            {/* Interactive 5-Star Selector */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    style={{
                      background: "none",
                      border: "none",
                      padding: "2px 4px",
                      cursor: "pointer",
                      transition: "transform 0.1s ease",
                    }}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => setRating(star)}
                    aria-label={`Rate ${star} star`}
                  >
                    <Star
                      size={24}
                      fill={star <= activeRating ? "#F59E0B" : "none"}
                      color={star <= activeRating ? "#F59E0B" : "#CBD5E1"}
                    />
                  </button>
                ))}
                <span style={{ marginLeft: 8, fontSize: "0.82rem", fontWeight: 700, color: "#D97706" }}>
                  {STAR_LABELS[activeRating] || `${activeRating} Stars`}
                </span>
              </div>
            </div>

            <Field label="Your Experience & Feedback">
              <textarea
                rows={3}
                placeholder="Share your experience (e.g. cleanliness, pricing fairness, communication, punctuality)..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                style={{ fontSize: "0.85rem" }}
              />
            </Field>

            {formError && <p className="form-error" role="alert">{formError}</p>}

            <button
              type="submit"
              className="btn primary"
              style={{ marginTop: 10, width: "100%", fontSize: "0.88rem" }}
              disabled={submitting || !comment.trim()}
            >
              {submitting ? "Saving..." : myReviewId ? "Update Review" : "Publish Review"}
            </button>
          </form>
        ) : null}

        {/* Reviews List */}
        <div>
          <h4 style={{ margin: "10px 0 12px", fontSize: "0.95rem" }}>
            Community Feedback ({reviews.length})
          </h4>

          {loading ? (
            <p className="meta" style={{ textAlign: "center", padding: 16 }}>Loading neighbor reviews...</p>
          ) : reviews.length === 0 ? (
            <Empty text="No reviews yet for this listing. Be the first neighbor to share your honest review!" />
          ) : (
            <div style={{ display: "grid", gap: 10, maxHeight: 320, overflowY: "auto", paddingRight: 4 }}>
              {reviews.map((rev) => {
                const isMine = user && (rev.userId === user.id || rev.userId === user._id);
                const initials = (rev.userName || "U")
                  .split(" ")
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase();

                return (
                  <div
                    key={rev.id || rev._id}
                    style={{
                      background: isMine ? "#EFF6FF" : "#F8FAFC",
                      border: isMine ? "1.5px solid #BFDBFE" : "1px solid #E2E8F0",
                      borderRadius: 10,
                      padding: "12px 14px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            background: isMine ? "#2563EB" : "#475569",
                            color: "#FFFFFF",
                            display: "grid",
                            placeItems: "center",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                          }}
                        >
                          {initials}
                        </span>
                        <div>
                          <strong style={{ fontSize: "0.88rem" }}>
                            {rev.userName} {isMine && <span style={{ fontSize: "0.72rem", color: "#2563EB" }}>(You)</span>}
                          </strong>
                          {rev.userArea && (
                            <small style={{ display: "block", color: "var(--mute)", fontSize: "0.75rem" }}>
                              📍 {rev.userArea}
                            </small>
                          )}
                        </div>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 1 }}>
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              size={13}
                              fill={star <= rev.rating ? "#F59E0B" : "none"}
                              color="#F59E0B"
                            />
                          ))}
                        </div>
                        <small style={{ color: "var(--mute)", fontSize: "0.72rem" }}>
                          {new Date(rev.createdAt).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}
                        </small>
                      </div>
                    </div>

                    <p style={{ margin: "8px 0 0", fontSize: "0.85rem", color: "#334155", lineHeight: 1.45 }}>
                      "{rev.comment}"
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

