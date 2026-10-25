/** Pure tests for the single rating calculation (no database): node test-ratings-unit.js */
import assert from "node:assert/strict";
import { buildRatingSummary } from "./src/utils/ratingSummary.js";

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log(`✅ ${name}`); };
const rows = (...v) => v.map((rating) => ({ rating }));

t("no ratings: explicit empty state, average 0 only because count is 0", () => {
  const s = buildRatingSummary([]);
  assert.equal(s.count, 0); assert.equal(s.average, 0); assert.equal(s.hasRatings, false);
  assert.deepEqual(s.distribution, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
  assert.equal(buildRatingSummary().count, 0);
});

t("one rating gives that exact average and count 1", () => {
  const s = buildRatingSummary(rows(4));
  assert.equal(s.average, 4); assert.equal(s.count, 1); assert.equal(s.hasRatings, true);
});

t("average = points / count, rounded to one decimal", () => {
  assert.equal(buildRatingSummary(rows(5, 4, 4)).average, 4.3);   // 13/3 = 4.333
  assert.equal(buildRatingSummary(rows(5, 5, 4)).average, 4.7);   // 14/3 = 4.667
  assert.equal(buildRatingSummary(rows(1, 2)).average, 1.5);
  assert.equal(typeof buildRatingSummary(rows(3)).average, "number");
  assert.ok(Number.isInteger(buildRatingSummary(rows(3, 3)).count));
});

t("overall is WEIGHTED (all points / all ratings), not the mean of two means", () => {
  const provider = rows(5, 5, 5, 5, 5, 5, 5, 5, 5);   // 9 x 5 stars -> avg 5
  const customer = rows(1);                            // 1 x 1 star  -> avg 1
  const overall = buildRatingSummary([...provider, ...customer]);
  assert.equal(overall.count, 10);
  assert.equal(overall.average, 4.6);                  // (45+1)/10 ; a mean of means would wrongly give 3.0
  assert.equal(buildRatingSummary(provider).average, 5);
  assert.equal(buildRatingSummary(customer).average, 1);
});

t("provider and customer groups stay separately accurate", () => {
  const p = buildRatingSummary(rows(4, 5)); const c = buildRatingSummary(rows(2));
  assert.equal(p.average, 4.5); assert.equal(p.count, 2);
  assert.equal(c.average, 2);   assert.equal(c.count, 1);
});

t("invalid rows are ignored, never turned into zero-star ratings", () => {
  const s = buildRatingSummary([{ rating: 5 }, { rating: null }, { rating: "abc" }, { rating: 0 }, { rating: 6 }, {}, null, { rating: "4" }]);
  assert.equal(s.count, 2); assert.equal(s.average, 4.5);
});

t("distribution, tags and recommend percentage", () => {
  const s = buildRatingSummary([
    { rating: 5, tags: ["Honest", "On time"], wouldRecommend: true },
    { rating: 5, tags: ["Honest"], wouldRecommend: true },
    { rating: 2, tags: [], wouldRecommend: false },
    { rating: 4 },
  ]);
  assert.deepEqual(s.distribution, { 1: 0, 2: 1, 3: 0, 4: 1, 5: 2 });
  assert.deepEqual(s.topTags[0], { tag: "Honest", count: 2 });
  assert.equal(s.recommendPercent, 67); // 2 of the 3 who answered
  assert.equal(buildRatingSummary(rows(5)).recommendPercent, null);
});

console.log(`\n${passed} rating unit tests passed`);
