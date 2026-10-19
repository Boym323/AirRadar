/** Shared deterministic median for airport ETA and arrival-flow report models. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle] ?? null
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}
