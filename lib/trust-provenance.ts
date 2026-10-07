export type TrustEvidenceKind = "OBSERVED" | "INFERRED" | "PREDICTED" | "SYSTEM" | "BROWSER";
export type TrustFreshness = "FRESH" | "STALE" | "UNKNOWN";
export type TrustConfidence = "LOW" | "MEDIUM" | "HIGH" | null;

export interface TrustProvenance {
  kind: TrustEvidenceKind;
  source: string;
  observedAt?: string | null;
  staleAfterMs?: number;
  confidence?: TrustConfidence;
}

export interface TrustFreshnessResult {
  state: TrustFreshness;
  ageMs: number | null;
}

export function trustFreshness(
  observedAt: string | null | undefined,
  now = new Date(),
  staleAfterMs = 5 * 60_000,
): TrustFreshnessResult {
  if (!observedAt) return { state: "UNKNOWN", ageMs: null };
  const observed = Date.parse(observedAt);
  if (!Number.isFinite(observed)) return { state: "UNKNOWN", ageMs: null };
  const ageMs = Math.max(0, now.getTime() - observed);
  return { state: ageMs <= Math.max(1_000, staleAfterMs) ? "FRESH" : "STALE", ageMs };
}

export function normalizeTrustConfidence(value: string | null | undefined): TrustConfidence {
  const normalized = value?.trim().toUpperCase();
  return normalized === "LOW" || normalized === "MEDIUM" || normalized === "HIGH" ? normalized : null;
}
