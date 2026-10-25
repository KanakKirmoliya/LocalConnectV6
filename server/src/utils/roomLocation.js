/**
 * Room location identity (pure functions, no database access).
 *
 *  - normalizeCoordinates()  validates a latitude/longitude pair
 *  - locationKeyFor()        deterministic spatial-cell key: same place -> same key, always
 *  - neighbourCellKeys()     every cell that can hold a point within the duplicate radius
 *  - distanceMetres()        Haversine distance, the final authority for "is this a duplicate?"
 *
 * The key is derived ONLY from coordinates. Photos, filenames, hashes and database ids play no part.
 *
 * Grid: latitude is split into bands of CELL_M metres. Inside a band, longitude is split into steps that are at
 * least CELL_M metres wide at the band's worst (highest-latitude) edge, so any two points closer than CELL_M
 * metres always sit in the same cell or in directly adjacent cells.
 */

const EARTH_RADIUS_M = 6371008.8;
const METRES_PER_DEGREE_LAT = 111_195;

export const DEFAULT_DUPLICATE_RADIUS_M = 10;
export const DEFAULT_MAX_GPS_ACCURACY_M = 100;

/** Duplicate radius in metres, configurable through ROOM_DUPLICATE_RADIUS_M (0 disables the rule). */
export function getDuplicateRadiusM(env = process.env) {
  const raw = env.ROOM_DUPLICATE_RADIUS_M;
  if (raw === undefined || raw === "") return DEFAULT_DUPLICATE_RADIUS_M;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1000 ? n : DEFAULT_DUPLICATE_RADIUS_M;
}

/** Worst GPS accuracy (metres) accepted for a GPS-sourced room location (ROOM_MAX_GPS_ACCURACY_M). */
export function getMaxGpsAccuracyM(env = process.env) {
  const n = Number(env.ROOM_MAX_GPS_ACCURACY_M);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_GPS_ACCURACY_M;
}

/** Cell size is never smaller than the duplicate radius, and never below 5 m. */
const cellSizeM = (radiusM) => Math.max(5, radiusM);

/**
 * Validates and canonicalises coordinates (rounded to 6 decimals, about 0.11 m).
 * Rejects non-numbers, NaN/Infinity, out-of-range values, and the (0,0) "null island" placeholder.
 */
export function normalizeCoordinates(lat, lng) {
  if (lat === null || lat === undefined || lat === "" || lng === null || lng === undefined || lng === "") {
    return { ok: false, code: "LOCATION_REQUIRED", error: "A GPS location (latitude and longitude) is required." };
  }
  const la = typeof lat === "number" ? lat : Number(lat);
  const lo = typeof lng === "number" ? lng : Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) {
    return { ok: false, code: "LOCATION_INVALID", error: "Latitude must be between -90 and 90 and longitude between -180 and 180." };
  }
  if (la === 0 && lo === 0) {
    return { ok: false, code: "LOCATION_INVALID", error: "Coordinates 0, 0 are not a real location." };
  }
  return { ok: true, lat: Math.round(la * 1e6) / 1e6, lng: Math.round(lo * 1e6) / 1e6 };
}

/** Haversine great-circle distance in metres. */
export function distanceMetres(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const latBandHeightDeg = (size) => size / METRES_PER_DEGREE_LAT;

/** Longitude step (degrees) for a latitude band: >= `size` metres wide even at the band's widest-converging edge. */
function lngStepDeg(band, size) {
  const h = latBandHeightDeg(size);
  const edge = Math.min(89.9, Math.max(Math.abs(band * h), Math.abs((band + 1) * h)));
  return size / (METRES_PER_DEGREE_LAT * Math.cos((edge * Math.PI) / 180));
}

const cellKey = (band, lngIdx) => `LK1:${band}:${lngIdx}`;

/**
 * Deterministic location key of the cell containing the (already normalised) point.
 * Pass the same coordinates, get the same key - on every request, by every user, whatever photos are attached.
 */
export function locationKeyFor(lat, lng, radiusM = getDuplicateRadiusM()) {
  const size = cellSizeM(radiusM);
  const band = Math.floor(lat / latBandHeightDeg(size));
  const step = lngStepDeg(band, size);
  return cellKey(band, Math.floor((lng + 180) / step));
}

/** Every cell key that may contain a point within `radiusM` of (lat,lng), including the point's own cell. */
export function neighbourCellKeys(lat, lng, radiusM = getDuplicateRadiusM()) {
  const size = cellSizeM(radiusM);
  const h = latBandHeightDeg(size);
  // Search box: the radius, padded by 1% for rounding safety.
  const dLat = (Math.max(radiusM, 0) * 1.01) / METRES_PER_DEGREE_LAT;
  const minBand = Math.floor((lat - dLat) / h);
  const maxBand = Math.floor((lat + dLat) / h);
  const keys = new Set();
  for (let band = minBand; band <= maxBand; band++) {
    const step = lngStepDeg(band, size);
    // Widest longitude reach of the radius inside this band (at the band edge closest to the pole).
    const edgeLat = Math.min(89.9, Math.max(Math.abs(band * h), Math.abs((band + 1) * h), Math.abs(lat)));
    const dLng = (Math.max(radiusM, 0) * 1.01) / (METRES_PER_DEGREE_LAT * Math.cos((edgeLat * Math.PI) / 180));
    const minIdx = Math.floor((lng + 180 - dLng) / step);
    const maxIdx = Math.floor((lng + 180 + dLng) / step);
    for (let i = minIdx; i <= maxIdx; i++) keys.add(cellKey(band, i));
  }
  keys.add(locationKeyFor(lat, lng, radiusM));
  return [...keys];
}

/** True when two normalised points are within the duplicate radius of each other. */
export function isWithinDuplicateRadius(a, b, radiusM = getDuplicateRadiusM()) {
  return distanceMetres(a.lat, a.lng, b.lat, b.lng) <= radiusM;
}

/**
 * Validates the location part of a room create/edit request.
 * @param {{latitude, longitude, locationSource?, locationAccuracyM?}} input
 * @returns {{ok:true, lat, lng, source, accuracyM, locationKey} | {ok:false, status, code, error}}
 */
export function validateRoomLocationInput(input = {}, env = process.env) {
  const norm = normalizeCoordinates(input.latitude, input.longitude);
  if (!norm.ok) return { ok: false, status: 400, code: norm.code, error: norm.error };

  // Only coordinates the browser explicitly reports as GPS are labelled GPS; anything else is "manual".
  const source = input.locationSource === "gps" ? "gps" : "manual";
  let accuracyM = null;
  if (input.locationAccuracyM !== undefined && input.locationAccuracyM !== null && input.locationAccuracyM !== "") {
    accuracyM = Number(input.locationAccuracyM);
    if (!Number.isFinite(accuracyM) || accuracyM < 0) {
      return { ok: false, status: 400, code: "LOCATION_INVALID", error: "GPS accuracy must be a positive number of metres." };
    }
  }
  if (source === "gps") {
    if (accuracyM === null) {
      return { ok: false, status: 400, code: "GPS_ACCURACY_REQUIRED", error: "GPS accuracy was not reported. Retry GPS, or pin the room location manually on the map." };
    }
    if (accuracyM > getMaxGpsAccuracyM(env)) {
      return {
        ok: false, status: 422, code: "GPS_ACCURACY_LOW",
        error: `GPS accuracy is only ±${Math.round(accuracyM)} m (needs ±${getMaxGpsAccuracyM(env)} m or better). Move to an open area and retry, or pin the location manually.`,
      };
    }
  }
  return {
    ok: true, lat: norm.lat, lng: norm.lng, source, accuracyM,
    locationKey: locationKeyFor(norm.lat, norm.lng, getDuplicateRadiusM(env)),
  };
}
