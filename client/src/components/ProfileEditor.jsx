import { useRef, useState } from "react";
import { Camera, LocateFixed, Trash2, Check } from "lucide-react";
import { Field } from "./ui.jsx";
import Avatar from "./Avatar.jsx";
import { updateProfile, uploadAvatar } from "../api.js";
import { useStore } from "../store.jsx";
import { reverseGeocode } from "../utils/geo.js";

/**
 * Edit my own profile. The GPS "detect my area" button lives here (not on the sign-up form):
 * it fills in the area and remembers the exact map centre for this account.
 */
export default function ProfileEditor({ onSaved }) {
  const { user, updateUser, setUserLocation, setManualArea, notify } = useStore();
  const fileRef = useRef(null);
  const [form, setForm] = useState({
    name: user.name || "",
    phone: user.phone || "",
    area: user.area || "",
    bio: user.bio || "",
    avatar: user.avatar || "",
  });
  const [gps, setGps] = useState(user.coordinates || null); // { lat, lng } when set from GPS
  const [areaTouched, setAreaTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setUploading(true);
      setError("");
      const url = await uploadAvatar(file);
      setForm((f) => ({ ...f, avatar: url }));
    } catch (err) {
      setError(err.message || "Photo upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const detectLocation = () => {
    if (!navigator.geolocation) return setError("Geolocation is not supported by your browser. Please type your area.");
    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        let place = "";
        try { place = await reverseGeocode(latitude, longitude); } catch { /* fall through */ }
        setGps({ lat: Number(latitude.toFixed(6)), lng: Number(longitude.toFixed(6)) });
        setForm((f) => ({ ...f, area: place || `Near (${latitude.toFixed(2)}, ${longitude.toFixed(2)})` }));
        setAreaTouched(false);
        setLocating(false);
      },
      () => {
        setLocating(false);
        setError("GPS permission denied or unavailable. Please type your locality instead.");
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const save = async (e) => {
    e.preventDefault();
    if (form.name.trim().length < 2) return setError("Enter your full name.");
    setBusy(true);
    setError("");
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        area: form.area.trim(),
        bio: form.bio.trim(),
        avatar: form.avatar,
      };
      // Typing a new area replaces the saved GPS point; using GPS stores the exact point.
      if (areaTouched) payload.coordinates = null;
      else if (gps && (gps.lat !== user.coordinates?.lat || gps.lng !== user.coordinates?.lng)) payload.coordinates = gps;

      const saved = await updateProfile(payload);
      updateUser(saved);
      if (payload.coordinates) {
        setUserLocation({ lat: payload.coordinates.lat, lng: payload.coordinates.lng, area: saved.area || "My location", mode: "profile" });
      } else if (areaTouched && saved.area) {
        await setManualArea(saved.area);
      }
      notify("Profile saved.");
      onSaved?.(saved);
    } catch (err) {
      setError(err.message || "Could not save your profile.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="profile-editor" onSubmit={save} noValidate>
      <div className="photo-row">
        <Avatar src={form.avatar} name={form.name} size={84} />
        <div className="photo-actions">
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={pickPhoto} />
          <button type="button" className="btn" disabled={uploading} onClick={() => fileRef.current?.click()}>
            <Camera size={15} /> {uploading ? "Uploading…" : form.avatar ? "Change photo" : "Add profile photo"}
          </button>
          {form.avatar && (
            <button type="button" className="btn ghost" onClick={() => setForm((f) => ({ ...f, avatar: "" }))}>
              <Trash2 size={14} /> Remove
            </button>
          )}
          <small className="meta">JPG, PNG, WEBP or GIF · up to 5 MB</small>
        </div>
      </div>

      <Field label="Full name">
        <input value={form.name} onChange={set("name")} autoComplete="name" />
      </Field>
      <Field label="Mobile / WhatsApp number">
        <input type="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" placeholder="e.g. +91 98765 43210" />
      </Field>
      <Field label="Your area">
        <div className="input-with-btn">
          <input
            value={form.area}
            onChange={(e) => { set("area")(e); setAreaTouched(true); }}
            placeholder="Locality or colony"
          />
          <button type="button" className="btn" onClick={detectLocation} disabled={locating} title="Detect my current location with GPS">
            <LocateFixed size={16} /> {locating ? "Locating…" : "Use GPS"}
          </button>
        </div>
        {gps && !areaTouched && <small className="meta">GPS location saved for this account.</small>}
      </Field>
      <Field label={`About you (${form.bio.length}/300)`}>
        <textarea rows={3} maxLength={300} value={form.bio} onChange={set("bio")} placeholder="A line or two so neighbours know who you are" />
      </Field>

      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn primary wide" type="submit" disabled={busy || uploading}>
        <Check size={16} /> {busy ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
