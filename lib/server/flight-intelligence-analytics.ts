import "temporal-polyfill/full/global";
import { param } from "@prisma/orm-postgres/relational-core/expression";
import { getAppTimezone } from "@/lib/server/config";
import { getPrisma } from "@/lib/server/db";
import { statisticsTrafficBounds } from "@/lib/server/statistics-traffic";
import type { FlightEventType } from "@/lib/intelligence/types";
import type {
  IntelligenceAnalyticsCount,
  IntelligenceAnalyticsRange,
  IntelligenceAnalyticsResponse,
  IntelligenceAnalyticsTypeCount,
} from "@/lib/intelligence-analytics";

interface NamedCountRow {
  name: string | null;
  count: number | string;
}

interface TypeCountRow {
  type: FlightEventType;
  count: number | string;
}

interface HourRow {
  bucket: number | string;
  count: number | string;
}

const RANKING_LIMIT = 10;

function count(value: number | string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function ranking(rows: NamedCountRow[]): IntelligenceAnalyticsCount[] {
  const merged = new Map<string, number>();
  for (const row of rows) {
    const name = row.name?.trim().toUpperCase();
    const value = count(row.count);
    if (!name || value <= 0) continue;
    merged.set(name, (merged.get(name) ?? 0) + value);
  }
  return [...merged.entries()]
    .map(([name, value]) => ({ name, count: value }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, RANKING_LIMIT);
}

function unavailable(
  range: IntelligenceAnalyticsRange,
  now: Date,
  timezone: string,
): IntelligenceAnalyticsResponse {
  const bounds = statisticsTrafficBounds(range, now, timezone);
  return {
    source: "unavailable",
    range,
    from: bounds.fromKey,
    to: bounds.toKey,
    timezone,
    generatedAt: now.toISOString(),
    totalEvents: null,
    byType: [],
    hourly: [],
    topAircraft: [],
    topAirports: [],
    topSectors: [],
  };
}

export function aggregateIntelligenceAnalytics(options: {
  range: IntelligenceAnalyticsRange;
  now: Date;
  timezone: string;
  typeRows: TypeCountRow[];
  hourRows: HourRow[];
  aircraftRows: NamedCountRow[];
  airportRows: NamedCountRow[];
  sectorRows: NamedCountRow[];
}): IntelligenceAnalyticsResponse {
  const bounds = statisticsTrafficBounds(options.range, options.now, options.timezone);
  const byType = options.typeRows
    .map((row): IntelligenceAnalyticsTypeCount => ({ type: row.type, count: count(row.count) }))
    .filter((row) => row.count > 0)
    .sort((left, right) => right.count - left.count || left.type.localeCompare(right.type));

  const hours = new Map<number, number>();
  for (const row of options.hourRows) {
    const hour = Number(row.bucket);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue;
    hours.set(hour, (hours.get(hour) ?? 0) + count(row.count));
  }
  const hourly = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: hours.get(hour) ?? 0,
  }));

  return {
    source: "postgres",
    range: options.range,
    from: bounds.fromKey,
    to: bounds.toKey,
    timezone: options.timezone,
    generatedAt: options.now.toISOString(),
    totalEvents: byType.reduce((sum, row) => sum + row.count, 0),
    byType,
    hourly,
    topAircraft: ranking(options.aircraftRows),
    topAirports: ranking(options.airportRows),
    topSectors: ranking(options.sectorRows),
  };
}

/**
 * Date-bounded FlightEvent aggregation. PostgreSQL performs the temporal
 * grouping and ORM groupBy handles semantic rankings; raw event rows are never
 * returned to the browser and the position-history table is not queried.
 */
export async function getFlightIntelligenceAnalytics(
  range: IntelligenceAnalyticsRange,
  now = new Date(),
  timezone = getAppTimezone(),
): Promise<IntelligenceAnalyticsResponse> {
  const database = getPrisma();
  if (!database) return unavailable(range, now, timezone);

  const bounds = statisticsTrafficBounds(range, now, timezone);
  const schema = database.orm.public;
  const boundedEvents = () => schema.FlightEvent
    .where((event) => event.occurredAt.gte(bounds.from))
    .where((event) => event.occurredAt.lte(bounds.to));

  try {
    const timezoneParam = param(timezone, { codecId: "pg/text@1" });
    const hourPlan = database.sql.public.flightEvent
      .select("bucket", (fields, fns) =>
        fns.raw`EXTRACT(HOUR FROM ${fields.occurredAt} AT TIME ZONE ${timezoneParam})`.returns("pg/numeric@1")
      )
      .select("count", (fields, fns) => fns.count(fields.id))
      .where((fields, fns) =>
        fns.and(
          fns.gte(fields.occurredAt, bounds.from),
          fns.lte(fields.occurredAt, bounds.to),
        )
      )
      .groupBy("bucket")
      .orderBy("bucket", { direction: "asc" })
      .build();

    const [typeRows, aircraftRaw, airportRaw, sectorRaw, hourRows] = await Promise.all([
      boundedEvents().groupBy("type").aggregate((aggregate) => ({ count: aggregate.count() })) as Promise<TypeCountRow[]>,
      boundedEvents().groupBy("icaoHex").aggregate((aggregate) => ({ count: aggregate.count() })) as Promise<Array<{ icaoHex: string | null; count: number }>>,
      boundedEvents().groupBy("airportIcao").aggregate((aggregate) => ({ count: aggregate.count() })) as Promise<Array<{ airportIcao: string | null; count: number }>>,
      boundedEvents().groupBy("sectorId").aggregate((aggregate) => ({ count: aggregate.count() })) as Promise<Array<{ sectorId: string | null; count: number }>>,
      database.runtime().query(hourPlan),
    ]);

    return aggregateIntelligenceAnalytics({
      range,
      now,
      timezone,
      typeRows,
      hourRows: hourRows as HourRow[],
      aircraftRows: aircraftRaw.map((row) => ({ name: row.icaoHex, count: row.count })),
      airportRows: airportRaw.map((row) => ({ name: row.airportIcao, count: row.count })),
      sectorRows: sectorRaw.map((row) => ({ name: row.sectorId, count: row.count })),
    });
  } catch (error) {
    console.error("AirRadar flight intelligence analytics query failed", error);
    return unavailable(range, now, timezone);
  }
}
