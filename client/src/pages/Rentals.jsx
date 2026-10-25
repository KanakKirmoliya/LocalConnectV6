import { useRef, useState } from "react";
import { Bike, Car, LocateFixed, Plus, Trash2, CheckCircle2, Flag, Star, Camera, KeyRound, Undo2 } from "lucide-react";
import { Empty, Field, Modal, PageHead, Segmented } from "../components/ui.jsx";
import UserLink from "../components/UserLink.jsx";
import { useRatingsChanged } from "../components/StarRating.jsx";
import ReportModal from "../components/ReportModal.jsx";
import ReviewsModal from "../components/ReviewsModal.jsx";
import { useResource, useStore } from "../store.jsx";
import { post, del, patch, uploadMedia } from "../api.js";

const LATE_SURCHARGE = 30;

// Same rule as the server: letters/digits only, e.g. UP15AB1234, DL1CAB1234, 22BH1234AA
const normalizePlate = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const isValidPlate = (n) => /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/.test(n) || /^\d{2}BH\d{4}[A-Z]{1,2}$/.test(n);
const photoUrl = (p) => (typeof p === "string" ? p : p?.url);

export default function Rentals() {
  const { radius, setRadius, notify, user, userLocation } = useStore();
  const [rentals, setRentals, , refetchRentals] = useResource("rentals");
  // A rating was saved anywhere: reload so every card shows the same, fresh numbers.
  useRatingsChanged(() => { refetchRentals?.(); });
  const [type, setType] = useState("All");
  const [booking, setBooking] = useState(null);
  const [adding, setAdding] = useState(false);
  const [reportingVehicle, setReportingVehicle] = useState(null);
  const [reviewingVehicle, setReviewingVehicle] = useState(null);

  const list = rentals.filter((r) => (radius >= 9999 || r.km == null || r.km <= radius) && (type === "All" || r.type === type));

  const handleReviewUpdated = (vehicleId, stats) => {
    setRentals((prev) =>
      prev.map((item) =>
        (item.id === vehicleId || item._id === vehicleId)
          ? { ...item, averageRating: stats.averageRating, reviewsCount: stats.totalReviews }
          : item
      )
    );
  };

  const addVehicle = async (form) => {
    try {
      const item = await post("rentals", {
        name: form.name,
        type: form.type,
        rate: Number(form.rate),
        plateNumber: normalizePlate(form.plateNumber),
        description: form.description || "",
        photos: form.photos,
        locality: form.locality || userLocation?.area || user?.area || "Local Area",
        latitude: form.latitude || userLocation?.lat,
        longitude: form.longitude || userLocation?.lng,
        available: true,
      });
      setRentals((prev) => [item, ...prev]);
      setAdding(false);
      notify("Vehicle listed successfully. It is now visible to nearby riders.");
    } catch (err) {
      notify(err.message || "Failed to list vehicle.");
    }
  };

  const deleteVehicle = async (id) => {
    if (!window.confirm("Are you sure you want to remove this vehicle listing?")) return;
    try {
      await del("rentals", id);
      setRentals((prev) => prev.filter((r) => (r.id || r._id) !== id));
      notify("Vehicle removed from database.");
    } catch (err) {
      notify(err.message || "Failed to remove vehicle.");
    }
  };

  // Owner clicks "Book" (vehicle rented out -> hidden from the list) or "Unbook" (back on the list).
  const toggleBooked = async (vehicle, booked) => {
    const vId = vehicle.id || vehicle._id;
    try {
      await patch("rentals", `${vId}/booking`, { booked });
      setRentals((prev) =>
        prev.map((item) =>
          (item.id || item._id) === vId ? { ...item, booked, available: !booked } : item
        )
      );
      notify(
        booked
          ? `${vehicle.plateNumber || vehicle.name} marked as booked. It is now hidden from the rental list.`
          : `${vehicle.plateNumber || vehicle.name} is back on the rental list.`
      );
    } catch (err) {
      notify(err.message || "Could not update booking status.");
    }
  };

  const handleBooking = async (vehicle, hours) => {
    try {
      await post("requests", {
        listingId: vehicle.id || vehicle._id,
        message: `Rental request for ${hours} hours (${vehicle.name}).`,
      });
      setBooking(null);
      notify(`Booking request sent to ${vehicle.owner}.`);
    } catch (err) {
      notify(err.message || "Failed to send booking request.");
    }
  };

  return (
    <>
      <PageHead
        title="Rentals"
        sub="Scooty, bike or car from verified locals nearby. Pay per hour with flexible pickup."
        action={<button className="btn primary" onClick={() => setAdding(true)}><Plus size={16} /> List a vehicle</button>}
      />
      <Segmented value={type} onChange={setType} options={["All", "Scooty", "Bike", "Car"].map((v) => ({ value: v, label: v }))} />
      <div className="list">
        {list.length === 0 && <Empty text="No vehicles in this radius. Widen it or list your own ride!" />}
        {list.map((r) => {
          const vId = r.id || r._id;
          const isOwner = user && (r.ownerId === user.id || r.owner === user.name);
          return (
            <article key={vId} className="card" style={r.booked ? { opacity: 0.85 } : undefined}>
              {photoUrl(r.photos?.[0]) && (
                <img
                  src={photoUrl(r.photos[0])}
                  alt={`${r.name}${r.plateNumber ? ` (${r.plateNumber})` : ""}`}
                  style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 10 }}
                />
              )}
              <div className="card-top">
                <h3>{r.name}</h3>
                <strong className="price">Rs {r.rate}<small>/hr</small></strong>
              </div>
              {r.plateNumber && (
                <p className="meta" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <KeyRound size={14} />
                  <span
                    style={{
                      fontFamily: "monospace",
                      fontWeight: 700,
                      letterSpacing: 1,
                      border: "1.5px solid var(--line)",
                      borderRadius: 6,
                      padding: "1px 8px",
                    }}
                  >
                    {r.plateNumber}
                  </span>
                </p>
              )}
              {r.description && <p className="meta">{r.description}</p>}
              <p className="meta" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span>{r.type} · <UserLink id={r.ownerId} name={r.owner} /> {r.km != null ? `· ${r.km} km away` : ""}</span>
                <span>·</span>
                <button
                  type="button"
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                    fontWeight: 700,
                    color: "#D97706",
                    fontSize: "0.85rem",
                  }}
                  onClick={() => setReviewingVehicle(r)}
                  title="View ratings and reviews"
                >
                  <Star size={13} className="star" /> {r.averageRating > 0 ? Number(r.averageRating).toFixed(1) : "New"}
                  <span style={{ fontWeight: 400, color: "var(--mute)", marginLeft: 2 }}>
                    ({r.reviewsCount || 0} {r.reviewsCount === 1 ? "review" : "reviews"})
                  </span>
                </button>
              </p>
              <div className="card-actions">
                <button
                  className="btn"
                  style={{ padding: "4px 8px", fontSize: "0.75rem", borderColor: "#FDE68A", background: "#FFFBEB", color: "#92400E" }}
                  title="View ratings breakdown and write a review"
                  onClick={() => setReviewingVehicle(r)}
                >
                  <Star size={12} style={{ marginRight: 3, fill: "#F59E0B", color: "#F59E0B" }} />
                  Reviews ({r.reviewsCount || 0})
                </button>

                {!isOwner && (
                  <button
                    className="btn"
                    style={{ padding: "4px 8px", fontSize: "0.75rem", color: "var(--mute)", borderColor: "var(--line)" }}
                    title="Report this vehicle listing for fraud / misuse"
                    onClick={() => setReportingVehicle(r)}
                  >
                    <Flag size={12} style={{ marginRight: 3 }} /> Report
                  </button>
                )}

                {isOwner ? (
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", marginLeft: "auto" }}>
                    {r.booked ? (
                      <>
                        <span className="status bad">Booked · hidden from list</span>
                        <button className="btn" onClick={() => toggleBooked(r, false)} title="Put this vehicle back on the rental list">
                          <Undo2 size={13} style={{ marginRight: 4 }} /> Unbook
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="status good"><CheckCircle2 size={13} style={{ marginRight: 4 }} /> Your vehicle</span>
                        <button className="btn primary" onClick={() => toggleBooked(r, true)} title="Mark as rented out and remove from the list">
                          Book
                        </button>
                      </>
                    )}
                    <button className="btn" style={{ borderColor: "#ef4444", color: "#ef4444" }} onClick={() => deleteVehicle(vId)}>
                      <Trash2 size={13} style={{ marginRight: 4 }} /> Delete
                    </button>
                  </div>
                ) : r.available ? (
                  <button className="btn" style={{ marginLeft: "auto" }} onClick={() => setBooking(r)}>Request</button>
                ) : (
                  <span className="status bad" style={{ marginLeft: "auto" }}>Out right now</span>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {booking && (
        <Booking
          vehicle={booking}
          onClose={() => setBooking(null)}
          onDone={(hours) => handleBooking(booking, hours)}
        />
      )}

      {adding && (
        <AddVehicle
          onClose={() => setAdding(false)}
          onSave={addVehicle}
          defaultLocality={user?.area}
        />
      )}

      {reviewingVehicle && (
        <ReviewsModal
          listing={reviewingVehicle}
          onClose={() => setReviewingVehicle(null)}
          onReviewUpdated={(stats) => handleReviewUpdated(reviewingVehicle.id || reviewingVehicle._id, stats)}
        />
      )}

      {reportingVehicle && (
        <ReportModal
          target={reportingVehicle}
          targetType="listing"
          onClose={() => setReportingVehicle(null)}
        />
      )}
    </>
  );
}

function Booking({ vehicle, onClose, onDone }) {
  const [hours, setHours] = useState(3);
  const [share, setShare] = useState(true);
  const total = vehicle.rate * hours + (share ? 0 : LATE_SURCHARGE);
  const Icon = vehicle.type === "Car" ? Car : Bike;
  return (
    <Modal title={`Rent ${vehicle.name}`} onClose={onClose}>
      <Field label="For how many hours?">
        <input type="number" min="1" max="72" value={hours} onChange={(e) => setHours(Math.max(1, Number(e.target.value)))} />
      </Field>
      <div className="choice-group" role="radiogroup" aria-label="Location sharing">
        <button role="radio" aria-checked={share} className={`choice ${share ? "on" : ""}`} onClick={() => setShare(true)}>
          <LocateFixed size={18} />
          <span><b>Share live location</b><small>Owner sees when you'll be back and can plan the next booking.</small></span>
        </button>
        <button role="radio" aria-checked={!share} className={`choice ${!share ? "on" : ""}`} onClick={() => setShare(false)}>
          <Icon size={18} />
          <span><b>Don't share</b><small>The owner may add Rs {LATE_SURCHARGE} in case of a late return.</small></span>
        </button>
      </div>
      <div className="total"><span>Total</span><strong>Rs {total}</strong></div>
      <button className="btn primary wide" onClick={() => onDone(hours)}>Send request</button>
    </Modal>
  );
}

function AddVehicle({ onClose, onSave, defaultLocality }) {
  const { notify } = useStore();
  const [form, setForm] = useState({
    name: "",
    type: "Scooty",
    rate: "60",
    plateNumber: "",
    description: "",
    locality: defaultLocality || "",
    photos: [],
  });
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const plate = normalizePlate(form.plateNumber);
  const plateOk = isValidPlate(plate);
  const canSubmit = form.name.trim() && form.rate && plateOk && form.photos.length > 0 && !uploading;

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith("image/"));
    e.target.value = "";
    if (!files.length) return;
    try {
      setUploading(true);
      const uploaded = await uploadMedia(files);
      setForm((f) => ({ ...f, photos: [...f.photos, ...uploaded.filter((m) => m.type === "image")] }));
    } catch (err) {
      notify(err.message || "Failed to upload photo.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal title="List a vehicle for rent" onClose={onClose}>
      <Field label="Vehicle Name & Model">
        <input value={form.name} onChange={set("name")} placeholder="e.g. Honda Activa 6G / Royal Enfield" />
      </Field>
      <Field label="Vehicle Type">
        <select value={form.type} onChange={set("type")}>
          <option value="Scooty">Scooty</option>
          <option value="Bike">Bike</option>
          <option value="Car">Car</option>
        </select>
      </Field>
      <Field label="Number Plate (required)">
        <input
          value={form.plateNumber}
          onChange={(e) => setForm({ ...form, plateNumber: e.target.value.toUpperCase() })}
          placeholder="e.g. UP15 AB 1234"
          maxLength={14}
          style={{ fontFamily: "monospace", letterSpacing: 1 }}
        />
        {form.plateNumber && !plateOk && (
          <small style={{ color: "#b42318" }}>Enter a valid plate, e.g. UP15 AB 1234 or 22 BH 1234 AA.</small>
        )}
        <small style={{ color: "var(--mute)", display: "block" }}>
          One number plate can be listed only once. It stays locked to this vehicle even while it is booked.
        </small>
      </Field>
      <Field label="Hourly Rate (Rs/hr)">
        <input type="number" value={form.rate} onChange={set("rate")} placeholder="60" />
      </Field>
      <Field label="Details (condition, fuel, helmet, documents...)">
        <textarea value={form.description} onChange={set("description")} rows={3} placeholder="Anything a renter should know about this vehicle" />
      </Field>
      <Field label="Locality / Pickup Area">
        <input value={form.locality} onChange={set("locality")} placeholder="e.g. Metro Station Gate 2" />
      </Field>

      <div style={{ margin: "8px 0 14px" }}>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleFiles} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Vehicle photo (required)</span>
          <button type="button" className="btn" style={{ fontSize: "0.78rem", padding: "3px 8px" }} onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Camera size={14} style={{ marginRight: 4 }} />
            {uploading ? "Uploading..." : "Add Photo"}
          </button>
        </div>
        {form.photos.length === 0 && (
          <small style={{ color: "var(--mute)" }}>Upload a clear photo in which the number plate is visible.</small>
        )}
        {form.photos.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {form.photos.map((p, idx) => (
              <div key={idx} style={{ position: "relative", width: 72, height: 72, borderRadius: 8, overflow: "hidden", border: "1px solid var(--line)" }}>
                <img src={photoUrl(p)} alt="Vehicle" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <button
                  type="button"
                  aria-label="Remove photo"
                  onClick={() => setForm((f) => ({ ...f, photos: f.photos.filter((_, i) => i !== idx) }))}
                  style={{ position: "absolute", top: 2, right: 2, background: "rgba(0,0,0,0.7)", color: "white", border: "none", borderRadius: "50%", width: 18, height: 18, lineHeight: "16px", cursor: "pointer" }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <button className="btn primary wide" disabled={!canSubmit} onClick={() => onSave(form)}>
        Publish vehicle
      </button>
    </Modal>
  );
}
