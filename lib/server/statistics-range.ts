import "temporal-polyfill/full/global";
import type {
  ReceiverStatisticsCoverageTrendPoint,
  ReceiverStatisticsComparison,
  ReceiverStatisticsComparisonPeriod,
  ReceiverStatisticsCoverageBucket,
  ReceiverStatisticsRange,
  ReceiverStatisticsRangeData,
  ReceiverStatisticsTrendPoint,
} from "@/lib/aircraft/types";
import {
  COVERAGE_BUCKET_COUNT,
  COVERAGE_BUCKET_SIZE_DEGREES,
  summarizeCoverage,
} from "@/lib/statistics-coverage";
import { dayKey } from "@/lib/server/config";
import { getPrisma } from "@/lib/server/db";
import type { DailyAircraftStatisticsRecord, DailyCoverageStatisticsRecord } from "@/lib/server/statistics";

export const STATISTICS_RANGE_MAX_DAYS = 30;

export interface ReceiverDailyStatsRangeRow {
  date: string;
  uniqueAircraftCount: number;
  maxConcurrentAircraft: number;
  maxDistanceKm: number;
}

export interface ReceiverDailyAircraftRangeRow extends DailyAircraftStatisticsRecord {
  date: string;
}

export interface ReceiverDailyCoverageRangeRow extends DailyCoverageStatisticsRecord {
  date: string;
}

export interface ReceiverStatisticsRangeRows {
  stats: ReceiverDailyStatsRangeRow[];
  aircraft: ReceiverDailyAircraftRangeRow[];
  coverage: ReceiverDailyCoverageRangeRow[];
}

export interface StatisticsRangeBounds {
  from: string;
  to: string;
  toExclusive: string;
  days: number;
}

export interface CurrentDayStatisticsSnapshot {
  date: string;
  uniqueAircraftCount: number;
  maxConcurrentAircraft: number;
  maxDistanceKm: number;
  aircraft: DailyAircraftStatisticsRecord[];
  coverage: DailyCoverageStatisticsRecord[];
}

export class StatisticsRangeDatabaseUnavailableError extends Error {
  constructor() {
    super("Statistics range database is unavailable");
    this.name = "StatisticsRangeDatabaseUnavailableError";
  }
}

export function statisticsRangeDays(range: ReceiverStatisticsRange): number {
  return range === "30d" ? 30 : 7;
}

export function statisticsRangeBounds(
  range: ReceiverStatisticsRange,
  now: Date,
  timezone: string,
): StatisticsRangeBounds {
  const days = statisticsRangeDays(range);
  const to = dayKey(now, timezone);
  const localDate = Temporal.PlainDate.from(to);
  return {
    from: localDate.subtract({ days: days - 1 }).toString(),
    to,
    toExclusive: localDate.add({ days: 1 }).toString(),
    days,
  };
}

/**
 * Reads only the three daily aggregate tables. The date predicate is applied
 * to every query so the existing date-leading indexes bound the work to at
 * most the requested 30 local calendar days.
 */
export async function loadReceiverStatisticsRangeRows(from: string, toExclusive: string): Promise<ReceiverStatisticsRangeRows> {
  const database = getPrisma();
  if (!database) return { stats: [], aircraft: [], coverage: [] };

  try {
    const schema = database.orm.public;
    let statsQuery = schema.ReceiverDailyStats.where((row) => row.date.gte(from));
    statsQuery = statsQuery.where((row) => row.date.lt(toExclusive));
    let aircraftQuery = schema.ReceiverDailyAircraft.where((row) => row.date.gte(from));
    aircraftQuery = aircraftQuery.where((row) => row.date.lt(toExclusive));
    let coverageQuery = schema.ReceiverDailyCoverage.where((row) => row.date.gte(from));
    coverageQuery = coverageQuery.where((row) => row.date.lt(toExclusive));

    const [stats, aircraft, coverage] = await Promise.all([
      statsQuery.all(),
      aircraftQuery.all(),
      coverageQuery.all(),
    ]);
    return {
      stats: stats.map((row) => ({
        date: row.date,
        uniqueAircraftCount: row.uniqueAircraftCount,
        maxConcurrentAircraft: row.maxConcurrentAircraft,
        maxDistanceKm: row.maxDistanceKm,
      })),
      aircraft: aircraft.map((row) => ({
        date: row.date,
        icaoHex: row.icaoHex,
        aircraftType: row.aircraftType,
        airline: row.airline,
      })),
      coverage: coverage.map((row) => ({
        date: row.date,
        azimuthBucket: row.azimuthBucket,
        maxDistanceKm: row.maxDistanceKm,
      })),
    };
  } catch {
    throw new StatisticsRangeDatabaseUnavailableError();
  }
}

function dateKeys(from: string, days: number): string[] {
  const start = Temporal.PlainDate.from(from);
  return Array.from({ length: days }, (_, index) => start.add({ days: index }).toString());
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function normalizedHex(value: string): string {
  return value.trim().toUpperCase();
}

function hasCurrentDayData(snapshot: CurrentDayStatisticsSnapshot | undefined): boolean {
  if (!snapshot) return false;
  return snapshot.aircraft.length > 0
    || snapshot.uniqueAircraftCount > 0
    || snapshot.maxConcurrentAircraft > 0
    || snapshot.maxDistanceKm > 0
    || snapshot.coverage.some((item) => item.maxDistanceKm > 0);
}

function coverageBucket(value: number): number | null {
  return Number.isInteger(value) && value >= 0 && value < COVERAGE_BUCKET_COUNT ? value : null;
}

function emptyTrendPoint(date: string): ReceiverStatisticsTrendPoint {
  return {
    date,
    uniqueAircraft: null,
    maxConcurrentAircraft: null,
    maxDistanceKm: null,
  };
}

function emptyCoverageTrendPoint(date: string): ReceiverStatisticsCoverageTrendPoint {
  return { date, maxDistanceKm: null };
}

export function aggregateReceiverStatisticsRange(options: {
  range: ReceiverStatisticsRange;
  now: Date;
  timezone: string;
  rows: ReceiverStatisticsRangeRows;
  currentDay?: CurrentDayStatisticsSnapshot;
  bounds?: StatisticsRangeBounds;
}): ReceiverStatisticsRangeData & { coverage: ReceiverStatisticsCoverageBucket[] } {
  const bounds = options.bounds ?? statisticsRangeBounds(options.range, options.now, options.timezone);
  const dates = dateKeys(bounds.from, bounds.days);
  const statsByDate = new Map<string, ReceiverDailyStatsRangeRow>();
  const aircraftRows = options.rows.aircraft.filter((row) => dates.includes(row.date));
  const coverageByDate = new Map<string, number>();
  const coverageByBucket = new Map<number, number>();

  for (const row of options.rows.stats) {
    if (!dates.includes(row.date)) continue;
    statsByDate.set(row.date, {
      date: row.date,
      uniqueAircraftCount: Math.max(0, Math.trunc(row.uniqueAircraftCount)),
      maxConcurrentAircraft: Math.max(0, Math.trunc(row.maxConcurrentAircraft)),
      maxDistanceKm: finiteNonNegative(row.maxDistanceKm),
    });
  }

  for (const row of options.rows.coverage) {
    if (!dates.includes(row.date)) continue;
    const bucket = coverageBucket(row.azimuthBucket);
    const distance = finiteNonNegative(row.maxDistanceKm);
    if (bucket === null) continue;
    coverageByBucket.set(bucket, Math.max(coverageByBucket.get(bucket) ?? 0, distance));
    coverageByDate.set(row.date, Math.max(coverageByDate.get(row.date) ?? 0, distance));
  }

  const currentDay = options.currentDay;
  const currentDayHasData = hasCurrentDayData(currentDay) && currentDay?.date === bounds.to;
  if (currentDayHasData && currentDay) {
    statsByDate.set(bounds.to, {
      date: bounds.to,
      uniqueAircraftCount: Math.max(0, Math.trunc(currentDay.uniqueAircraftCount)),
      maxConcurrentAircraft: Math.max(0, Math.trunc(currentDay.maxConcurrentAircraft)),
      maxDistanceKm: finiteNonNegative(currentDay.maxDistanceKm),
    });
    for (const item of currentDay.coverage) {
      const bucket = coverageBucket(item.azimuthBucket);
      const distance = finiteNonNegative(item.maxDistanceKm);
      if (bucket === null) continue;
      coverageByBucket.set(bucket, Math.max(coverageByBucket.get(bucket) ?? 0, distance));
      if (distance > 0) coverageByDate.set(bounds.to, Math.max(coverageByDate.get(bounds.to) ?? 0, distance));
    }
  }

  const uniqueAircraft = new Set<string>();
  for (const row of aircraftRows) {
    const hex = normalizedHex(row.icaoHex);
    if (hex) uniqueAircraft.add(hex);
  }
  if (currentDayHasData && currentDay) {
    for (const row of currentDay.aircraft) {
      const hex = normalizedHex(row.icaoHex);
      if (hex) uniqueAircraft.add(hex);
    }
  }

  const trend = dates.map((date) => {
    const row = statsByDate.get(date);
    if (!row) return emptyTrendPoint(date);
    return {
      date,
      uniqueAircraft: row.uniqueAircraftCount,
      maxConcurrentAircraft: row.maxConcurrentAircraft,
      maxDistanceKm: row.maxDistanceKm,
    };
  });
  const coverageTrend = dates.map((date) => {
    if (!coverageByDate.has(date)) return emptyCoverageTrendPoint(date);
    return { date, maxDistanceKm: coverageByDate.get(date) ?? 0 };
  });

  const statsRows = [...statsByDate.values()];
  const hasData = statsRows.length > 0 || aircraftRows.length > 0 || coverageByBucket.size > 0;
  const coverage = Array.from({ length: COVERAGE_BUCKET_COUNT }, (_, bucket): ReceiverStatisticsCoverageBucket => ({
    bearingFrom: bucket * COVERAGE_BUCKET_SIZE_DEGREES,
    bearingTo: (bucket + 1) * COVERAGE_BUCKET_SIZE_DEGREES,
    maxDistanceKm: coverageByBucket.get(bucket) ?? 0,
  }));

  return {
    range: options.range,
    days: bounds.days,
    from: bounds.from,
    to: bounds.to,
    hasData,
    summary: {
      uniqueAircraft: uniqueAircraft.size,
      maxConcurrentAircraft: Math.max(...statsRows.map((row) => row.maxConcurrentAircraft), 0),
      maxDistanceKm: Math.max(...statsRows.map((row) => row.maxDistanceKm), 0),
    },
    trend,
    coverageTrend,
    coverageSummary: summarizeCoverage(coverage),
    coverage,
  };
}

export async function getReceiverStatisticsRange(options: {
  range: ReceiverStatisticsRange;
  now: Date;
  timezone: string;
  currentDay?: CurrentDayStatisticsSnapshot;
}): Promise<ReceiverStatisticsRangeData & { coverage: ReceiverStatisticsCoverageBucket[]; comparison: ReceiverStatisticsComparison }> {
  const bounds = statisticsRangeBounds(options.range, options.now, options.timezone);
  const previousTo = Temporal.PlainDate.from(bounds.from).subtract({ days: 1 });
  const previousBounds: StatisticsRangeBounds = {
    from: previousTo.subtract({ days: bounds.days - 1 }).toString(),
    to: previousTo.toString(),
    toExclusive: bounds.from,
    days: bounds.days,
  };
  const [rows, previousRows] = await Promise.all([
    loadReceiverStatisticsRangeRows(bounds.from, bounds.toExclusive),
    loadReceiverStatisticsRangeRows(previousBounds.from, previousBounds.toExclusive),
  ]);
  const period = aggregateReceiverStatisticsRange({ ...options, rows, bounds });
  const previous = aggregateReceiverStatisticsRange({ ...options, rows: previousRows, currentDay: undefined, bounds: previousBounds });

  function comparisonPeriod(data: ReceiverStatisticsRangeData & { coverage: ReceiverStatisticsCoverageBucket[] }): ReceiverStatisticsComparisonPeriod {
    const metricIsPresent = (metric: "uniqueAircraft" | "maxConcurrentAircraft" | "maxDistanceKm"): boolean => data.trend.some((point) => point[metric] !== null)
      || metric === "uniqueAircraft" && data.summary.uniqueAircraft > 0;
    return {
      from: data.from,
      to: data.to,
      hasData: data.hasData,
      uniqueAircraft: metricIsPresent("uniqueAircraft") ? data.summary.uniqueAircraft : null,
      maxConcurrentAircraft: metricIsPresent("maxConcurrentAircraft") ? data.summary.maxConcurrentAircraft : null,
      maxDistanceKm: metricIsPresent("maxDistanceKm") ? data.summary.maxDistanceKm : null,
      coverageMaxDistanceKm: data.coverageSummary.populatedBuckets > 0 ? data.coverageSummary.maxDistanceKm : null,
    };
  }

  return { ...period, comparison: { current: comparisonPeriod(period), previous: comparisonPeriod(previous) } };
}
