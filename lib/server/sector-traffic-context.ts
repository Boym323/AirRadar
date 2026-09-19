import "temporal-polyfill/full/global";
import { getPrisma } from "@/lib/server/db";
import { getAtcData } from "@/lib/server/providers";
import { matchSector } from "@/lib/server/atc-sector-service";
import type { AtcLookup, AtcSector } from "@/lib/atc/types";

export type TrafficLevel = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
export const SECTOR_TRAFFIC_THRESHOLDS = { low: 1, medium: 5, high: 10, veryHigh: 20 } as const;

export interface SectorTrafficContext {
  sectorId: string; name: string; at: string;
  vertical: { lower: string | null; upper: string | null };
  traffic: { aircraftCount: number; entering1m: number; entering5m: number; entering15m: number; leaving1m: number; leaving5m: number; leaving15m: number; climbing: number; descending: number; level: number; unknownAltitude: number; averageAltitude: number | null; medianAltitude: number | null; averageGroundSpeed: number | null };
  trafficLevel: TrafficLevel;
  frequencies: Array<{ channel: string; carrierHz: number | null; spacing: "KHZ_25" | "KHZ_8_33" | "UNKNOWN"; role: "PRIMARY" | "RESERVE" | "OTHER" }>;
  source: { airspace: string; traffic: string };
}

type Position = { flightId: number; recordedAt: Date | Temporal.Instant; lat: number; lon: number; altitude: number | null; groundSpeed: number | null; verticalRate: number | null };
type Row = { id: number; callsign: string | null; aircraft: { icaoHex: string }; positions: Position[] };
type Field = { lte(v: unknown): unknown; gte(v: unknown): unknown; lt(v: unknown): unknown; asc(): unknown; desc(): unknown; };
type Collection<T> = { where(p: (row: Record<string, Field>) => unknown): Collection<T>; orderBy(v: unknown): Collection<T>; limit(n: number): Collection<T>; include(n: string, cb: (q: Collection<unknown>) => Collection<unknown>): Collection<T>; all(): Promise<T[]> };

function date(value: Date | Temporal.Instant): Date { return value instanceof Date ? value : new Date(value.epochMilliseconds); }
function level(count: number): TrafficLevel { if (!count) return "NONE"; if (count < SECTOR_TRAFFIC_THRESHOLDS.medium) return "LOW"; if (count < SECTOR_TRAFFIC_THRESHOLDS.high) return "MEDIUM"; if (count < SECTOR_TRAFFIC_THRESHOLDS.veryHigh) return "HIGH"; return "VERY_HIGH"; }
function vertical(value: number | null): string | null { return value === null ? null : value >= 18000 ? `FL${Math.round(value / 100)}` : `${value} FT`; }
function frequencyLabel(f: AtcSector["frequencies"][number]): { channel: string; carrierHz: number | null; spacing: "KHZ_25" | "KHZ_8_33" | "UNKNOWN" } {
  const channel = f.label?.trim() || f.frequencyMhz.toFixed(3);
  return { channel, carrierHz: Math.round(f.frequencyMhz * 1_000_000), spacing: "KHZ_25" };
}
function context(sector: AtcSector, at: Date, positions: Position[], all: Position[]): SectorTrafficContext {
  const inside = positions.filter((p) => matchSector(sector, { latitude: p.lat, longitude: p.lon, altitudeFt: p.altitude, observedAt: date(p.recordedAt) }));
  const values = inside.map((p) => p.altitude).filter((v): v is number => v !== null).sort((a, b) => a - b);
  const speeds = inside.map((p) => p.groundSpeed).filter((v): v is number => v !== null);
  const countWindow = (minutes: number, kind: "enter" | "leave") => [...new Set(all.filter((p) => { const delta = at.getTime() - date(p.recordedAt).getTime(); if (delta < 0 || delta > minutes * 60000) return false; const current = Boolean(matchSector(sector, { latitude: p.lat, longitude: p.lon, altitudeFt: p.altitude, observedAt: date(p.recordedAt) })); const nearby = all.filter((q) => q.flightId === p.flightId && date(q.recordedAt) < date(p.recordedAt) && date(p.recordedAt).getTime() - date(q.recordedAt).getTime() <= 90000).sort((a, b) => date(b.recordedAt).getTime() - date(a.recordedAt).getTime())[0]; const previous = nearby ? Boolean(matchSector(sector, { latitude: nearby.lat, longitude: nearby.lon, altitudeFt: nearby.altitude, observedAt: date(nearby.recordedAt) })) : false; return kind === "enter" ? current && !previous : !current && previous; }).map((p) => p.flightId))].length;
  const climbing = inside.filter((p) => (p.verticalRate ?? 0) > 100).length;
  const descending = inside.filter((p) => (p.verticalRate ?? 0) < -100).length;
  return { sectorId: sector.id, name: sector.name, at: at.toISOString(), vertical: { lower: vertical(sector.lowerAltitudeFt), upper: vertical(sector.upperAltitudeFt) }, traffic: { aircraftCount: inside.length, entering1m: countWindow(1, "enter"), entering5m: countWindow(5, "enter"), entering15m: countWindow(15, "enter"), leaving1m: countWindow(1, "leave"), leaving5m: countWindow(5, "leave"), leaving15m: countWindow(15, "leave"), climbing, descending, level: Math.max(0, inside.length - climbing - descending), unknownAltitude: inside.filter((p) => p.altitude === null).length, averageAltitude: values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null, medianAltitude: values.length ? values[Math.floor(values.length / 2)] : null, averageGroundSpeed: speeds.length ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : null }, trafficLevel: level(inside.length), frequencies: sector.frequencies.map((f, i) => ({ ...frequencyLabel(f), role: i === 0 ? "PRIMARY" : "RESERVE" })), source: { airspace: sector.source || "CZ_EAIP", traffic: "AIRRADAR_ADSB" } };
}

export async function getAllSectorTrafficContext(atValue?: string | Date): Promise<SectorTrafficContext[]> {
  const at = atValue ? new Date(atValue) : new Date(); if (!Number.isFinite(at.getTime())) throw new Error("Invalid UTC timestamp");
  const data = await getAtcData(); const sectors = data?.sectors.filter((s) => /^LKAA(?:TB|KV|MT|WL|W|NL|N|NSL|S)L?$/.test(s.id) || ["LKAATB","LKAAKV","LKAAMT","LKAAWL","LKAAW","LKAANL","LKAAN","LKAANSL","LKAAS"].includes(s.id)) ?? [];
  const db = getPrisma(); if (!db) return sectors.map((s) => context(s, at, [], []));
  const start = Temporal.Instant.fromEpochMilliseconds(at.getTime() - 15 * 60000); const end = Temporal.Instant.fromEpochMilliseconds(at.getTime() + 60000);
  const positions = await (db.orm.public.FlightPosition as unknown as Collection<Position>).where((r) => r.recordedAt.gte(start)).where((r) => r.recordedAt.lt(end)).limit(40000).all();
  const latest = new Map<number, Position>();
  for (const position of positions) if (date(position.recordedAt) <= at && at.getTime() - date(position.recordedAt).getTime() <= 120000) {
    const prior = latest.get(position.flightId); if (!prior || date(prior.recordedAt) < date(position.recordedAt)) latest.set(position.flightId, position);
  }
  const current = [...latest.values()];
  return sectors.map((s) => context(s, at, current, positions));
}

export async function getSectorTrafficContext(sectorId: string, at?: string | Date): Promise<SectorTrafficContext | null> { return (await getAllSectorTrafficContext(at)).find((s) => s.sectorId === sectorId) ?? null; }
