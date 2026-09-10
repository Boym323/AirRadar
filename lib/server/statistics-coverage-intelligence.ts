import "temporal-polyfill/full/global";
import { getAppTimezone } from "@/lib/server/config";
import { getPrisma } from "@/lib/server/db";
import { getReceiverStatistics } from "@/lib/server/statistics";
import { statisticsRangeBounds } from "@/lib/server/statistics-range";
import {
  aggregateCoverageIntelligence,
  COVERAGE_INTELLIGENCE_FLIGHT_LIMIT,
  type CoverageIntelligenceDailyCoverageRow,
  type CoverageIntelligenceDailyStatsRow,
  type CoverageIntelligenceHighestFlight,
  type CoverageIntelligenceRange,
  type CoverageIntelligenceResponse,
} from "@/lib/statistics-coverage-intelligence";

interface FlightStartRow {
  startTime: Temporal.Instant | Date;
}

interface HighestFlightRow {
  id: number;
  callsign: string | null;
  registration: string | null;
  maxAltitude: number | null;
  startTime: Temporal.Instant | Date;
  aircraft: {
    icaoHex: string;
    registration: string | null;
  };
}

function instantIso(value: Temporal.Instant | Date): string {
  return value instanceof Date ? value.toISOString() : value.toString();
}

function dayBounds(range: CoverageIntelligenceRange, now: Date, timezone: string): {
  from: string;
  to: string;
  toExclusive: string;
  fromInstant: Temporal.Instant;
  toExclusiveInstant: Temporal.Instant;
} {
  const rangeBounds = statisticsRangeBounds(range, now, timezone);
  const fromInstant = Temporal.PlainDate.from(rangeBounds.from)
    .toZonedDateTime({ timeZone: timezone, plainTime: Temporal.PlainTime.from("00:00") })
    .toInstant();
  const toExclusiveInstant = Temporal.PlainDate.from(rangeBounds.toExclusive)
    .toZonedDateTime({ timeZone: timezone, plainTime: Temporal.PlainTime.from("00:00") })
    .toInstant();
  return { ...rangeBounds, fromInstant, toExclusiveInstant };
}

function unavailable(range: CoverageIntelligenceRange, now: Date, timezone: string): CoverageIntelligenceResponse {
  const bounds = statisticsRangeBounds(range, now, timezone);
  return {
    source: "unavailable",
    range,
    from: bounds.from,
    to: bounds.to,
    timezone,
    generatedAt: now.toISOString(),
    coverage: {
      methodology: "daily-max-percentiles",
      periodDays: bounds.days,
      requiredReliableDays: Math.ceil(bounds.days / 2),
      reliableSectors: 0,
      sectors: [],
      bestReliableP95: null,
    },
    hourly: { complete: false, observedFlights: 0, bins: [], busiestHour: null },
    records: { peakConcurrent: null, farthestReception: null, highestFlight: null },
  };
}

/**
 * Build receiver intelligence without reading FlightPosition. Daily coverage
 * is bounded to 36 azimuth buckets × at most 30 days. Flight.startTime reads
 * are capped; if the cap is exceeded, hourly statistics fail closed instead
 * of presenting a partial ranking as complete.
 */
export async function getCoverageIntelligence(
  range: CoverageIntelligenceRange,
  now = new Date(),
  timezone = getAppTimezone(),
): Promise<CoverageIntelligenceResponse> {
  const database = getPrisma();
  if (!database) return unavailable(range, now, timezone);
  const bounds = dayBounds(range, now, timezone);
  const schema = database.orm.public;

  try {
    let coverageQuery = schema.ReceiverDailyCoverage.where((row) => row.date.gte(bounds.from));
    coverageQuery = coverageQuery.where((row) => row.date.lt(bounds.toExclusive));
    let statsQuery = schema.ReceiverDailyStats.where((row) => row.date.gte(bounds.from));
    statsQuery = statsQuery.where((row) => row.date.lt(bounds.toExclusive));
    const boundedFlights = () => schema.Flight
      .where((flight) => flight.startTime.gte(bounds.fromInstant))
      .where((flight) => flight.startTime.lt(bounds.toExclusiveInstant));

    const [coverageRaw, statsRaw, flightStartsRaw, highestRaw] = await Promise.all([
      coverageQuery.all(),
      statsQuery.all(),
      boundedFlights()
        .orderBy((flight) => flight.startTime.asc())
        .select("startTime")
        .limit(COVERAGE_INTELLIGENCE_FLIGHT_LIMIT + 1)
        .all() as Promise<FlightStartRow[]>,
      boundedFlights()
        .where((flight) => flight.maxAltitude.gt(0))
        .orderBy([(flight) => flight.maxAltitude.desc(), (flight) => flight.startTime.desc()])
        .include("aircraft", (aircraft) => aircraft.select("icaoHex", "registration"))
        .limit(1)
        .all() as Promise<HighestFlightRow[]>,
    ]);

    const coverageByKey = new Map<string, CoverageIntelligenceDailyCoverageRow>();
    for (const row of coverageRaw) {
      coverageByKey.set(`${row.date}:${row.azimuthBucket}`, {
        date: row.date,
        azimuthBucket: row.azimuthBucket,
        maxDistanceKm: row.maxDistanceKm,
      });
    }

    const statsByDate = new Map<string, CoverageIntelligenceDailyStatsRow>();
    for (const row of statsRaw) {
      statsByDate.set(row.date, {
        date: row.date,
        maxConcurrentAircraft: row.maxConcurrentAircraft,
        maxDistanceKm: row.maxDistanceKm,
        maxDistanceIcaoHex: row.maxDistanceIcaoHex,
        maxDistanceRegistration: row.maxDistanceRegistration,
        maxDistanceBearing: row.maxDistanceBearing,
        maxDistanceAt: row.maxDistanceAt ? instantIso(row.maxDistanceAt) : null,
      });
    }

    // Keep the current day at RAM freshness instead of waiting for the normal
    // statistics persistence flush. Never let a newly constructed/empty RAM
    // instance erase a valid persisted current-day aggregate.
    const statistics = getReceiverStatistics();
    const current = statistics.getCurrentDaySnapshot();
    const currentHasData = current.uniqueAircraftCount > 0
      || current.maxConcurrentAircraft > 0
      || current.maxDistanceKm > 0
      || current.coverage.some((row) => row.maxDistanceKm > 0);
    if (currentHasData && current.date >= bounds.from && current.date < bounds.toExclusive) {
      for (const row of current.coverage) {
        if (row.maxDistanceKm <= 0) continue;
        coverageByKey.set(`${current.date}:${row.azimuthBucket}`, {
          date: current.date,
          azimuthBucket: row.azimuthBucket,
          maxDistanceKm: row.maxDistanceKm,
        });
      }
      const reception = statistics.getDailyReceptionRecord();
      const persistedToday = statsByDate.get(current.date);
      statsByDate.set(current.date, {
        date: current.date,
        maxConcurrentAircraft: Math.max(current.maxConcurrentAircraft, persistedToday?.maxConcurrentAircraft ?? 0),
        maxDistanceKm: Math.max(current.maxDistanceKm, persistedToday?.maxDistanceKm ?? 0),
        maxDistanceIcaoHex: reception?.icaoHex ?? persistedToday?.maxDistanceIcaoHex ?? null,
        maxDistanceRegistration: reception?.registration ?? persistedToday?.maxDistanceRegistration ?? null,
        maxDistanceBearing: reception?.bearing ?? persistedToday?.maxDistanceBearing ?? null,
        maxDistanceAt: reception?.recordedAt ?? persistedToday?.maxDistanceAt ?? null,
      });
    }

    const highestRow = highestRaw[0] ?? null;
    const highestFlight: CoverageIntelligenceHighestFlight | null = highestRow && highestRow.maxAltitude !== null ? {
      flightId: highestRow.id,
      icaoHex: highestRow.aircraft.icaoHex,
      callsign: highestRow.callsign,
      registration: highestRow.registration ?? highestRow.aircraft.registration,
      maxAltitudeFt: highestRow.maxAltitude,
      observedAt: instantIso(highestRow.startTime),
    } : null;

    const flightRowsComplete = flightStartsRaw.length <= COVERAGE_INTELLIGENCE_FLIGHT_LIMIT;
    const flightStarts = flightStartsRaw.slice(0, COVERAGE_INTELLIGENCE_FLIGHT_LIMIT).map((row) => instantIso(row.startTime));
    return aggregateCoverageIntelligence({
      range,
      from: bounds.from,
      to: bounds.to,
      timezone,
      generatedAt: now.toISOString(),
      coverageRows: [...coverageByKey.values()],
      statsRows: [...statsByDate.values()],
      flightStartTimes: flightStarts,
      flightRowsComplete,
      highestFlight,
    });
  } catch (error) {
    console.error("AirRadar coverage intelligence query failed", error);
    return unavailable(range, now, timezone);
  }
}
