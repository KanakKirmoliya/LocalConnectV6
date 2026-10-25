// NearNest Geolocation & Locality Resolution Utility

// Fast offline dictionary for instantaneous zero-latency local resolution
export const KNOWN_LOCALITIES = {
  bhimtal: { lat: 29.3500, lng: 79.5500, name: "Bhimtal, Uttarakhand" },
  bhowali: { lat: 29.3800, lng: 79.5200, name: "Bhowali, Uttarakhand" },
  nainital: { lat: 29.3803, lng: 79.4636, name: "Nainital, Uttarakhand" },
  khatima: { lat: 28.9200, lng: 79.9700, name: "Khatima, Uttarakhand" },
  haldwani: { lat: 29.2183, lng: 79.5130, name: "Haldwani, Uttarakhand" },
  rudrapur: { lat: 28.9800, lng: 79.4000, name: "Rudrapur, Uttarakhand" },
  dehradun: { lat: 30.3165, lng: 78.0322, name: "Dehradun, Uttarakhand" },
  haridwar: { lat: 29.9457, lng: 78.1642, name: "Haridwar, Uttarakhand" },
  rishikesh: { lat: 30.0869, lng: 78.2676, name: "Rishikesh, Uttarakhand" },
  almora: { lat: 29.5971, lng: 79.6591, name: "Almora, Uttarakhand" },
  ranikhet: { lat: 29.6434, lng: 79.4322, name: "Ranikhet, Uttarakhand" },
  pithoragarh: { lat: 29.5829, lng: 80.2182, name: "Pithoragarh, Uttarakhand" },
  delhi: { lat: 28.6139, lng: 77.2090, name: "Connaught Place, New Delhi" },
  noida: { lat: 28.5355, lng: 77.3910, name: "Noida, Uttar Pradesh" },
  gurgaon: { lat: 28.4595, lng: 77.0266, name: "Gurugram, Haryana" },
};

/**
 * Resolves a locality name to geographic coordinates (lat/lng).
 * Checks fast local cache first, then falls back to OpenStreetMap Nominatim.
 */
export async function geocodeLocality(query) {
  if (!query || typeof query !== "string") return null;
  const clean = query.trim().toLowerCase();

  // 1. Direct offline match
  for (const [key, coords] of Object.entries(KNOWN_LOCALITIES)) {
    if (clean.includes(key) || key.includes(clean)) {
      return { lat: coords.lat, lng: coords.lng, name: coords.name };
    }
  }

  // 2. OpenStreetMap Nominatim forward search
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
      { headers: { "Accept-Language": "en" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        name: data[0].display_name?.split(",").slice(0, 2).join(",") || query,
      };
    }
  } catch (err) {
    console.warn("[NearNest Geo] Nominatim lookup error:", err.message);
  }

  return null;
}

/**
 * Reverse geocodes coordinates to a human-readable area name.
 */
export async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { "Accept-Language": "en" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address || {};
    return (
      addr.suburb ||
      addr.neighbourhood ||
      addr.residential ||
      addr.town ||
      addr.city_district ||
      addr.city ||
      data.display_name?.split(",")[0] ||
      `Locality (${lat.toFixed(2)}, ${lng.toFixed(2)})`
    );
  } catch (err) {
    return null;
  }
}


/**
 * Gets a real device GPS fix.
 *
 * Why this exists: a single getCurrentPosition() call with default options often returns a cached or
 * network-based (Wi-Fi / cell tower) position that can be hundreds of metres off, and it changes on every call.
 * Here we ask for high accuracy, never accept a cached position (maximumAge: 0), keep listening for a short
 * while and keep the BEST fix (smallest reported accuracy radius). The result is never replaced by a locality
 * centre, a map centre or any other approximation.
 *
 * Resolves { lat, lng, accuracyM } (6 decimals). Rejects with an Error whose `code` is one of
 * UNSUPPORTED | PERMISSION_DENIED | UNAVAILABLE | TIMEOUT.
 */
export function acquireGpsFix({ goodEnoughM = 20, maxWaitMs = 20000, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const fail = (code, message) => reject(Object.assign(new Error(message), { code }));
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return fail("UNSUPPORTED", "This browser does not support GPS. Pin the location on the map instead.");
    }
    let best = null;
    let settled = false;
    let watchId = null;
    let timer = null;

    const finish = () => {
      if (settled) return;
      settled = true;
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      clearTimeout(timer);
      if (best) {
        resolve({
          lat: Math.round(best.coords.latitude * 1e6) / 1e6,
          lng: Math.round(best.coords.longitude * 1e6) / 1e6,
          accuracyM: Math.round(best.coords.accuracy),
        });
      } else {
        fail("TIMEOUT", "Could not get a GPS fix in time. Move to an open area and retry, or pin the location on the map.");
      }
    };

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos;
        onProgress?.({ accuracyM: Math.round(best.coords.accuracy) });
        if (best.coords.accuracy <= goodEnoughM) finish();
      },
      (err) => {
        if (settled) return;
        if (best) return finish(); // we already have something usable
        settled = true;
        navigator.geolocation.clearWatch(watchId);
        clearTimeout(timer);
        if (err.code === 1) fail("PERMISSION_DENIED", "Location permission was denied. Allow location access in your browser, or pin the location on the map.");
        else if (err.code === 3) fail("TIMEOUT", "GPS timed out. Move to an open area and retry, or pin the location on the map.");
        else fail("UNAVAILABLE", "GPS is unavailable right now. Retry, or pin the location on the map.");
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: maxWaitMs }
    );
    timer = setTimeout(finish, maxWaitMs);
  });
}
