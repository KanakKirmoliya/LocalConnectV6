// Number-plate helpers for rental vehicles.
// Plates are stored in a normalised form (UPPERCASE, no spaces/hyphens) so "up 15 ab 1234",
// "UP15-AB-1234" and "UP15AB1234" are all the SAME vehicle and can never be listed twice.

export function normalizePlate(value) {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Standard Indian plates:  UP15AB1234, DL1CAB1234, MH12A1234, UP151234 (older)
// Bharat (BH) series:      22BH1234AA
const STANDARD = /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/;
const BH_SERIES = /^\d{2}BH\d{4}[A-Z]{1,2}$/;

export function isValidPlate(normalized) {
  return STANDARD.test(normalized) || BH_SERIES.test(normalized);
}

// Friendly display: UP15AB1234 -> "UP 15 AB 1234"
export function formatPlate(normalized) {
  if (!normalized) return "";
  const m = normalized.match(/^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{4})$/);
  if (m) return [m[1], m[2], m[3], m[4]].filter(Boolean).join(" ");
  const bh = normalized.match(/^(\d{2})(BH)(\d{4})([A-Z]{1,2})$/);
  if (bh) return `${bh[1]} ${bh[2]} ${bh[3]} ${bh[4]}`;
  return normalized;
}

export function hasPhoto(photos) {
  return (
    Array.isArray(photos) &&
    photos.some((p) => (typeof p === "string" ? p.trim() : p?.url?.trim?.()))
  );
}

/**
 * Validates the compulsory vehicle fields (plate number + at least one photo).
 * Returns { ok: true, plate } or { ok: false, status, error }.
 */
export function checkVehicleListingInput({ plateNumber, photos }) {
  const plate = normalizePlate(plateNumber);
  if (!plate) {
    return { ok: false, status: 400, error: "Vehicle number plate is required (e.g. UP15 AB 1234)." };
  }
  if (!isValidPlate(plate)) {
    return { ok: false, status: 400, error: "That number plate doesn't look valid. Use a format like UP15 AB 1234." };
  }
  if (!hasPhoto(photos)) {
    return { ok: false, status: 400, error: "A clear photo of the vehicle is required." };
  }
  return { ok: true, plate };
}

export const PLATE_TAKEN_ERROR =
  "A vehicle with this number plate is already listed. The same vehicle cannot be listed twice.";
