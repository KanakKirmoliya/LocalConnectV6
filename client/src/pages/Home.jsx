import { useState } from "react";
import { Link } from "react-router-dom";
import { KeyRound, SearchCheck, Bike, Wrench, Siren } from "lucide-react";
import MapView, { KIND_COLOR } from "../components/MapView.jsx";
import { ago } from "../components/ui.jsx";
import { useResource, useStore } from "../store.jsx";

export default function Home() {
  const { radius, setRadius, user, userLocation } = useStore();
  const [rooms] = useResource("rooms");
  const [lf] = useResource("lostfound");
  const [rentals] = useResource("rentals");
  const [services] = useResource("services");
  const [alerts] = useResource("alerts");
  const [sel, setSel] = useState(null);

  const pins = [
    ...rooms.map((r) => ({ ...r, kind: "rooms", label: r.title })),
    ...lf.map((r) => ({ ...r, kind: "lostfound", label: `${r.kind === "found" ? "Found" : "Lost"}: ${r.title}` })),
    ...rentals.map((r) => ({ ...r, kind: "rentals", label: r.name })),
    ...services.map((r) => ({ ...r, kind: "services", label: r.name })),
    ...alerts.map((r) => ({ ...r, kind: "alerts", label: r.title })),
  ];

  const near = (list) =>
    radius >= 9999 ? list.length : list.filter((x) => x.km == null || x.km <= radius).length;

  const totalNearby = near(rooms) + near(lf) + near(rentals) + near(services);
  const totalAllDatabase = rooms.length + lf.length + rentals.length + services.length;

  const tiles = [
    { to: "/rooms", label: "Rooms for rent", n: near(rooms), icon: KeyRound, kind: "rooms" },
    { to: "/lost-found", label: "Lost & found", n: near(lf), icon: SearchCheck, kind: "lostfound" },
    { to: "/rentals", label: "Scooty, bike, car", n: near(rentals), icon: Bike, kind: "rentals" },
    { to: "/services", label: "Local services", n: near(services), icon: Wrench, kind: "services" },
  ];
  const liveAlerts = alerts.filter((a) => radius >= 9999 || a.km == null || a.km <= radius).slice(0, 2);

  // If strict radius has 0 items but database has items, show them on map so user is never stranded
  const displayPins = radius >= 9999 ? pins : pins.filter((p) => p.km == null || p.km <= radius);
  const activePins = displayPins.length > 0 ? displayPins : pins;

  return (
    <>
      <section className="hero">
        <div>
          <p className="greet">Hi, {user.name.split(" ")[0]}</p>
          <h1>Everything around you, in one place</h1>
          <p className="sub">Rooms, lost items, rides, helpers and alerts, all within walking distance.</p>
        </div>
        <div className="quick">
          <Link className="btn alert" to="/alerts"><Siren size={16} /> Urgent alert</Link>
          <Link className="btn" to="/rooms">List a room</Link>
          <Link className="btn" to="/lost-found?tab=lost" style={{ borderColor: "#FCA5A5", color: "#DC2626", background: "#FEF2F2" }}>
            🔍 Report lost item
          </Link>
          <Link className="btn" to="/lost-found?tab=found">Post found item</Link>
        </div>
      </section>

      {/* Discovery Assistant Banner when 0 items in radius */}
      {totalNearby === 0 && totalAllDatabase > 0 && (
        <div
          style={{
            background: "#EFF6FF",
            border: "1px solid #BFDBFE",
            borderRadius: "12px",
            padding: "12px 18px",
            marginBottom: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "10px",
          }}
        >
          <div>
            <strong style={{ color: "#1E40AF", fontSize: "0.92rem" }}>
              📍 0 items within {radius} km of {userLocation?.area || "your current center"}
            </strong>
            <p style={{ margin: "2px 0 0 0", fontSize: "0.82rem", color: "#3B82F6" }}>
              We found {totalAllDatabase} listings in surrounding towns (Bhimtal, Nainital, etc.).
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              className="btn"
              style={{ fontSize: "0.8rem", padding: "4px 10px" }}
              onClick={() => setRadius(50)}
            >
              Expand to 50 km
            </button>
            <button
              className="btn primary"
              style={{ fontSize: "0.8rem", padding: "4px 12px" }}
              onClick={() => setRadius(9999)}
            >
              Show All Distance
            </button>
          </div>
        </div>
      )}

      {liveAlerts.length > 0 && (
        <Link to="/alerts" className="banner">
          <Siren size={20} />
          <div>
            <strong>{liveAlerts.length} urgent {liveAlerts.length === 1 ? "alert" : "alerts"} nearby</strong>
            <span>{liveAlerts[0].title}</span>
          </div>
          <em>{ago(liveAlerts[0].minsAgo)}</em>
        </Link>
      )}

      <div className="home-grid">
        <section>
          <MapView pins={activePins} radius={radius} selected={sel && `${sel.kind}-${sel.id}`} onSelect={setSel} height={430} />
          <p className="map-caption">
            {sel ? (
              <><b>{sel.label}</b> · {sel.km != null ? `${sel.km} km away` : "Nearby"}</>
            ) : totalNearby === 0 && totalAllDatabase > 0 ? (
              <span style={{ color: "#2563EB", fontWeight: 600 }}>Showing pins from surrounding areas on map</span>
            ) : (
              "Tap a pin to see what it is. Change the radius from the sidebar."
            )}
          </p>
        </section>
        <section className="tiles">
          {tiles.map(({ to, label, n, icon: Icon, kind }) => (
            <Link key={to} to={to} className="tile">
              <span className="tile-ic" style={{ background: KIND_COLOR[kind] }}><Icon size={18} /></span>
              <span className="tile-n">{n}</span>
              <span className="tile-l">{label}</span>
            </Link>
          ))}
        </section>
      </div>
    </>
  );
}
