/**
 * THE single rating calculation. Every screen and endpoint (profile header, listing cards, "my ratings",
 * admin views, the rating POST response) goes through buildRatingSummary().
 *
 * Input rows: { rating (1-5), tags?, wouldRecommend? }. Rows with an invalid rating are ignored.
 * average = (sum of all rating points) / (number of ratings), rounded to ONE decimal. 0 only when count is 0.
 * Combining groups always re-aggregates the raw rows (a weighted mean), never an average of averages.
 */
export function buildRatingSummary(rows = []) {
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const tagCounts = new Map();
  let sum = 0;
  let count = 0;
  let recYes = 0;
  let recAnswered = 0;
  for (const r of rows) {
    const value = Number(r?.rating);
    if (!Number.isFinite(value) || value < 1 || value > 5) continue;
    sum += value;
    count += 1;
    distribution[Math.round(value)] += 1;
    for (const t of r.tags || []) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
    if (typeof r.wouldRecommend === "boolean") {
      recAnswered += 1;
      if (r.wouldRecommend) recYes += 1;
    }
  }
  return {
    average: count ? Math.round((sum / count) * 10) / 10 : 0,
    count,
    hasRatings: count > 0,
    distribution,
    topTags: [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([tag, n]) => ({ tag, count: n })),
    recommendPercent: recAnswered ? Math.round((recYes / recAnswered) * 100) : null,
  };
}

