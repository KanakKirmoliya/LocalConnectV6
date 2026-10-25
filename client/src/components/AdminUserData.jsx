import { useEffect, useState } from "react";
import { Trash2, Mail, Phone, MapPin, Calendar, Fingerprint } from "lucide-react";
import { Modal } from "./ui.jsx";
import Avatar from "./Avatar.jsx";
import { Stars, RatingBreakdown } from "./StarRating.jsx";
import { adminGetUserFull, del } from "../api.js";
import { useStore } from "../store.jsx";

const dt = (d) => (d ? new Date(d).toLocaleString() : "—");

function Block({ title, count, children }) {
  return (
    <details className="soft-details" open={count > 0 && count <= 5}>
      <summary>{title} ({count})</summary>
      <div className="review-list">{count === 0 ? <p className="meta">Nothing here.</p> : children}</div>
    </details>
  );
}

/** Admin-only: everything the platform stores about one account. */
export default function AdminUserData({ userId, onClose }) {
  const { notify } = useStore();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = () => adminGetUserFull(userId).then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [userId]);

  const removeRating = async (r) => {
    if (!window.confirm("Remove this rating permanently? The user's average will update.")) return;
    try {
      await del("admin/ratings", r.id);
      notify("Rating removed.");
      load();
    } catch (e) {
      notify(e.message || "Could not remove rating.");
    }
  };

  const RatingRow = ({ r, showFrom }) => (
    <div className="review-line">
      <div className="review-line-head">
        <Stars value={r.rating} showNumber={false} size={13} />
        <strong>{showFrom ? r.raterName : r.direction === "customer_to_provider" ? "to provider" : "to customer"}</strong>
        <span className="meta">{r.listingTitle || ""} · {dt(r.createdAt)}</span>
        <button className="icon-btn danger" onClick={() => removeRating(r)} title="Remove rating"><Trash2 size={14} /></button>
      </div>
      {r.comment && <p>{r.comment}</p>}
      {r.tags?.length > 0 && <div className="rating-tags">{r.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>}
    </div>
  );

  const p = data?.profile;
  return (
    <Modal title="Full account data" onClose={onClose}>
      {error && <p className="form-error">{error}</p>}
      {!error && !data && <p className="meta">Loading everything about this account…</p>}
      {data && (
        <div className="admin-user-data">
          <div className="profile-head">
            <Avatar src={p.avatar} name={p.name} size={64} />
            <div className="profile-id">
              <h3 className="profile-name">{p.name} <span className="tag">{p.role}</span></h3>
              <div className="profile-meta wrap">
                <span><Mail size={13} /> {p.email}</span>
                {p.phone && <span><Phone size={13} /> {p.phone}</span>}
                {p.area && <span><MapPin size={13} /> {p.area}</span>}
                {p.userCode && <span><Fingerprint size={13} /> {p.userCode}</span>}
                <span><Calendar size={13} /> Joined {dt(p.createdAt)}</span>
              </div>
              {p.bio && <p className="profile-bio">{p.bio}</p>}
              {p.isBanned && <p className="form-error">{p.suspensionStatus === "temporary" ? "Suspended until " + dt(p.suspendedUntil) : "Permanently banned"}{p.banReason ? ` — ${p.banReason}` : ""}</p>}
            </div>
          </div>

          <div className="rating-pair">
            <RatingBreakdown title="As provider" summary={data.ratingSummary.asProvider} />
            <RatingBreakdown title="As customer" summary={data.ratingSummary.asCustomer} />
          </div>

          <Block title="Listings" count={data.listings.length}>
            {data.listings.map((l) => (
              <div key={l.id} className="review-line">
                <strong>{l.title}</strong> <span className="tag">{l.type}</span> <span className="tag">{l.status}</span>
                <span className="meta"> · {l.locality} · {l.photos} photos · {dt(l.createdAt)}</span>
              </div>
            ))}
          </Block>

          <Block title="Requests & chats" count={data.requests.length}>
            {data.requests.map((r) => (
              <details key={r.id} className="review-line">
                <summary>
                  <strong>{r.listingTitle || "Listing"}</strong> <span className="tag">{r.role}</span> <span className="tag">{r.status}</span>
                  <span className="meta"> · {r.messageCount} messages</span>
                </summary>
                {r.message && <p className="meta">First message: {r.message}</p>}
                {r.messages.map((m, i) => (
                  <p key={i} className="chat-line"><strong>{m.senderName}:</strong> {m.text}</p>
                ))}
              </details>
            ))}
          </Block>

          <Block title="Ratings received" count={data.ratingsReceived.length}>
            {data.ratingsReceived.map((r) => <RatingRow key={r.id} r={r} showFrom />)}
          </Block>
          <Block title="Ratings given" count={data.ratingsGiven.length}>
            {data.ratingsGiven.map((r) => <RatingRow key={r.id} r={r} />)}
          </Block>
          <Block title="Reports against this user" count={data.reportsAgainst.length}>
            {data.reportsAgainst.map((r) => (
              <div key={r.id} className="review-line"><strong>{r.reason}</strong> <span className="tag">{r.status}</span><p>{r.details}</p></div>
            ))}
          </Block>
          <Block title="Reports filed by this user" count={data.reportsFiled.length}>
            {data.reportsFiled.map((r) => (
              <div key={r.id} className="review-line"><strong>{r.targetTitle}</strong> · {r.reason} <span className="tag">{r.status}</span></div>
            ))}
          </Block>
        </div>
      )}
    </Modal>
  );
}
