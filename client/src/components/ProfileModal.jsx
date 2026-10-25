import { useCallback, useEffect, useState } from "react";
import { Flag, MapPin, CalendarDays, ShieldCheck, KeyRound, Bike, Wrench, SearchCheck } from "lucide-react";
import { Modal } from "./ui.jsx";
import Avatar from "./Avatar.jsx";
import ReportModal from "./ReportModal.jsx";
import { RatingBreakdown, OverallRating, overallOf, normalizeSummary, useRatingsChanged } from "./StarRating.jsx";
import { getUserProfile } from "../api.js";
import { useStore } from "../store.jsx";

const OFFERS = [
  { key: "room", label: "Rooms", icon: KeyRound },
  { key: "vehicle", label: "Rentals", icon: Bike },
  { key: "service", label: "Services", icon: Wrench },
  { key: "lost_found", label: "Lost & found", icon: SearchCheck },
];

/** Public profile of a community member: photo, bio, ratings, what they offer, recent reviews. */
export default function ProfileModal({ userId, fallbackName = "Member", onClose }) {
  const { user } = useStore();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [reporting, setReporting] = useState(false);

  const load = useCallback(() => {
    let live = true;
    getUserProfile(userId)
      .then((d) => { if (live) { setData(d); setError(""); } })
      // On a refresh failure keep showing the ratings we already have instead of blanking them to zero.
      .catch((e) => { if (live) setError((prev) => prev || e.message || "This profile is not available."); });
    return () => { live = false; };
  }, [userId]);

  useEffect(() => load(), [load]);
  // A rating was just saved somewhere: reload this profile from the server.
  useRatingsChanged(useCallback(() => { load(); }, [load]));

  const profileId = data ? String(data.id ?? data._id ?? "") : "";
  const isSelf = Boolean(user && data && profileId === String(user.id ?? user._id ?? ""));
  const offers = data ? OFFERS.filter((o) => (data.offers?.[o.key] || 0) > 0) : [];

  return (
    <Modal title="Profile" onClose={onClose}>
      {error && <p className="empty">{error}</p>}
      {!error && !data && (
        <div className="profile-head">
          <Avatar name={fallbackName} size={76} />
          <div><h3 className="profile-name">{fallbackName}</h3><span className="meta">Loading profile…</span></div>
        </div>
      )}
      {data && (
        <div className="profile-view">
          <div className="profile-head">
            <Avatar src={data.avatar} name={data.name} size={76} />
            <div className="profile-id">
              <h3 className="profile-name">
                {data.name}
                {data.identityStatus === "verified" && (
                  <span className="verified-pill" title="Identity verified by NearNest"><ShieldCheck size={13} /> Verified</span>
                )}
              </h3>
              <div className="profile-meta">
                {data.area && <span><MapPin size={13} /> {data.area}</span>}
                <span><CalendarDays size={13} /> Joined {new Date(data.memberSince).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</span>
              </div>
              <div className="profile-stars" title="Overall rating across everything this member has received">
                <OverallRating summary={overallOf(data)} size={17} />
              </div>
            </div>
          </div>

          {data.bio && <p className="profile-bio">{data.bio}</p>}
          {isSelf && !data.bio && <p className="meta">Add a short bio from My profile so neighbours know who you are.</p>}

          {offers.length > 0 && (
            <div className="profile-offers">
              {offers.map(({ key, label, icon: Icon }) => (
                <span key={key} className="tag"><Icon size={12} /> {data.offers[key]} {label}</span>
              ))}
            </div>
          )}

          <div className="profile-ratings">
            <RatingBreakdown title="As a service provider / owner" summary={normalizeSummary(data.asProvider)} />
            <RatingBreakdown title="As a customer / tenant" summary={normalizeSummary(data.asCustomer)} />
          </div>

          {(data.reviews || []).length > 0 && (
            <section className="profile-reviews">
              <h4>What people say</h4>
              {(data.reviews || []).map((r) => (
                <div key={r.id} className="review-line">
                  <div className="review-line-head">
                    <Stars value={r.rating} showNumber={false} size={13} />
                    <strong>{r.fromName}</strong>
                    <span className="meta">{r.direction === "customer_to_provider" ? "as customer" : "as provider"} · {new Date(r.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p>{r.comment}</p>
                  {(r.tags || []).length > 0 && <div className="rating-tags">{(r.tags || []).map((t) => <span key={t} className="tag">{t}</span>)}</div>}
                </div>
              ))}
            </section>
          )}

          {!isSelf && user?.role !== "admin" && (
            <button type="button" className="btn ghost" onClick={() => setReporting(true)}>
              <Flag size={14} /> Report this member
            </button>
          )}
        </div>
      )}
      {reporting && data && (
        <ReportModal target={{ id: profileId, _id: profileId, name: data.name, title: data.name }} targetType="user" onClose={() => setReporting(false)} />
      )}
    </Modal>
  );
}
