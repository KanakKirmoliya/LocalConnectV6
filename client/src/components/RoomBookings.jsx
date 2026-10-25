import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Check, X, Handshake } from "lucide-react";
import { Empty, Field, Modal } from "./ui.jsx";
import { get, post, patch } from "../api.js";
import { useStore } from "../store.jsx";

const fmt = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "-";

const todayISO = () => new Date().toISOString().slice(0, 10);

function addMonthsISO(startISO, months) {
  if (!startISO) return "";
  const [y, m, d] = startISO.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

const STATUS_LABEL = {
  pending: { text: "Waiting for owner", cls: "wait" },
  active: { text: "Booked · room locked", cls: "good" },
  completed: { text: "Completed", cls: "good" },
  terminated: { text: "Ended early (both agreed)", cls: "wait" },
  declined: { text: "Declined", cls: "bad" },
  cancelled: { text: "Cancelled", cls: "bad" },
};

/* ------------------------------------------------------------------ */
/* Tenant: book a room for a specific period                          */
/* ------------------------------------------------------------------ */
export function BookRoomModal({ room, onClose, onDone }) {
  const { notify } = useStore();
  const [startDate, setStartDate] = useState(todayISO());
  const [months, setMonths] = useState(3);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const endDate = addMonthsISO(startDate, months);

  const submit = async () => {
    try {
      setBusy(true);
      await post("v1/tenancies", {
        listingId: room.id || room._id,
        startDate,
        durationMonths: Number(months),
        message: message.trim(),
      });
      notify(`Booking request sent to ${room.owner}. The room is locked for you once the owner accepts.`);
      onDone?.();
      onClose();
    } catch (err) {
      notify(err.message || "Could not send booking request.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Book ${room.title}`} onClose={onClose}>
      <Field label="Move-in date">
        <input type="date" min={todayISO()} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </Field>
      <Field label="For how many months?">
        <select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
          {[1, 2, 3, 6, 9, 11, 12, 18, 24, 36].map((m) => (
            <option key={m} value={m}>{m} {m === 1 ? "month" : "months"}</option>
          ))}
        </select>
      </Field>
      <Field label="Message to owner (optional)">
        <textarea rows={2} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Anything the owner should know" />
      </Field>
      <div className="total">
        <span>Rental period</span>
        <strong>{fmt(startDate)} → {fmt(endDate)}</strong>
      </div>
      <p className="meta" style={{ marginTop: 8 }}>
        When the owner accepts, this room is locked to you for the whole period. The owner cannot give it to anyone
        else, and it can only end early if <b>both</b> of you agree.
      </p>
      <button className="btn primary wide" disabled={busy || !startDate} onClick={submit}>
        {busy ? "Sending..." : "Send booking request"}
      </button>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Owner + tenant: bookings, accept / decline, mutual early release   */
/* ------------------------------------------------------------------ */
export function BookingsModal({ onClose, onChanged }) {
  const { notify } = useStore();
  const [items, setItems] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [releaseFor, setReleaseFor] = useState(null); // tenancy id with the release form open
  const [reason, setReason] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");

  const load = useCallback(async () => {
    try {
      const list = await get("v1/tenancies");
      setItems(Array.isArray(list) ? list : []);
    } catch (err) {
      setItems([]);
      notify(err.message || "Could not load bookings.");
    }
  }, [notify]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (id, fn, okMsg) => {
    try {
      setBusyId(id);
      await fn();
      if (okMsg) notify(okMsg);
      setReleaseFor(null);
      setReason("");
      setEffectiveDate("");
      await load();
      onChanged?.();
    } catch (err) {
      notify(err.message || "Action failed.");
    } finally {
      setBusyId(null);
    }
  };

  const accept = (t) => run(t.id, () => patch("v1/tenancies", `${t.id}/accept`, {}), "Booking accepted. The room is now locked for this tenant.");
  const decline = (t) => run(t.id, () => patch("v1/tenancies", `${t.id}/decline`, { reason: "Declined by owner" }), "Request declined.");
  const cancel = (t) => run(t.id, () => patch("v1/tenancies", `${t.id}/cancel`, {}), "Request withdrawn.");
  const requestRelease = (t) =>
    run(
      t.id,
      () => post(`v1/tenancies/${t.id}/termination`, { reason: reason.trim(), ...(effectiveDate ? { effectiveDate } : {}) }),
      "Early-release request sent. The other person must agree before anything changes."
    );
  const respond = (t, agree) =>
    run(
      t.id,
      () => post(`v1/tenancies/${t.id}/termination/respond`, { agree }),
      agree ? "You agreed. The booking has ended and the room is free again." : "You rejected the request. The booking continues."
    );
  const withdraw = (t) => run(t.id, () => post(`v1/tenancies/${t.id}/termination/withdraw`, {}), "Request withdrawn.");

  return (
    <Modal title="My room bookings" onClose={onClose}>
      {items === null && <p className="meta">Loading...</p>}
      {items && items.length === 0 && (
        <Empty text="No bookings yet. Use “Book for a period” on a room to reserve it for specific dates." />
      )}
      <div style={{ display: "grid", gap: 12, maxHeight: "60vh", overflowY: "auto" }}>
        {(items || []).map((t) => {
          const st = STATUS_LABEL[t.status] || { text: t.status, cls: "wait" };
          const isOwner = t.myRole === "owner";
          const term = t.termination;
          const pendingTerm = term?.status === "pending";
          const iAsked = pendingTerm && !term.awaitingMyResponse;
          const busy = busyId === t.id;
          return (
            <div key={t.id} className="card" style={{ gap: 6 }}>
              <div className="card-top">
                <h3 style={{ fontSize: 16 }}>{t.room.title}</h3>
                <span className={`status ${st.cls}`}>{st.text}</span>
              </div>
              <p className="meta" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <CalendarDays size={14} /> {fmt(t.startDate)} → {fmt(t.endDate)} ({t.durationMonths} mo)
                · {isOwner ? "Tenant" : "Owner"}: {t.counterpart?.name}
              </p>
              {t.status === "active" && (t.counterpart?.phone || t.counterpart?.email) && (
                <p className="meta">Contact: {t.counterpart.phone || t.counterpart.email}</p>
              )}
              {t.message && <p className="meta">“{t.message}”</p>}

              {/* pending booking request */}
              {t.status === "pending" && isOwner && (
                <div className="card-actions">
                  <button className="btn primary" disabled={busy} onClick={() => accept(t)}><Check size={13} style={{ marginRight: 4 }} /> Accept</button>
                  <button className="btn" disabled={busy} onClick={() => decline(t)}><X size={13} style={{ marginRight: 4 }} /> Decline</button>
                </div>
              )}
              {t.status === "pending" && !isOwner && (
                <div className="card-actions">
                  <button className="btn" disabled={busy} onClick={() => cancel(t)}>Withdraw request</button>
                </div>
              )}

              {/* running booking: mutual early release */}
              {t.status === "active" && (
                <>
                  {pendingTerm && term.awaitingMyResponse && (
                    <div className="card" style={{ background: "#FFFBEB", gap: 6 }}>
                      <p className="meta" style={{ color: "#92400E" }}>
                        <Handshake size={14} style={{ verticalAlign: "-2px" }} /> The {isOwner ? "tenant" : "owner"} asks to end this
                        booking{term.effectiveDate ? ` on ${fmt(term.effectiveDate)}` : ""}. Reason: “{term.reason}”
                      </p>
                      <div className="card-actions">
                        <button className="btn primary" disabled={busy} onClick={() => respond(t, true)}>Agree to end</button>
                        <button className="btn" disabled={busy} onClick={() => respond(t, false)}>Keep the booking</button>
                      </div>
                    </div>
                  )}
                  {iAsked && (
                    <div className="card-actions">
                      <span className="status wait">You asked to end early · waiting for the other person</span>
                      <button className="btn" disabled={busy} onClick={() => withdraw(t)}>Withdraw</button>
                    </div>
                  )}
                  {!pendingTerm && releaseFor !== t.id && (
                    <div className="card-actions">
                      <button className="btn" onClick={() => setReleaseFor(t.id)}>
                        {isOwner ? "Ask tenant to release the room" : "Ask owner to end early"}
                      </button>
                    </div>
                  )}
                  {!pendingTerm && releaseFor === t.id && (
                    <div style={{ display: "grid", gap: 8 }}>
                      <Field label="Reason (required)">
                        <input value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Moving out early / tenant found another place" />
                      </Field>
                      <Field label="End date (optional, default today)">
                        <input type="date" min={todayISO()} max={String(t.endDate).slice(0, 10)} value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
                      </Field>
                      <p className="meta">The booking only ends if the other person agrees. Until then the room stays locked.</p>
                      <div className="card-actions">
                        <button className="btn primary" disabled={busy || reason.trim().length < 3} onClick={() => requestRelease(t)}>Send request</button>
                        <button className="btn" onClick={() => setReleaseFor(null)}>Cancel</button>
                      </div>
                    </div>
                  )}
                </>
              )}
              {term?.status === "rejected" && t.status === "active" && (
                <p className="meta">Last early-release request was rejected.</p>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
