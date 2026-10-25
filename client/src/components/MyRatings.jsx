import { useCallback, useEffect, useState } from "react";
import { Flag, ThumbsUp, ThumbsDown } from "lucide-react";
import { Stars, StarInput, RatingBreakdown, TagPicker, ratingLabel, OverallRating, overallOf, normalizeSummary, notifyRatingsChanged, useRatingsChanged } from "./StarRating.jsx";
import ReportModal from "./ReportModal.jsx";
import UserLink from "./UserLink.jsx";
import { getMyRatings, rateUser } from "../api.js";

/**
 * "My ratings" section of the profile screen.
 *  - the star rating customers gave me as a service provider, and the one providers gave me as a customer
 *  - people I have an accepted request with: I can rate them (stars, quick tags, would-deal-again, comment) or report them
 */
export default function MyRatings({ notify }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState({}); // requestId -> { rating, comment, tags, recommend }
  const [busyId, setBusyId] = useState("");
  const [reporting, setReporting] = useState(null);

  const load = async () => {
    try {
      setData(await getMyRatings());
      setError("");
    } catch (err) {
      setError(err.message || "Could not load ratings.");
    }
  };
  useEffect(() => { load(); }, []);
  useRatingsChanged(useCallback(() => { load(); }, []));

  const patchDraft = (id, change) => setDraft((p) => ({ ...p, [id]: { ...p[id], ...change } }));

  const submit = async (row) => {
    const d = draft[row.requestId] || {};
    const rating = d.rating ?? row.myRating;
    if (!rating) return notify?.("Choose 1 to 5 stars first.");
    const recommend = d.recommend !== undefined ? d.recommend : row.myRecommend;
    try {
      setBusyId(row.requestId);
      const result = await rateUser({
        requestId: row.requestId,
        rating,
        comment: d.comment ?? row.myComment ?? "",
        tags: d.tags ?? row.myTags ?? [],
        wouldRecommend: typeof recommend === "boolean" ? recommend : undefined,
      });
      notify?.(`Thanks! Your rating for ${row.otherName} was saved.`);
      setDraft((prev) => { const next = { ...prev }; delete next[row.requestId]; return next; });
      // Tell every open rating display (profiles, listing cards) to reload from the server.
      notifyRatingsChanged({ ratedUserId: result?.ratedUserId || row.otherId });
      await load();
    } catch (err) {
      notify?.(err.message || "Could not save rating.");
    } finally {
      setBusyId("");
    }
  };

  if (error) return <p className="meta">{error}</p>;
  if (!data) return <p className="meta">Loading your ratings…</p>;

  const tagOptions = data.tagOptions || { provider: [], customer: [] };

  return (
    <section className="ratings-section">
      <div className="overall-banner">
        <span className="rating-title">My overall rating</span>
        <OverallRating summary={overallOf(data)} size={18} />
      </div>
      <div className="rating-pair">
        <RatingBreakdown title="As a service provider / owner" summary={normalizeSummary(data.asProvider)} />
        <RatingBreakdown title="As a customer / tenant" summary={normalizeSummary(data.asCustomer)} />
      </div>

      {data.received.length > 0 && (
        <details className="soft-details">
          <summary>Latest ratings I received ({data.received.length})</summary>
          <div className="review-list">
            {data.received.map((r) => (
              <div key={r.id} className="review-line">
                <div className="review-line-head">
                  <Stars value={r.rating} showNumber={false} size={13} />
                  <strong>{r.fromName}</strong>
                  <span className="meta">{r.direction === "customer_to_provider" ? "as provider" : "as customer"}{r.listingTitle ? ` · ${r.listingTitle}` : ""}</span>
                </div>
                {r.comment && <p>{r.comment}</p>}
                {r.tags?.length > 0 && <div className="rating-tags">{r.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>}
              </div>
            ))}
          </div>
        </details>
      )}

      <h4 className="section-sub">Rate people you dealt with</h4>
      {data.canRate.length === 0 && (
        <p className="meta">Once a request is accepted you can rate the other person here.</p>
      )}
      {data.canRate.map((row) => {
        const d = draft[row.requestId] || {};
        const current = d.rating ?? row.myRating ?? 0;
        const tags = d.tags ?? row.myTags ?? [];
        const recommend = d.recommend !== undefined ? d.recommend : row.myRecommend;
        const options = row.ratingTarget === "provider" ? tagOptions.provider : tagOptions.customer;
        return (
          <div key={row.requestId} className="rate-card">
            <div className="rate-card-head">
              <UserLink id={row.otherId} name={row.otherName} />
              <span className="meta">{row.ratingTarget === "provider" ? "service provider" : "customer"}{row.listingTitle ? ` · ${row.listingTitle}` : ""}</span>
            </div>
            <div className="rate-stars">
              <StarInput value={current} onChange={(rating) => patchDraft(row.requestId, { rating })} />
              {current > 0 && <span className="rate-label">{ratingLabel(current)}</span>}
            </div>
            {current > 0 && (
              <>
                <TagPicker options={options} value={tags} onChange={(t) => patchDraft(row.requestId, { tags: t })} />
                <div className="recommend-row" role="group" aria-label="Would you deal with them again?">
                  <span>Would you deal with them again?</span>
                  <button type="button" className={recommend === true ? "pick on" : "pick"} aria-pressed={recommend === true} onClick={() => patchDraft(row.requestId, { recommend: recommend === true ? null : true })}>
                    <ThumbsUp size={13} /> Yes
                  </button>
                  <button type="button" className={recommend === false ? "pick on bad" : "pick"} aria-pressed={recommend === false} onClick={() => patchDraft(row.requestId, { recommend: recommend === false ? null : false })}>
                    <ThumbsDown size={13} /> No
                  </button>
                </div>
              </>
            )}
            <input
              value={d.comment ?? row.myComment ?? ""}
              maxLength={500}
              placeholder="Add a short comment (optional)"
              onChange={(e) => patchDraft(row.requestId, { comment: e.target.value })}
            />
            <div className="rate-actions">
              <button className="btn primary" disabled={!current || busyId === row.requestId} onClick={() => submit(row)}>
                {row.myRating ? "Update rating" : "Submit rating"}
              </button>
              <button
                className="btn ghost"
                onClick={() => setReporting({ id: row.otherId, _id: row.otherId, name: row.otherName, title: row.otherName })}
              >
                <Flag size={12} /> Report {row.ratingTarget === "customer" ? "customer" : "provider"}
              </button>
            </div>
          </div>
        );
      })}

      {reporting && <ReportModal target={reporting} targetType="user" onClose={() => setReporting(null)} />}
    </section>
  );
}
