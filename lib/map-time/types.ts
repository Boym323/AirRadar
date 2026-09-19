export type MapTimeMode = "LIVE" | "HISTORICAL";

export type TemporalMatch =
  | "EXACT"
  | "NEAREST_BEFORE"
  | "NEAREST_VALID"
  | "INTERVAL_CONTAINS"
  | "UNAVAILABLE";

export type MapContextSourceKind = "OBSERVED" | "MODEL" | "PLANNED";

export interface TemporalResolution {
  requestedAt: string;
  resolvedAt: string | null;
  match: TemporalMatch;
  deltaSeconds: number | null;
}

export interface MapTimeState {
  mode: MapTimeMode;
  currentTime: string;
}

export function isIsoInstant(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
}

export function normalizeInstant(value: string | Date): string {
  const parsed = typeof value === "string" ? Date.parse(value) : value.getTime();
  if (!Number.isFinite(parsed)) throw new Error("Invalid UTC instant");
  return new Date(parsed).toISOString();
}

export function unavailableResolution(requestedAt: string): TemporalResolution {
  return { requestedAt: normalizeInstant(requestedAt), resolvedAt: null, match: "UNAVAILABLE", deltaSeconds: null };
}
