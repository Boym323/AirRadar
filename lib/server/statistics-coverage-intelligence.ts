import "temporal-polyfill/full/global";
import { getAppTimezone } from "@/lib/server/config";
import { getPrisma } from "@/lib/server/db";
import { getReceiverAdvancedStatistics } from "@/lib/server/receiver-advanced-statistics";
import { getReceiverStatistics } from "@/lib/server/statistics";
import { statisticsRangeBounds } from "@/lib/server/statistics-range";
import { mergeCurrentDayStats } from "@/lib/statistics-coverage-current-day";
import {
  aggregateCoverageIntelligence,
  COVERAGE_INTELLIGENCE_FLIGHT_LIMIT,
  type CoverageIntelligenceDailyAltitudeCoverageRow,
  type CoverageIntelligenceDailyCoverageRow,
  type CoverageIntelligenceDailyStatsRow,
  type CoverageIntelligenceHighestFlight,
  type CoverageIntelligenceRange,
  type CoverageIntelligenceResponse,
} from "@/lib/statistics-coverage-intelligence";

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
    altitudeCoverage: { methodology: "daily-max-p95", bands: [] },
    messages: { observedDays: 0, total: null },
    hourly: { complete: false, observedFlights: 0, bins: [], busiestHour: null },
    records: { peakConcurrent: null, farthestReception: null, fastestAircraft: null, highestFlight: null },
  };
}

/**
 * Build receiver intelligence without reading FlightPosition. Daily coverage
 * is bounded to 36 azimuth buckets × at most 30 days and altitude coverage to
 * 36 × 4 buckets × 30 days. Flight.startTime reads are capped; if the cap is
 * exceeded, hourly statistics fail closed instead of presenting partial data.
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
    let altitudeCoverageQuery = schema.ReceiverDailyCoverageAltitude.where((row) => row.date.gte(bounds.from));
    altitudeCoverageQuery = altitudeCoverageQuery.where((row) => row.date.lt(bounds.toExclusive));
    let statsQuery = schema.ReceiverDailyStats.where((row) => row.date.gte(bounds.from));
    statsQuery = statsQuery.where((row) => row.date.lt(bounds.toExclusive));
    const boundedFlights = () => schema.Flight
      .where((flight) => flight.startTime.gte(bounds.fromInstant))
      .where((flight) => flight.startTime.lt(bounds.toExclusiveInstant));

    const [coverageRaw, altitudeCoverageRaw, statsRaw, flightStartsRaw, highestRaw] = await Promise.all([
      coverageQuery.all(),
      altitudeCoverageQuery.all(),
      statsQuery.all(),
      boundedFlights()
        .orderBy((flight) => flight.startTime.asc())
        .select("startTime")
        .limit(COVERAGE_INTELLIGENCE_FLIGHT_LIMIT + 1)
        .all(),
      boundedFlights()
        .where((flight) => flight.maxAltitude.gt(0))
        .orderBy([(flight) => flight.maxAltitude.desc(), (flight) => flight.startTime.desc()])
        .include("aircraft", (aircraft) => aircraft.select("icaoHex", "registration"))
        .limit(1)
        .all(),
    ]);

    const coverageByKey = new Map<string, CoverageIntelligenceDailyCoverageRow>();
    for (const row of coverageRaw) {
      coverageByKey.set(`${row.date}:${row.azimuthBucket}`, {
        date: row.date,
        azimuthBucket: row.azimuthBucket,
        maxDistanceKm: row.maxDistanceKm,
      });
    }

    const altitudeCoverageByKey = new Map<string, CoverageIntelligenceDailyAltitudeCoverageRow>();
    for (const row of altitudeCoverageRaw) {
      altitudeCoverageByKey.set(`${row.date}:${row.azimuthBucket}:${row.altitudeBand}`, {
        date: row.date,
        azimuthBucket: row.azimuthBucket,
        altitudeBand: row.altitudeBand,
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
        receiverMessagesCount: row.receiverMessagesCount,
        maxGroundSpeedKt: row.maxGroundSpeedKt,
        maxGroundSpeedIcaoHex: row.maxGroundSpeedIcaoHex,
        maxGroundSpeedRegistration: row.maxGroundSpeedRegistration,
        maxGroundSpeedCallsign: row.maxGroundSpeedCallsign,
        maxGroundSpeedAt: row.maxGroundSpeedAt ? instantIso(row.maxGroundSpeedAt) : null,
      });
    }

    // Keep the original receiver aggregates at RAM freshness. This merge keeps
    // reception distance/identity metadata coherent and never lowers a DB max.
    const statistics = getReceiverStatistics();
    const current = statistics.getCurrentDaySnapshot();
    const currentHasData = current.uniqueAircraftCount > 0
      || current.maxConcurrentAircraft > 0
      || current.maxDistanceKm > 0
      || current.coverage.some((row) => row.maxDistanceKm > 0);
    if (currentHasData && current.date >= bounds.from && current.date < bounds.toExclusive) {
      for (const row of current.coverage) {
        if (row.maxDistanceKm <= 0) continue;
        const key = `${current.date}:${row.azimuthBucket}`;
        const persisted = coverageByKey.get(key);
        coverageByKey.set(key, {
          date: current.date,
          azimuthBucket: row.azimuthBucket,
          maxDistanceKm: Math.max(row.maxDistanceKm, persisted?.maxDistanceKm ?? 0),
        });
      }
      const reception = statistics.getDailyReceptionRecord();
      const persistedToday = statsByDate.get(current.date);
      statsByDate.set(current.date, mergeCurrentDayStats({
        date: current.date,
        currentMaxConcurrentAircraft: current.maxConcurrentAircraft,
        currentMaxDistanceKm: current.maxDistanceKm,
        currentReception: reception ? {
          date: reception.date,
          distanceKm: reception.distanceKm,
          icaoHex: reception.icaoHex,
          registration: reception.registration,
          recordedAt: reception.recordedAt,
          bearing: reception.bearing,
        } : null,
        persisted: persistedToday,
      }));
    }

    // Advanced aggregates are also kept in RAM between their throttled 30 s
    // writes. Overlay only monotonic maxima/current counters for today's date.
    const advanced = getReceiverAdvancedStatistics().getSnapshot(now);
    if (advanced.date >= bounds.from && advanced.date < bounds.toExclusive) {
      for (const row of advanced.altitudeCoverage) {
        if (row.maxDistanceKm <= 0) continue;
        const key = `${advanced.date}:${row.azimuthBucket}:${row.altitudeBand}`;
        const persisted = altitudeCoverageByKey.get(key);
        altitudeCoverageByKey.set(key, {
          date: advanced.date,
          azimuthBucket: row.azimuthBucket,
          altitudeBand: row.altitudeBand,
          maxDistanceKm: Math.max(row.maxDistanceKm, persisted?.maxDistanceKm ?? 0),
        });
      }
      const persisted = statsByDate.get(advanced.date) ?? {
        date: advanced.date,
        maxConcurrentAircraft: 0,
        maxDistanceKm: 0,
        maxDistanceIcaoHex: null,
        maxDistanceRegistration: null,
        maxDistanceBearing: null,
        maxDistanceAt: null,
        receiverMessagesCount: null,
        maxGroundSpeedKt: null,
        maxGroundSpeedIcaoHex: null,
        maxGroundSpeedRegistration: null,
        maxGroundSpeedCallsign: null,
        maxGroundSpeedAt: null,
      };
      const currentFastestWins = advanced.fastest !== null
        && (persisted.maxGroundSpeedKt === null || advanced.fastest.speedKt > persisted.maxGroundSpeedKt);
      statsByDate.set(advanced.date, {
        ...persisted,
        receiverMessagesCount: advanced.receiverMessagesCount ?? persisted.receiverMessagesCount,
        maxGroundSpeedKt: currentFastestWins ? advanced.fastest!.speedKt : persisted.maxGroundSpeedKt,
        maxGroundSpeedIcaoHex: currentFastestWins ? advanced.fastest!.icaoHex : persisted.maxGroundSpeedIcaoHex,
        maxGroundSpeedRegistration: currentFastestWins ? advanced.fastest!.registration : persisted.maxGroundSpeedRegistration,
        maxGroundSpeedCallsign: currentFastestWins ? advanced.fastest!.callsign : persisted.maxGroundSpeedCallsign,
        maxGroundSpeedAt: currentFastestWins ? advanced.fastest!.recordedAt : persisted.maxGroundSpeedAt,
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
      altitudeCoverageRows: [...altitudeCoverageByKey.values()],
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
