import { useEffect } from "react";
import { useState } from "react";
import { Star } from "lucide-react";

const GOLD = "#F59E0B";

/** Read-only stars (supports halves) with an optional "4.5 (12)" label. */
export function Stars({ value = 0, count = null, size = 14, showNumber = true }) {
  const v = Math.max(0, Math.min(5, Number(value) || 0));
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }} aria-label={`${v.toFixed(1)} out of 5 stars`}>
      <span style={{ display: "inline-flex" }}>
        {[1, 2, 3, 4, 5].map((i) => {
          const fill = Math.max(0, Math.min(1, v - (i - 1)));
          return (
            <span key={i} style={{ position: "relative", width: size, height: size, display: "inline-block" }}>
              <Star size={size} color={GOLD} style={{ position: "absolute", inset: 0 }} />
              <span style={{ position: "absolute", inset: 0, width: `${fill * 100}%`, overflow: "hidden" }}>
                <Star size={size} color={GOLD} fill={GOLD} />
              </span>
            </span>
          );
        })}
      </span>
      {showNumber && (
        <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#92400E" }}>
          {v > 0 ? v.toFixed(1) : "No ratings"}
          {count != null && v > 0 && <span style={{ fontWeight: 400, color: "var(--mute)" }}> ({count})</span>}
        </span>
      )}
    </span>
  );
}

/** Clickable 1-5 star picker. */
export function StarInput({ value = 0, onChange, size = 24 }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <span role="radiogroup" aria-label="Choose a star rating" style={{ display: "inline-flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={`${i} star${i > 1 ? "s" : ""}`}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(i)}
          style={{ background: "none", border: "none", padding: 2, cursor: "pointer", lineHeight: 0 }}
        >
          <Star size={size} color={GOLD} fill={i <= shown ? GOLD : "none"} />
        </button>
      ))}
    </span>
  );
}

/** Horizontal 5-4-3-2-1 bars plus average, count, top tags and "would recommend" share. */
export function RatingBreakdown({ summary, title }) {
  if (!summary) return null;
  const { average = 0, count = 0, distribution = {}, topTags = [], recommendPercent = null } = summary;
  if (!count) {
    return (
      <div className="rating-box empty">
        {title && <strong className="rating-title">{title}</strong>}
        <span className="meta">No ratings yet</span>
      </div>
    );
  }
  return (
    <div className="rating-box">
      {title && <strong className="rating-title">{title}</strong>}
      <div className="rating-grid">
        <div className="rating-score">
          <span className="rating-num">{Number(average).toFixed(1)}</span>
          <Stars value={average} showNumber={false} size={15} />
          <span className="meta">{count} rating{count === 1 ? "" : "s"}</span>
        </div>
        <div className="rating-bars">
          {[5, 4, 3, 2, 1].map((n) => {
            const c = distribution[n] || 0;
            return (
              <div key={n} className="rating-bar-row">
                <span>{n}</span>
                <div className="rating-bar"><i style={{ width: `${count ? (c / count) * 100 : 0}%` }} /></div>
                <span className="rating-bar-count">{c}</span>
              </div>
            );
          })}
        </div>
      </div>
      {(topTags.length > 0 || recommendPercent != null) && (
        <div className="rating-tags">
          {recommendPercent != null && <span className="tag good">{recommendPercent}% would deal again</span>}
          {topTags.map((t) => (
            <span key={t.tag} className="tag">{t.tag} · {t.count}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Multi-select tag pills used when giving a rating. */
export function TagPicker({ options = [], value = [], onChange, max = 4 }) {
  const toggle = (t) => {
    if (value.includes(t)) onChange(value.filter((x) => x !== t));
    else if (value.length < max) onChange([...value, t]);
  };
  return (
    <div className="tag-picker" role="group" aria-label="What went well?">
      {options.map((t) => (
        <button key={t} type="button" aria-pressed={value.includes(t)} className={value.includes(t) ? "pick on" : "pick"} onClick={() => toggle(t)}>
          {t}
        </button>
      ))}
    </div>
  );
}

const LABELS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];
export const ratingLabel = (n) => LABELS[n] || "";

/* ---------- shared rating helpers (profile header, cards, my ratings) ---------- */

/** Coerces any API summary into {average:number, count:int, ...}; missing fields never become a fake "0 stars" by accident. */
export function normalizeSummary(s) {
  const count = Number.isInteger(Number(s?.count)) ? Math.max(0, Number(s.count)) : 0;
  const average = Number(s?.average);
  return {
    ...(s || {}),
    count,
    average: count > 0 && Number.isFinite(average) ? average : 0,
    hasRatings: count > 0,
  };
}

/**
 * The profile's overall summary. Uses the backend's `overall` (the single authoritative calculation). If an older server
 * response lacks it, falls back to a WEIGHTED combination (total points / total ratings), never an average of two averages.
 */
export function overallOf(data) {
  if (data?.overall) return normalizeSummary(data.overall);
  const p = normalizeSummary(data?.asProvider);
  const c = normalizeSummary(data?.asCustomer);
  const count = p.count + c.count;
  return normalizeSummary({ count, average: count ? Math.round(((p.average * p.count + c.average * c.count) / count) * 10) / 10 : 0 });
}

/** Big "4.6/5 ★★★★★ 12 ratings" line, or an explicit "No ratings yet". */
export function OverallRating({ summary, size = 16 }) {
  const s = normalizeSummary(summary);
  if (!s.hasRatings) return <span className="overall-rating none">No ratings yet</span>;
  return (
    <span className="overall-rating" aria-label={`${s.average.toFixed(1)} out of 5 from ${s.count} ratings`}>
      <strong className="overall-num">{s.average.toFixed(1)}<small>/5</small></strong>
      <Stars value={s.average} showNumber={false} size={size} />
      <span className="meta">{s.count} rating{s.count === 1 ? "" : "s"}</span>
    </span>
  );
}

/** Broadcast "a rating was created/edited" so every open rating display reloads from the server. */
export const RATINGS_CHANGED = "lc:ratings-changed";
export function notifyRatingsChanged(detail = {}) {
  window.dispatchEvent(new CustomEvent(RATINGS_CHANGED, { detail }));
}
export function useRatingsChanged(callback) {
  useEffect(() => {
    const handler = (e) => callback?.(e.detail || {});
    window.addEventListener(RATINGS_CHANGED, handler);
    return () => window.removeEventListener(RATINGS_CHANGED, handler);
  }, [callback]);
}
