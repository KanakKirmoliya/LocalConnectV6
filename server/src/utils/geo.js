/**
 * Calculates the great-circle distance between two geographic coordinates
 * using the Haversine formula (spherical geometry).
 * 
 * @param {number} lat1 Latitude of point 1 in degrees
 * @param {number} lon1 Longitude of point 1 in degrees
 * @param {number} lat2 Latitude of point 2 in degrees
 * @param {number} lon2 Longitude of point 2 in degrees
 * @returns {number} Distance in kilometers (rounded to 2 decimal places)
 */
export function calculateHaversineDistanceKm(lat1, lon1, lat2, lon2) {
  if (
    lat1 == null || lon1 == null || lat2 == null || lon2 == null ||
    isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)
  ) {
    return null;
  }

  const R = 6371; // Earth's mean radius in kilometers
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return Math.round(distance * 100) / 100;
}

/**
 * Validates whether latitude and longitude are within standard geographical bounds.
 */
export function isValidCoordinate(lat, lng) {
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (isNaN(lat) || isNaN(lng)) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

// Built-in Indian localities dictionary for instantaneous offline resolution
export const KNOWN_LOCALITIES = {
  bhimtal: { lat: 29.3500, lng: 79.5500 },
  bhowali: { lat: 29.3800, lng: 79.5200 },
  nainital: { lat: 29.3803, lng: 79.4636 },
  khatima: { lat: 28.9200, lng: 79.9700 },
  haldwani: { lat: 29.2183, lng: 79.5130 },
  rudrapur: { lat: 28.9800, lng: 79.4000 },
  dehradun: { lat: 30.3165, lng: 78.0322 },
  haridwar: { lat: 29.9457, lng: 78.1642 },
  rishikesh: { lat: 30.0869, lng: 78.2676 },
  almora: { lat: 29.5971, lng: 79.6591 },
  ranikhet: { lat: 29.6434, lng: 79.4322 },
  pithoragarh: { lat: 29.5829, lng: 80.2182 },
  delhi: { lat: 28.6139, lng: 77.2090 },
  noida: { lat: 28.5355, lng: 77.3910 },
  gurgaon: { lat: 28.4595, lng: 77.0266 },
};

/**
 * Resolves a text locality name to coordinates using known registry or heuristics.
 */
export function resolveLocalityCoordinates(localityName) {
  if (!localityName || typeof localityName !== "string") return null;
  const lower = localityName.toLowerCase().trim();
  for (const [key, coords] of Object.entries(KNOWN_LOCALITIES)) {
    if (lower.includes(key) || key.includes(lower)) {
      return { lat: coords.lat, lng: coords.lng };
    }
  }
  return null;
}
