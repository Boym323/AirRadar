import "temporal-polyfill/full/global";
import { param } from "@prisma/orm-postgres/relational-core/expression";
import { getAppTimezone } from "@/lib/server/config";
import { getPrisma } from "@/lib/server/db";
import { statisticsTrafficBounds } from "@/lib/server/statistics-traffic";
import type {
  TrafficProfileRange,
  TrafficProfileResponse,
} from "@/lib/statistics-traffic-profile";

interface AggregateBucketRow {
  bucket: string | number;
  count: string | number;
}

function bucketNumber(value: string | number): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function countNumber(value: string | number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

export function aggregateTrafficProfileRows(options: {
  range: TrafficProfileRange;
  now: Date;
  timezone: string;
  hourlyRows: AggregateBucketRow[];
  weekdayRows: AggregateBucketRow[];
}): TrafficProfileResponse {
  const bounds = statisticsTrafficBounds(options.range, options.now, options.timezone);
  const hourlyCounts = new Map<number, number>();
  for (const row of options.hourlyRows) {
    const hour = bucketNumber(row.bucket);
    if (hour === null || hour < 0 || hour > 23) continue;
    hourlyCounts.set(hour, (hourlyCounts.get(hour) ?? 0) + countNumber(row.count));
  }

  const weekdayCounts = new Map<number, number>();
  for (const row of options.weekdayRows) {
    const weekday = bucketNumber(row.bucket);
    if (weekday === null || weekday < 1 || weekday > 7) continue;
    weekdayCounts.set(weekday, (weekdayCounts.get(weekday) ?? 0) + countNumber(row.count));
  }

  const hourly = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: hourlyCounts.get(hour) ?? 0,
  }));
  const weekdays = Array.from({ length: 7 }, (_, index) => ({
    weekday: index + 1,
    count: weekdayCounts.get(index + 1) ?? 0,
  }));

  return {
    source: "postgres",
    range: options.range,
    from: bounds.fromKey,
    to: bounds.toKey,
    timezone: options.timezone,
    generatedAt: options.now.toISOString(),
    observedFlights: hourly.reduce((sum, item) => sum + item.count, 0),
    hourly,
    weekdays,
  };
}

function unavailableProfile(
  range: TrafficProfileRange,
  now: Date,
  timezone: string,
): TrafficProfileResponse {
  const bounds = statisticsTrafficBounds(range, now, timezone);
  return {
    source: "unavailable",
    range,
    from: bounds.fromKey,
    to: bounds.toKey,
    timezone,
    generatedAt: now.toISOString(),
    observedFlights: null,
    hourly: [],
    weekdays: [],
  };
}

/**
 * Bounded receiver-observed Flight aggregation. The canonical timestamp is
 * Flight.startTime, matching the existing traffic statistics/history layer.
 * PostgreSQL performs both groupings; raw per-flight rows never reach Node.
 * The position-history table is intentionally not queried.
 */
export async function getStatisticsTrafficProfile(
  range: TrafficProfileRange,
  now = new Date(),
  timezone = getAppTimezone(),
): Promise<TrafficProfileResponse> {
  const database = getPrisma();
  if (!database) return unavailableProfile(range, now, timezone);

  const bounds = statisticsTrafficBounds(range, now, timezone);
  const timezoneParam = param(timezone, { codecId: "pg/text@1" });

  try {
    const hourlyPlan = database.sql.public.flight
      .select("bucket", (fields, fns) =>
        fns.raw`EXTRACT(HOUR FROM ${fields.startTime} AT TIME ZONE ${timezoneParam})`.returns("pg/numeric@1")
      )
      .select("count", (fields, fns) => fns.count(fields.id))
      .where((fields, fns) =>
        fns.and(
          fns.gte(fields.startTime, bounds.from),
          fns.lte(fields.startTime, bounds.to),
        )
      )
      .groupBy("bucket")
      .orderBy("bucket", { direction: "asc" })
      .build();

    const weekdayPlan = database.sql.public.flight
      .select("bucket", (fields, fns) =>
        fns.raw`EXTRACT(ISODOW FROM ${fields.startTime} AT TIME ZONE ${timezoneParam})`.returns("pg/numeric@1")
      )
      .select("count", (fields, fns) => fns.count(fields.id))
      .where((fields, fns) =>
        fns.and(
          fns.gte(fields.startTime, bounds.from),
          fns.lte(fields.startTime, bounds.to),
        )
      )
      .groupBy("bucket")
      .orderBy("bucket", { direction: "asc" })
      .build();

    const runtime = database.runtime();
    const [hourlyRows, weekdayRows] = await Promise.all([
      runtime.query(hourlyPlan),
      runtime.query(weekdayPlan),
    ]);

    return aggregateTrafficProfileRows({
      range,
      now,
      timezone,
      hourlyRows: hourlyRows as AggregateBucketRow[],
      weekdayRows: weekdayRows as AggregateBucketRow[],
    });
  } catch (error) {
    console.error("AirRadar traffic profile query failed", error);
    return unavailableProfile(range, now, timezone);
  }
}
