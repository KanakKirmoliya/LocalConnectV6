import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { LocateFixed, MapPin, RotateCcw } from "lucide-react";
import { acquireGpsFix } from "../utils/geo.js";

/**
 * Room location input. The location is the room's permanent identity, so this component is deliberately strict:
 *  - GPS is read with high accuracy, never from cache, and the best fix is kept (see acquireGpsFix)
 *  - coordinates only change when the user presses a button, types, or clicks the map - never on re-render
 *  - GPS-derived and hand-pinned coordinates are labelled differently and sent to the server with that label
 *  - nothing is ever filled in from a locality name or the map centre
 *
 * value:    { latitude, longitude, source: "gps" | "manual" | null, accuracyM: number | null }
 * onChange: (nextValue) => void
 */
export default function RoomLocationPicker({ value, onChange, fallbackCentre = null, notify }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");
  const [showMap, setShowMap] = useState(false);

  const hasPoint = value?.latitude !== "" && value?.latitude != null && value?.longitude !== "" && value?.longitude != null;

  const detect = async () => {
    setBusy(true);
    setError("");
    setProgress(null);
    try {
      const fix = await acquireGpsFix({ onProgress: setProgress });
      onChange({ latitude: fix.lat, longitude: fix.lng, source: "gps", accuracyM: fix.accuracyM });
      notify?.(`GPS location captured (±${fix.accuracyM} m).`);
    } catch (e) {
      setError(e.message || "GPS failed.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const typed = (key) => (e) => {
    const raw = e.target.value;
    onChange({ ...value, [key]: raw === "" ? "" : Number(raw), source: "manual", accuracyM: null });
  };

  return (
    <div className="loc-box">
      <div className="loc-head">
        <strong style={{ fontSize: "0.85rem" }}>📍 Room location (required)</strong>
        {!hasPoint && <span className="loc-badge none">Not set</span>}
        {hasPoint && value.source === "gps" && <span className="loc-badge gps">GPS ±{value.accuracyM ?? "?"} m</span>}
        {hasPoint && value.source !== "gps" && <span className="loc-badge manual">Manually pinned</span>}
      </div>

      <div className="loc-actions">
        <button type="button" className="btn" onClick={detect} disabled={busy}>
          <LocateFixed size={14} /> {busy ? (progress ? `Improving… ±${progress.accuracyM} m` : "Getting GPS…") : hasPoint && value.source === "gps" ? "Re-detect GPS" : "Detect GPS"}
        </button>
        <button type="button" className="btn ghost" onClick={() => setShowMap((v) => !v)}>
          <MapPin size={14} /> {showMap ? "Hide map" : "Pin on map"}
        </button>
        {error && (
          <button type="button" className="btn ghost" onClick={detect} disabled={busy}>
            <RotateCcw size={14} /> Retry
          </button>
        )}
      </div>

      {error && <p className="loc-error" role="alert">{error}</p>}

      <div style={{ display: "flex", gap: 8 }}>
        <input type="number" step="any" placeholder="Latitude" value={value?.latitude ?? ""} onChange={typed("latitude")} style={{ flex: 1 }} aria-label="Latitude" />
        <input type="number" step="any" placeholder="Longitude" value={value?.longitude ?? ""} onChange={typed("longitude")} style={{ flex: 1 }} aria-label="Longitude" />
      </div>
      <small className="meta">
        Each physical spot can have one room listing. Editing these numbers or using the map marks the location as manually pinned.
      </small>

      {showMap && (
        <PinMap
          point={hasPoint ? { lat: Number(value.latitude), lng: Number(value.longitude) } : null}
          centre={fallbackCentre}
          onPick={(lat, lng) => onChange({ latitude: Number(lat.toFixed(6)), longitude: Number(lng.toFixed(6)), source: "manual", accuracyM: null })}
        />
      )}
    </div>
  );
}

/** Click-to-pin Leaflet map. The view only moves when the user moves it; re-renders never re-centre it. */
function PinMap({ point, centre, onPick }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const start = point || centre || { lat: 22.9734, lng: 78.6569 }; // India overview only when nothing else is known
    const map = L.map(elRef.current, { center: [start.lat, start.lng], zoom: point ? 18 : centre ? 14 : 5 });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    map.on("click", (e) => pickRef.current(e.latlng.lat, e.latlng.lng));
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 50);
    return () => { map.remove(); mapRef.current = null; markerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (markerRef.current) { markerRef.current.remove(); markerRef.current = null; }
    if (point && Number.isFinite(point.lat) && Number.isFinite(point.lng)) {
      markerRef.current = L.circleMarker([point.lat, point.lng], { radius: 9, color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 }).addTo(map);
    }
  }, [point?.lat, point?.lng]);

  return <div ref={elRef} className="loc-picker" aria-label="Map: click to place the room pin" />;
}
