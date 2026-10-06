import "temporal-polyfill/full/global";
import { getAppTimezone } from "@/lib/server/config";
import { getPrisma } from "@/lib/server/db";
import type { StatisticsHeatmapRange, StatisticsHeatmapResponse } from "@/lib/statistics-heatmap";

const GRID_SIZE = 28;
const POSITION_LIMIT = 60_000;
type HeatmapRows = Array<{ lat: number; lon: number }>;
type HeatmapTable = { where(filter: { recordedAt: { gte: Date; lte: Date } }): { select(...fields: string[]): { limit(value: number): { all(): Promise<HeatmapRows> } } } };

function days(range: StatisticsHeatmapRange): number { return range === "30d" ? 30 : range === "7d" ? 7 : 1; }
export function statisticsHeatmapBounds(range: StatisticsHeatmapRange, now = new Date(), timezone = getAppTimezone()): { from: Date; to: Date } {
  const current = Temporal.Instant.fromEpochMilliseconds(now.getTime()).toZonedDateTimeISO(timezone);
  const start = current.startOfDay().subtract({ days: days(range) - 1 }).toInstant();
  return { from: new Date(start.epochMilliseconds), to: now };
}

export async function getStatisticsHeatmap(range: StatisticsHeatmapRange): Promise<StatisticsHeatmapResponse> {
  const bounds = statisticsHeatmapBounds(range);
  const unavailable = { source: "unavailable" as const, range, from: bounds.from.toISOString(), to: bounds.to.toISOString(), cells: [], sampledPositions: 0, maxCellCount: 0 };
  const database = getPrisma();
  if (!database) return unavailable;
  try {
    const table = database.orm.public.FlightPosition as unknown as HeatmapTable;
    const rows = await table
      .where({ recordedAt: { gte: bounds.from, lte: bounds.to } })
      .select("lat", "lon")
      .limit(POSITION_LIMIT + 1)
      .all();
    const cells = new Map<string, number>();
    for (const row of rows.slice(0, POSITION_LIMIT)) {
      if (!Number.isFinite(row.lat) || !Number.isFinite(row.lon) || row.lat < -90 || row.lat > 90 || row.lon < -180 || row.lon > 180) continue;
      const x = Math.min(GRID_SIZE - 1, Math.max(0, Math.floor(((row.lon + 180) / 360) * GRID_SIZE)));
      const y = Math.min(GRID_SIZE - 1, Math.max(0, Math.floor(((90 - row.lat) / 180) * GRID_SIZE)));
      const key = `${x}:${y}`; cells.set(key, (cells.get(key) ?? 0) + 1);
    }
    const maxCellCount = Math.max(...cells.values(), 0);
    return { source: "postgres", range, from: bounds.from.toISOString(), to: bounds.to.toISOString(), sampledPositions: Math.min(rows.length, POSITION_LIMIT), maxCellCount, cells: [...cells.entries()].map(([key, count]) => { const [x, y] = key.split(":").map(Number); return { x, y, count, intensity: maxCellCount ? Number((count / maxCellCount).toFixed(4)) : 0 }; }) };
  } catch { return unavailable; }
}
