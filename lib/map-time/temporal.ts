import { normalizeInstant, type TemporalMatch, type TemporalResolution } from "./types";

export interface TemporalRecord {
  at: string;
}

export interface IntervalRecord {
  validFrom: string;
  validTo: string;
}

function resolution(requestedAt: string, resolvedAt: string | null, match: TemporalMatch): TemporalResolution {
  const requested = Date.parse(requestedAt);
  const resolved = resolvedAt ? Date.parse(resolvedAt) : Number.NaN;
  return {
    requestedAt: normalizeInstant(requestedAt),
    resolvedAt: resolvedAt ? normalizeInstant(resolvedAt) : null,
    match,
    deltaSeconds: Number.isFinite(resolved) ? Math.round(Math.abs(resolved - requested) / 1000) : null,
  };
}

export function resolveNearestBefore<T extends TemporalRecord>(records: readonly T[], requestedAt: string, maxDeltaMs = Number.POSITIVE_INFINITY): { record: T | null; resolution: TemporalResolution } {
  const requested = Date.parse(requestedAt);
  if (!Number.isFinite(requested)) throw new Error("Invalid requested instant");
  const sorted = records
    .filter((record) => Number.isFinite(Date.parse(record.at)) && Date.parse(record.at) <= requested)
    .sort((left, right) => Date.parse(right.at) - Date.parse(left.at));
  const record = sorted[0] ?? null;
  const delta = record ? requested - Date.parse(record.at) : Number.POSITIVE_INFINITY;
  return { record: delta <= maxDeltaMs ? record : null, resolution: record && delta <= maxDeltaMs ? resolution(requestedAt, record.at, delta === 0 ? "EXACT" : "NEAREST_BEFORE") : resolution(requestedAt, null, "UNAVAILABLE") };
}

export function resolveNearestValid<T extends TemporalRecord>(records: readonly T[], requestedAt: string, maxDeltaMs = Number.POSITIVE_INFINITY): { record: T | null; resolution: TemporalResolution } {
  const requested = Date.parse(requestedAt);
  if (!Number.isFinite(requested)) throw new Error("Invalid requested instant");
  const candidates = records.filter((record) => Number.isFinite(Date.parse(record.at)));
  const record = candidates.sort((left, right) => Math.abs(Date.parse(left.at) - requested) - Math.abs(Date.parse(right.at) - requested) || Date.parse(left.at) - Date.parse(right.at))[0] ?? null;
  const delta = record ? Math.abs(Date.parse(record.at) - requested) : Number.POSITIVE_INFINITY;
  return { record: delta <= maxDeltaMs ? record : null, resolution: record && delta <= maxDeltaMs ? resolution(requestedAt, record.at, delta === 0 ? "EXACT" : "NEAREST_VALID") : resolution(requestedAt, null, "UNAVAILABLE") };
}

export function resolveIntervalContains<T extends IntervalRecord>(records: readonly T[], requestedAt: string): { record: T | null; resolution: TemporalResolution } {
  const requested = Date.parse(requestedAt);
  if (!Number.isFinite(requested)) throw new Error("Invalid requested instant");
  const record = records.find((candidate) => Date.parse(candidate.validFrom) <= requested && requested < Date.parse(candidate.validTo)) ?? null;
  return { record, resolution: record ? resolution(requestedAt, record.validFrom, "INTERVAL_CONTAINS") : resolution(requestedAt, null, "UNAVAILABLE") };
}
