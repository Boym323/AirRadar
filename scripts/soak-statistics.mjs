/** Shared deterministic nearest-rank statistics for read-only soak reports.
 * Preserves the historical T55/T57 metric contract and three-decimal rounding.
 */
const round = (x, decimals = 3) => x === null ? null : Number(x.toFixed(decimals));

export function stats(values) {
  const sorted = values.filter((v) => typeof v === "number" && Number.isFinite(v))
    .sort((a, b) => a - b);
  if (!sorted.length) return null;
  const p = (ratio) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
  return { count: sorted.length, min: round(sorted[0]), p50: round(p(0.5)),
    p95: round(p(0.95)), max: round(sorted.at(-1)),
    mean: round(sorted.reduce((a, v) => a + v, 0) / sorted.length) };
}
