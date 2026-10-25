/**
 * Pure unit tests for the GPS room-location identity (no database needed):
 *   node test-room-location-unit.js
 */
import assert from "node:assert/strict";
import {
  normalizeCoordinates, locationKeyFor, neighbourCellKeys, distanceMetres,
  validateRoomLocationInput, getDuplicateRadiusM,
} from "./src/utils/roomLocation.js";

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log(`✅ ${name}`); };

// small deterministic PRNG so failures are reproducible
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

// Move a point by (north, east) metres.
const shift = (lat, lng, northM, eastM) => ({
  lat: lat + northM / 111195,
  lng: lng + eastM / (111195 * Math.cos((lat * Math.PI) / 180)),
});

t("default duplicate radius is 10 m and is configurable", () => {
  assert.equal(getDuplicateRadiusM({}), 10);
  assert.equal(getDuplicateRadiusM({ ROOM_DUPLICATE_RADIUS_M: "25" }), 25);
  assert.equal(getDuplicateRadiusM({ ROOM_DUPLICATE_RADIUS_M: "0" }), 0);
  assert.equal(getDuplicateRadiusM({ ROOM_DUPLICATE_RADIUS_M: "abc" }), 10);
});

t("same coordinates always give the same key (repeated acquisition, any input form)", () => {
  const a = normalizeCoordinates(29.380312, 79.463611);
  const keys = new Set();
  for (let i = 0; i < 50; i++) keys.add(locationKeyFor(a.lat, a.lng));
  assert.equal(keys.size, 1);
  // string input from a form field normalises to the same point and key
  const b = normalizeCoordinates("29.380312", "79.463611");
  assert.equal(locationKeyFor(b.lat, b.lng), [...keys][0]);
});

t("the key depends on coordinates only (photos / ids are not inputs)", () => {
  assert.equal(locationKeyFor.length <= 3, true); // (lat, lng, radius) - nothing else can influence it
  const r1 = validateRoomLocationInput({ latitude: 29.38, longitude: 79.46, locationSource: "manual", photos: ["a.jpg"] });
  const r2 = validateRoomLocationInput({ latitude: 29.38, longitude: 79.46, locationSource: "manual", photos: ["totally-different.png"], _id: "x" });
  assert.equal(r1.locationKey, r2.locationKey);
});

t("invalid / missing / out-of-range coordinates are rejected safely", () => {
  for (const [la, lo] of [[null, 79], [29, undefined], ["", ""], ["abc", 79], [NaN, 1], [91, 10], [-91, 10], [10, 181], [10, -181], [Infinity, 1], [0, 0]]) {
    const r = validateRoomLocationInput({ latitude: la, longitude: lo, locationSource: "manual" });
    assert.equal(r.ok, false, `${la},${lo} should be rejected`);
    assert.ok([400].includes(r.status));
  }
});

t("GPS source needs a reported, good-enough accuracy; manual pins do not", () => {
  const base = { latitude: 29.38, longitude: 79.46 };
  assert.equal(validateRoomLocationInput({ ...base, locationSource: "gps" }).code, "GPS_ACCURACY_REQUIRED");
  const bad = validateRoomLocationInput({ ...base, locationSource: "gps", locationAccuracyM: 500 });
  assert.equal(bad.ok, false); assert.equal(bad.status, 422); assert.equal(bad.code, "GPS_ACCURACY_LOW");
  const good = validateRoomLocationInput({ ...base, locationSource: "gps", locationAccuracyM: 12 });
  assert.equal(good.ok, true); assert.equal(good.source, "gps");
  const manual = validateRoomLocationInput({ ...base, locationSource: "manual" });
  assert.equal(manual.ok, true); assert.equal(manual.source, "manual");
  // unlabelled input is never presented as GPS
  assert.equal(validateRoomLocationInput(base).source, "manual");
});

t("points within 10 m always share a key or land in neighbouring cells (random + boundary stress)", () => {
  const lats = [0.0001, 12.9716, 29.38, 45, 60.2, 78];
  let pairs = 0;
  for (const baseLat of lats) {
    for (let i = 0; i < 4000; i++) {
      const lat = baseLat + (rnd() - 0.5) * 0.01;
      const lng = 79 + (rnd() - 0.5) * 0.01;
      const ang = rnd() * 2 * Math.PI;
      const d = rnd() * 10;
      const b = shift(lat, lng, d * Math.cos(ang), d * Math.sin(ang));
      if (distanceMetres(lat, lng, b.lat, b.lng) > 10) continue;
      pairs++;
      assert.ok(neighbourCellKeys(lat, lng).includes(locationKeyFor(b.lat, b.lng)), `pair at ${baseLat} escaped the neighbour set`);
      assert.ok(neighbourCellKeys(b.lat, b.lng).includes(locationKeyFor(lat, lng)));
    }
  }
  assert.ok(pairs > 10000);
});

t("points exactly on a cell boundary are still found from the other side", () => {
  const a = normalizeCoordinates(29.38, 79.46);
  const key = locationKeyFor(a.lat, a.lng);
  // walk east/north in 0.5 m steps: every point inside 10 m must be inside a.neighbours; the key changes somewhere
  let sawOtherCell = false;
  for (let m = 0; m <= 10; m += 0.5) {
    for (const [n, e] of [[m, 0], [0, m], [m * 0.7071, m * 0.7071], [-m, 0], [0, -m]]) {
      const p = shift(a.lat, a.lng, n, e);
      if (locationKeyFor(p.lat, p.lng) !== key) sawOtherCell = true;
      assert.ok(neighbourCellKeys(a.lat, a.lng).includes(locationKeyFor(p.lat, p.lng)));
    }
  }
  assert.ok(sawOtherCell, "test should cross at least one cell boundary");
});

t("locations beyond the radius are distinguishable (distance decides, not the grid)", () => {
  const a = { lat: 29.38, lng: 79.46 };
  const near = shift(a.lat, a.lng, 6, 6);   // ~8.5 m
  const far = shift(a.lat, a.lng, 15, 0);   // 15 m
  assert.ok(distanceMetres(a.lat, a.lng, near.lat, near.lng) <= 10);
  assert.ok(distanceMetres(a.lat, a.lng, far.lat, far.lng) > 10);
  assert.notEqual(locationKeyFor(a.lat, a.lng), locationKeyFor(far.lat, far.lng));
});

t("neighbour set is small and includes the own cell", () => {
  const a = normalizeCoordinates(28.6139, 77.209);
  const keys = neighbourCellKeys(a.lat, a.lng);
  assert.ok(keys.includes(locationKeyFor(a.lat, a.lng)));
  assert.ok(keys.length >= 1 && keys.length <= 9);
});

t("works across the equator, the antimeridian and for larger configured radii", () => {
  for (const [la, lo] of [[-0.00005, 10], [-33.86, 151.2], [64.1, -21.9], [1, 179.99999], [1, -179.99999]]) {
    const a = normalizeCoordinates(la, lo);
    assert.ok(a.ok);
    assert.equal(locationKeyFor(a.lat, a.lng), locationKeyFor(a.lat, a.lng));
    assert.ok(neighbourCellKeys(a.lat, a.lng).includes(locationKeyFor(a.lat, a.lng)));
  }
  const a = normalizeCoordinates(29.38, 79.46);
  const p = shift(a.lat, a.lng, 40, 0);
  assert.ok(neighbourCellKeys(a.lat, a.lng, 50).includes(locationKeyFor(p.lat, p.lng, 50)));
});

console.log(`\n${passed} unit tests passed`);
