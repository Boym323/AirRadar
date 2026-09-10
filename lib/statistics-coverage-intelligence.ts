export type CoverageIntelligenceRange = "7d" | "30d";

export interface CoverageIntelligenceDailyCoverageRow {
  date: string;
  azimuthBucket: number;
  maxDistanceKm: number;
}

export interface CoverageIntelligenceDailyStatsRow {
  date: string;
  maxConcurrentAircraft: number;
  maxDistanceKm: number;
  maxDistanceIcaoHex: string | null;
  maxDistanceRegistration: string | null;
  maxDistanceBearing: number | null;
  maxDistanceAt: string | null;
}

export interface CoverageIntelligenceHighestFlight {
  flightId: number;
  icaoHex: string;
  callsign: string | null;
  registration: string | null;
  maxAltitudeFt: number;
  observedAt: string;
}

export interface CoverageIntelligenceSector {
  bearingFrom: number;
  bearingTo: number;
  observedDays: number;
  coverageDaysPercent: number;
  medianDailyMaxDistanceKm: number | null;
  p95DailyMaxDistanceKm: number | null;
  p99DailyMaxDistanceKm: number | null;
  maxDistanceKm: number | null;
  reliable: boolean;
}

export interface CoverageIntelligenceHourBin {
  hour: number;
  count: number;
}

export interface CoverageIntelligenceBusiestHour {
  localHour: string;
  count: number;
}

export interface CoverageIntelligenceResponse {
  source: "postgres" | "unavailable";
  range: CoverageIntelligenceRange;
  from: string;
  to: string;
  timezone: string;
  generatedAt: string;
  coverage: {
    methodology: "daily-max-percentiles";
    periodDays: number;
    requiredReliableDays: number;
    reliableSectors: number;
    sectors: CoverageIntelligenceSector[];
    bestReliableP95: {
      bearingFrom: number;
      bearingTo: number;
      distanceKm: number;
    } | null;
  };
  hourly: {
    complete: boolean;
    observedFlights: number;
    bins: CoverageIntelligenceHourBin[];
    busiestHour: CoverageIntelligenceBusiestHour | null;
  };
  records: {
    peakConcurrent: { date: string; count: number } | null;
    farthestReception: {
      date: string;
      distanceKm: number;
      icaoHex: string;
      registration: string | null;
      bearing: number;
      recordedAt: string;
    } | null;
    highestFlight: CoverageIntelligenceHighestFlight | null;
  };
}

export const COVERAGE_INTELLIGENCE_BUCKET_COUNT = 36;
export const COVERAGE_INTELLIGENCE_BUCKET_DEGREES = 10;
export const COVERAGE_INTELLIGENCE_FLIGHT_LIMIT = 20_000;

export function parseCoverageIntelligenceRange(value: string | null | undefined): CoverageIntelligenceRange | null {
  return value === "7d" || value === "30d" ? value : null;
}

function finiteDistance(value: number): number | null {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function nearestRank(values: number[], percentile: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(percentile * sorted.length));
  return sorted[Math.min(sorted.length - 1, rank - 1)] ?? null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

export function aggregateCoverageIntelligence(options: {
  range: CoverageIntelligenceRange;
  from: string;
  to: string;
  timezone: string;
  generatedAt: string;
  coverageRows: CoverageIntelligenceDailyCoverageRow[];
  statsRows: CoverageIntelligenceDailyStatsRow[];
  flightStartTimes: string[];
  flightRowsComplete: boolean;
  highestFlight: CoverageIntelligenceHighestFlight | null;
}): CoverageIntelligenceResponse {
  const periodDays = options.range === "7d" ? 7 : 30;
  const requiredReliableDays = Math.ceil(periodDays / 2);
  const sectorValues = Array.from({ length: COVERAGE_INTELLIGENCE_BUCKET_COUNT }, () => new Map<string, number>());

  for (const row of options.coverageRows) {
    if (!Number.isInteger(row.azimuthBucket) || row.azimuthBucket < 0 || row.azimuthBucket >= COVERAGE_INTELLIGENCE_BUCKET_COUNT) continue;
    const distance = finiteDistance(row.maxDistanceKm);
    if (distance === null) continue;
    const perDay = sectorValues[row.azimuthBucket]!;
    perDay.set(row.date, Math.max(perDay.get(row.date) ?? 0, distance));
  }

  const sectors = sectorValues.map((perDay, bucket): CoverageIntelligenceSector => {
    const values = [...perDay.values()];
    const observedDays = values.length;
    const reliable = observedDays >= requiredReliableDays;
    return {
      bearingFrom: bucket * COVERAGE_INTELLIGENCE_BUCKET_DEGREES,
      bearingTo: (bucket + 1) * COVERAGE_INTELLIGENCE_BUCKET_DEGREES,
      observedDays,
      coverageDaysPercent: Math.round((observedDays / periodDays) * 1_000) / 10,
      medianDailyMaxDistanceKm: median(values),
      p95DailyMaxDistanceKm: nearestRank(values, 0.95),
      p99DailyMaxDistanceKm: nearestRank(values, 0.99),
      maxDistanceKm: values.length ? Math.max(...values) : null,
      reliable,
    };
  });

  const reliable = sectors.filter((sector) => sector.reliable && sector.p95DailyMaxDistanceKm !== null);
  const best = [...reliable].sort((a, b) => (b.p95DailyMaxDistanceKm ?? 0) - (a.p95DailyMaxDistanceKm ?? 0) || a.bearingFrom - b.bearingFrom)[0] ?? null;

  const hourOfDay = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  const exactHours = new Map<string, number>();
  if (options.flightRowsComplete) {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: options.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    });
    for (const timestamp of options.flightStartTimes) {
      const parsed = Date.parse(timestamp);
      if (!Number.isFinite(parsed)) continue;
      const parts = formatter.formatToParts(new Date(parsed));
      const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
      const hour = Number(part("hour"));
      if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue;
      hourOfDay[hour]!.count += 1;
      const key = `${part("year")}-${part("month")}-${part("day")}T${String(hour).padStart(2, "0")}:00`;
      exactHours.set(key, (exactHours.get(key) ?? 0) + 1);
    }
  }
  const busiestEntry = options.flightRowsComplete
    ? [...exactHours.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? null
    : null;

  const validStats = options.statsRows.filter((row) => Number.isFinite(row.maxConcurrentAircraft) && row.maxConcurrentAircraft > 0);
  const peak = [...validStats].sort((a, b) => b.maxConcurrentAircraft - a.maxConcurrentAircraft || a.date.localeCompare(b.date))[0] ?? null;
  const farthest = [...options.statsRows]
    .filter((row) => finiteDistance(row.maxDistanceKm) !== null && row.maxDistanceIcaoHex && row.maxDistanceBearing !== null && Number.isFinite(row.maxDistanceBearing) && row.maxDistanceAt)
    .sort((a, b) => b.maxDistanceKm - a.maxDistanceKm || a.date.localeCompare(b.date))[0] ?? null;

  return {
    source: "postgres",
    range: options.range,
    from: options.from,
    to: options.to,
    timezone: options.timezone,
    generatedAt: options.generatedAt,
    coverage: {
      methodology: "daily-max-percentiles",
      periodDays,
      requiredReliableDays,
      reliableSectors: reliable.length,
      sectors,
      bestReliableP95: best && best.p95DailyMaxDistanceKm !== null ? {
        bearingFrom: best.bearingFrom,
        bearingTo: best.bearingTo,
        distanceKm: best.p95DailyMaxDistanceKm,
      } : null,
    },
    hourly: {
      complete: options.flightRowsComplete,
      observedFlights: options.flightStartTimes.length,
      bins: options.flightRowsComplete ? hourOfDay : [],
      busiestHour: busiestEntry ? { localHour: busiestEntry[0], count: busiestEntry[1] } : null,
    },
    records: {
      peakConcurrent: peak ? { date: peak.date, count: Math.max(0, Math.trunc(peak.maxConcurrentAircraft)) } : null,
      farthestReception: farthest ? {
        date: farthest.date,
        distanceKm: farthest.maxDistanceKm,
        icaoHex: farthest.maxDistanceIcaoHex!,
        registration: farthest.maxDistanceRegistration,
        bearing: farthest.maxDistanceBearing!,
        recordedAt: farthest.maxDistanceAt!,
      } : null,
      highestFlight: options.highestFlight,
    },
  };
}
