import type { CoverageIntelligenceDailyStatsRow } from "@/lib/statistics-coverage-intelligence";

/**
 * Merge RAM and persisted receiver coverage maxima without reviving retired S05
 * individual reception records. The legacy nullable record columns remain in
 * the database and DTO for migration compatibility, but receive no live values.
 */
export function mergeCurrentDayStats(options: {
  date: string;
  currentUniqueAircraftCount: number;
  currentMaxConcurrentAircraft: number;
  currentMaxDistanceKm: number;
  persisted?: CoverageIntelligenceDailyStatsRow;
}): CoverageIntelligenceDailyStatsRow {
  return {
    date: options.date,
    uniqueAircraftCount: Math.max(0, options.currentUniqueAircraftCount, options.persisted?.uniqueAircraftCount ?? 0),
    maxConcurrentAircraft: Math.max(0, options.currentMaxConcurrentAircraft, options.persisted?.maxConcurrentAircraft ?? 0),
    maxDistanceKm: Math.max(0, options.currentMaxDistanceKm, options.persisted?.maxDistanceKm ?? 0),
    maxDistanceIcaoHex: null,
    maxDistanceRegistration: null,
    maxDistanceBearing: null,
    maxDistanceAt: null,
    receiverMessagesCount: options.persisted?.receiverMessagesCount ?? null,
    maxGroundSpeedKt: options.persisted?.maxGroundSpeedKt ?? null,
    maxGroundSpeedIcaoHex: options.persisted?.maxGroundSpeedIcaoHex ?? null,
    maxGroundSpeedRegistration: options.persisted?.maxGroundSpeedRegistration ?? null,
    maxGroundSpeedCallsign: options.persisted?.maxGroundSpeedCallsign ?? null,
    maxGroundSpeedAt: options.persisted?.maxGroundSpeedAt ?? null,
  };
}
