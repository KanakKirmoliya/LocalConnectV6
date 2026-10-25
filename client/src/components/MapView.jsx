import { useEffect, useRef } from "react";
import L from "leaflet";
import { useStore } from "../store.jsx";

export const KIND_COLOR = {
  rooms: "#2563EB",
  lostfound: "#9333EA",
  rentals: "#D97706",
  services: "#059669",
  alerts: "#DC2626",
};

const LEGEND = [
  ["rooms", "Rooms", KIND_COLOR.rooms],
  ["lostfound", "Lost & found", KIND_COLOR.lostfound],
  ["rentals", "Rentals", KIND_COLOR.rentals],
  ["services", "Services", KIND_COLOR.services],
  ["alerts", "Alerts", KIND_COLOR.alerts],
];

export default function MapView({
  pins = [],
  radius = 10,
  selected = null,
  onSelect = null,
  height = 420,
  interactivePin = false,
  onPickLocation = null,
}) {
  const { userLocation } = useStore();
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const userMarkerRef = useRef(null);
  const circleRef = useRef(null);
  const markersLayerRef = useRef(null);
  const pickMarkerRef = useRef(null);

  const centerLat = userLocation?.lat || 29.3500;
  const centerLng = userLocation?.lng || 79.5500;

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [centerLat, centerLng],
        zoom: radius <= 5 ? 13 : radius <= 20 ? 11 : radius <= 50 ? 9 : 8,
        zoomControl: true,
      });

      // Free OpenStreetMap TileLayer (Zero API Key, Zero Cost)
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      // User location pulsing marker
      const userIcon = L.divIcon({
        className: "user-loc-pin",
        html: `<div style="
          width: 18px;
          height: 18px;
          background: #2563EB;
          border: 3px solid #FFFFFF;
          border-radius: 50%;
          box-shadow: 0 0 10px rgba(37,99,235,0.6);
        "></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      const userMarker = L.marker([centerLat, centerLng], { icon: userIcon, zIndexOffset: 1000 })
        .addTo(map)
        .bindTooltip(userLocation?.area || "Center Location", { permanent: false, direction: "top" });
      userMarkerRef.current = userMarker;

      // User distance radius circle
      const circle = L.circle([centerLat, centerLng], {
        radius: (radius || 10) * 1000,
        color: "#2563EB",
        fillColor: "#3B82F6",
        fillOpacity: 0.12,
        weight: 1.5,
      }).addTo(map);
      circleRef.current = circle;

      // Layer group for dynamic listing pins
      const markersLayer = L.layerGroup().addTo(map);
      markersLayerRef.current = markersLayer;

      // Handle map clicks for location picking
      if (interactivePin && onPickLocation) {
        map.on("click", (e) => {
          const { lat, lng } = e.latlng;
          if (pickMarkerRef.current) {
            pickMarkerRef.current.setLatLng([lat, lng]);
          } else {
            const pickIcon = L.divIcon({
              className: "picked-pin",
              html: `<div style="
                background: #059669;
                color: white;
                padding: 4px 8px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: 700;
                box-shadow: 0 2px 6px rgba(0,0,0,0.3);
              ">Selected</div>`,
              iconSize: [60, 24],
              iconAnchor: [30, 12],
            });
            pickMarkerRef.current = L.marker([lat, lng], { icon: pickIcon }).addTo(map);
          }
          onPickLocation({ lat, lng });
        });
      }

      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update center & radius circle when user changes distance or location
  useEffect(() => {
    if (mapInstanceRef.current) {
      if (userMarkerRef.current) {
        userMarkerRef.current.setLatLng([centerLat, centerLng]);
        userMarkerRef.current.setTooltipContent(userLocation?.area || "Center Location");
      }

      if (circleRef.current) {
        circleRef.current.setLatLng([centerLat, centerLng]);
        circleRef.current.setRadius((radius || 10) * 1000);
      }

      // Smoothly pan/zoom to the newly selected center location
      try {
        const targetZoom = radius <= 5 ? 13 : radius <= 20 ? 11 : radius <= 50 ? 10 : 8;
        mapInstanceRef.current.setView([centerLat, centerLng], targetZoom);
      } catch {}

      mapInstanceRef.current.invalidateSize();
    }
  }, [centerLat, centerLng, radius, userLocation?.area]);

  // Robust container resize observer to prevent cut-off / grey tiles
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const timer1 = setTimeout(() => mapInstanceRef.current?.invalidateSize(), 150);
    const timer2 = setTimeout(() => mapInstanceRef.current?.invalidateSize(), 400);
    const timer3 = setTimeout(() => mapInstanceRef.current?.invalidateSize(), 800);

    let ro;
    if (window.ResizeObserver && mapContainerRef.current) {
      ro = new ResizeObserver(() => {
        mapInstanceRef.current?.invalidateSize();
      });
      ro.observe(mapContainerRef.current);
    }

    const handleWindowResize = () => {
      mapInstanceRef.current?.invalidateSize();
    };
    window.addEventListener("resize", handleWindowResize);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      if (ro) ro.disconnect();
      window.removeEventListener("resize", handleWindowResize);
    };
  }, []);

  // Update listing markers when pins or selected listing changes
  useEffect(() => {
    if (!markersLayerRef.current || !mapInstanceRef.current) return;

    markersLayerRef.current.clearLayers();

    pins.forEach((p) => {
      if (p.latitude == null || p.longitude == null) return;
      const lat = p.latitude;
      const lng = p.longitude;

      const isSelected = selected === `${p.kind}-${p.id}` || selected === p.id;
      const color = KIND_COLOR[p.kind] || "#2563EB";

      const pinIcon = L.divIcon({
        className: "custom-map-pin",
        html: `
          <div style="
            background: ${color};
            color: #ffffff;
            padding: ${isSelected ? "6px 12px" : "4px 8px"};
            border-radius: 14px;
            font-size: ${isSelected ? "12px" : "11px"};
            font-weight: 700;
            white-space: nowrap;
            display: flex;
            align-items: center;
            gap: 4px;
            box-shadow: ${isSelected ? "0 0 14px rgba(0,0,0,0.5)" : "0 2px 6px rgba(0,0,0,0.25)"};
            border: 2px solid #FFFFFF;
            transform: ${isSelected ? "scale(1.15)" : "scale(1)"};
            transition: transform 0.2s;
            cursor: pointer;
          ">
            <span>${p.label || p.title || p.name || "Item"}</span>
            ${p.rent ? `<span style="opacity:0.9">· ₹${p.rent}</span>` : ""}
            ${p.rate ? `<span style="opacity:0.9">· ₹${p.rate}/hr</span>` : ""}
          </div>
        `,
        iconSize: [120, 30],
        iconAnchor: [60, 15],
      });

      const marker = L.marker([lat, lng], { icon: pinIcon }).addTo(markersLayerRef.current);

      marker.on("click", () => {
        if (onSelect) onSelect(p);
      });

      marker.bindPopup(`
        <div style="min-width: 160px; font-family: sans-serif; padding: 4px 2px;">
          <strong style="font-size: 13px; color: #0F172A; display: block; margin-bottom: 4px;">${p.title || p.name || "Listing"}</strong>
          <span style="display: block; font-size: 12px; color: #64748B; margin-bottom: 6px;">
            ${p.locality || "Local Area"} ${p.km != null ? `· ${p.km} km away` : ""}
          </span>
          ${p.rent ? `<span style="font-weight: 700; color: #2563EB;">₹${p.rent}/month</span>` : ""}
          ${p.rate ? `<span style="font-weight: 700; color: #D97706;">₹${p.rate}/hour</span>` : ""}
        </div>
      `);
    });
  }, [pins, selected, onSelect, centerLat, centerLng]);

  return (
    <div className="map-wrapper" style={{ position: "relative", height, borderRadius: 16, overflow: "hidden", border: "1px solid var(--border)" }}>
      <div ref={mapContainerRef} style={{ height: "100%", width: "100%", zIndex: 1 }} />

      {/* Horizontal Radius Indicator at bottom-right */}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          right: 12,
          zIndex: 400,
          background: "rgba(15, 23, 42, 0.88)",
          color: "#FFFFFF",
          padding: "6px 14px",
          borderRadius: "20px",
          fontSize: "12px",
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          gap: "6px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          border: "1px solid rgba(255,255,255,0.25)",
          backdropFilter: "blur(6px)",
          letterSpacing: "0.2px",
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#38BDF8", boxShadow: "0 0 6px #38BDF8" }} />
        <span>Radius: {radius} km</span>
      </div>

      <ul
        className="map-legend"
        style={{
          position: "absolute",
          bottom: 12,
          left: 12,
          zIndex: 400,
          background: "rgba(255, 255, 255, 0.95)",
          padding: "6px 10px",
          borderRadius: 8,
          boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
          display: "flex",
          gap: 10,
          listStyle: "none",
          margin: 0,
        }}
      >
        {LEGEND.map(([k, l, color]) => (
          <li key={k} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "11px", fontWeight: 600, color: "#334155" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
            {l}
          </li>
        ))}
      </ul>
    </div>
  );
}
