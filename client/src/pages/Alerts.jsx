import { useState } from "react";
import { Siren, Trash2, CheckCircle2 } from "lucide-react";
import MapView from "../components/MapView.jsx";
import { Empty, Field, Modal, PageHead, ago } from "../components/ui.jsx";
import UserLink from "../components/UserLink.jsx";
import { useResource, useStore } from "../store.jsx";
import { post, del } from "../api.js";

export default function Alerts() {
  const { radius, setRadius, notify, user, userLocation } = useStore();
  const [alerts, setAlerts] = useResource("alerts");
  const [open, setOpen] = useState(false);
  const [helped, setHelped] = useState({});

  const list = alerts.filter((a) => radius >= 9999 || a.km == null || a.km <= radius);
  const pins = list.map((a) => ({ ...a, kind: "alerts", label: a.title }));

  const help = async (a) => {
    const alertId = a.id || a._id;
    try {
      await post("requests", {
        listingId: alertId,
        message: `Emergency response: I can help! I am nearby and on my way.`,
      });
      setHelped((h) => ({ ...h, [alertId]: true }));
      setAlerts((l) => l.map((x) => ((x.id === alertId || x._id === alertId) ? { ...x, helpers: (x.helpers || 0) + 1 } : x)));
      notify(`${a.by || "Author"} has been notified that you are on the way to help.`);
    } catch (err) {
      notify(err.message || "Failed to send help response.");
    }
  };

  const deleteAlert = async (id) => {
    if (!window.confirm("Are you sure you want to resolve and remove this alert?")) return;
    try {
      await del("alerts", id);
      setAlerts((l) => l.filter((x) => (x.id || x._id) !== id));
      notify("Alert resolved and removed from map.");
    } catch (err) {
      notify(err.message || "Failed to remove alert.");
    }
  };

  const send = async (form) => {
    try {
      const item = await post("alerts", {
        ...form,
        by: user.name,
        locality: form.locality || userLocation?.area || user?.area || "Local Area",
        latitude: userLocation?.lat,
        longitude: userLocation?.lng,
      });
      setAlerts((l) => [item, ...l]);
      setOpen(false);
      notify("Alert broadcasted to database. Visible to everyone nearby.");
    } catch (err) {
      notify(err.message || "Failed to post alert.");
    }
  };

  return (
    <>
      <PageHead
        title="Local alerts"
        sub="Stuck on the road, need blood, spotted something unsafe? Tell the people closest to you."
        action={<button className="btn alert" onClick={() => setOpen(true)}><Siren size={16} /> Send urgent alert</button>}
      />
      <div className="split">
        <div className="list">
          {list.length === 0 && <Empty text="All quiet within this radius. Stay safe!" />}
          {list.map((a) => {
            const alertId = a.id || a._id;
            const isOwner = user && (a.ownerId === user.id || a.by === user.name);
            return (
              <article key={alertId} className="card alert-card">
                <div className="card-top">
                  <span className="tag">{a.type}</span>
                  <span className="meta">{ago(a.minsAgo)} {a.km != null ? `· ${a.km} km` : ""}</span>
                </div>
                <h3>{a.title}</h3>
                <p className="meta">Posted by <UserLink id={a.ownerId} name={a.by || a.ownerName} /> · {a.helpers || 0} {(a.helpers || 0) === 1 ? "person" : "people"} responding</p>
                <div className="card-actions">
                  {isOwner ? (
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <span className="status ok"><CheckCircle2 size={13} style={{ marginRight: 4 }} /> Your alert</span>
                      <button className="btn" style={{ borderColor: "#ef4444", color: "#ef4444" }} onClick={() => deleteAlert(alertId)}>
                        <Trash2 size={13} style={{ marginRight: 4 }} /> Resolve & Delete
                      </button>
                    </div>
                  ) : helped[alertId] ? (
                    <span className="status good">You're responding</span>
                  ) : (
                    <button className="btn" onClick={() => help(a)}>I can help</button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        <MapView pins={pins} radius={radius} height={420} />
      </div>
      {open && <SendAlert onClose={() => setOpen(false)} onSend={send} radius={radius} />}
    </>
  );
}

function SendAlert({ onClose, onSend, radius }) {
  const [form, setForm] = useState({ type: "Stuck", title: "" });
  return (
    <Modal title="Send urgent alert" onClose={onClose}>
      <Field label="What kind of help?">
        <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          <option>Stuck</option>
          <option>Medical</option>
          <option>Blood</option>
          <option>Safety</option>
        </select>
      </Field>
      <Field label="What's happening?">
        <textarea rows="3" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Where you are and what you need" />
      </Field>
      <p className="note">For emergencies, call 112 first. This alert goes to neighbours within {radius} km.</p>
      <button className="btn alert wide" disabled={!form.title} onClick={() => onSend(form)}>Send to neighbours</button>
    </Modal>
  );
}
