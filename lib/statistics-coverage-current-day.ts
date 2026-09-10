import type { CoverageIntelligenceDailyStatsRow } from "@/lib/statistics-coverage-intelligence";

export interface CurrentDayReceptionEvidence {
  date: string;
  distanceKm: number;
  icaoHex: string;
  registration: string | null;
  recordedAt: string;
  bearing: number;
}

function validDistance(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function persistedComplete(row: CoverageIntelligenceDailyStatsRow | undefined): CurrentDayReceptionEvidence | null {
  if (!row || !validDistance(row.maxDistanceKm) || !row.maxDistanceIcaoHex || row.maxDistanceBearing === null || !Number.isFinite(row.maxDistanceBearing) || !row.maxDistanceAt) {
    return null;
  }
  return {
    date: row.date,
    distanceKm: row.maxDistanceKm,
    icaoHex: row.maxDistanceIcaoHex,
    registration: row.maxDistanceRegistration,
    recordedAt: row.maxDistanceAt,
    bearing: row.maxDistanceBearing,
  };
}

function currentComplete(value: CurrentDayReceptionEvidence | null): CurrentDayReceptionEvidence | null {
  if (!value || !validDistance(value.distanceKm) || !value.icaoHex.trim() || !Number.isFinite(value.bearing) || !value.recordedAt) return null;
  return value;
}

/**
 * Merge the current RAM day with its persisted aggregate without combining a
 * distance from one reception with identity/bearing metadata from another.
 * When an older persisted maximum lacks complete V1 record metadata, a newer
 * complete RAM reception remains eligible for the complete-record ranking.
 */
export function mergeCurrentDayStats(options: {
  date: string;
  currentMaxConcurrentAircraft: number;
  currentMaxDistanceKm: number;
  currentReception: CurrentDayReceptionEvidence | null;
  persisted?: CoverageIntelligenceDailyStatsRow;
}): CoverageIntelligenceDailyStatsRow {
  const persistedRecord = persistedComplete(options.persisted);
  const currentRecord = currentComplete(options.currentReception);
  const selected = [persistedRecord, currentRecord]
    .filter((value): value is CurrentDayReceptionEvidence => value !== null)
    .sort((a, b) => b.distanceKm - a.distanceKm)[0] ?? null;

  return {
    date: options.date,
    maxConcurrentAircraft: Math.max(0, options.currentMaxConcurrentAircraft, options.persisted?.maxConcurrentAircraft ?? 0),
    maxDistanceKm: selected?.distanceKm ?? Math.max(0, options.currentMaxDistanceKm, options.persisted?.maxDistanceKm ?? 0),
    maxDistanceIcaoHex: selected?.icaoHex ?? null,
    maxDistanceRegistration: selected?.registration ?? null,
    maxDistanceBearing: selected?.bearing ?? null,
    maxDistanceAt: selected?.recordedAt ?? null,
  };
}
