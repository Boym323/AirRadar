import "temporal-polyfill/full/global";
import { getPrisma } from "@/lib/server/db";
import { getAtcData } from "@/lib/server/providers";
import { matchSector } from "@/lib/server/atc-sector-service";
import type { AtcSector } from "@/lib/atc/types";

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
export interface SectorTransition { fromSectorId: string; toSectorId: string; count: number; }
export interface SectorTransitions { at: string; windowMinutes: 1 | 5 | 15; transitions: SectorTransition[]; totalTransitions: number; }
export type SectorHistoryBucket = "1m" | "5m" | "15m" | "1h";
export interface SectorTrafficHistoryPoint { time: string; aircraftCount: number; entering: number; leaving: number; climbing: number; descending: number; level: number; averageAltitude: number | null; averageGroundSpeed: number | null; }
export interface SectorTrafficHistoryCoverage { complete: boolean; truncated: boolean; positionsProcessed: number; chunksProcessed?: number; adaptiveSplits?: number; }
export interface SectorTrafficHistory { sectorId: string; from: string; to: string; bucket: SectorHistoryBucket; points: SectorTrafficHistoryPoint[]; peakAircraftCount: number; peakAircraftAt: string | null; averageAircraftCount: number; totalEntries: number; totalExits: number; busiestBucket: string | null; quietestBucket: string | null; averageGroundSpeed: number | null; averageAltitude: number | null; coverage: SectorTrafficHistoryCoverage; }
export interface SectorTrafficHistoryBatch { from: string; to: string; bucket: SectorHistoryBucket; sectors: Array<SectorTrafficHistory & { name: string }>; coverage: SectorTrafficHistoryCoverage; }

type Position = { id: number; flightId: number; recordedAt: Date | Temporal.Instant; lat: number; lon: number; altitude: number | null; groundSpeed: number | null; verticalRate: number | null };
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

const HISTORY_LIMITS: Record<SectorHistoryBucket, number> = { "1m": 24 * 60 * 60_000, "5m": 7 * 24 * 60 * 60_000, "15m": 30 * 24 * 60 * 60_000, "1h": 365 * 24 * 60 * 60_000 };
const HISTORY_MS: Record<SectorHistoryBucket, number> = { "1m": 60_000, "5m": 300_000, "15m": 900_000, "1h": 3_600_000 };
const MAX_POSITIONS_PER_CHUNK = 200_000;
const MAX_TOTAL_POSITIONS_PER_REQUEST = 5_000_000;
const MIN_CHUNK_MS = 1_000;
const INITIAL_CHUNK_MS = 60 * 60_000;
export function validateSectorHistoryRange(from: Date, to: Date, bucket: SectorHistoryBucket): void {
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from) throw new Error("Invalid history range");
  if (to.getTime() - from.getTime() > HISTORY_LIMITS[bucket]) throw new Error("History range exceeds bucket limit");
}
function supportedSectors(data: Awaited<ReturnType<typeof getAtcData>>): AtcSector[] { return data?.sectors.filter((s) => ["LKAATB","LKAAKV","LKAAMT","LKAAWL","LKAANL","LKAAN","LKAANSL","LKAAS"].includes(s.id)) ?? []; }
function bucketStart(time: number, size: number): number { return Math.floor(time / size) * size; }

/** Historical aircraftCount uses representative persisted snapshots: the mean distinct aircraft count per observed snapshot in each bucket. */
export async function getSectorTrafficHistory(input: { sectorId: string; from: Date; to: Date; bucket: SectorHistoryBucket }): Promise<SectorTrafficHistory | null> {
  const result = await getSectorTrafficHistoryBatch({ ...input, sectorIds: [input.sectorId] });
  return result.sectors[0] ?? null;
}

export async function getSectorTrafficHistoryBatch(input: { sectorIds?: string[]; from: Date; to: Date; bucket: SectorHistoryBucket }): Promise<SectorTrafficHistoryBatch> {
  validateSectorHistoryRange(input.from, input.to, input.bucket);
  const data = await getAtcData(); const available = supportedSectors(data);
  const ids = input.sectorIds?.length ? input.sectorIds : available.map((s) => s.id);
  if (ids.length > available.length || ids.some((id) => !/^[A-Z0-9]{6}$/.test(id))) throw new Error("Invalid sector selection");
  const sectors = ids.map((id) => available.find((s) => s.id === id)).filter((s): s is AtcSector => Boolean(s));
  if (sectors.length !== ids.length) throw new Error("Invalid sector selection");
  const db = getPrisma(); const size = HISTORY_MS[input.bucket];
  if (!db) { const coverage = { complete: true, truncated: false, positionsProcessed: 0 }; return { from: input.from.toISOString(), to: input.to.toISOString(), bucket: input.bucket, sectors: sectors.map((s) => ({ sectorId: s.id, name: s.name, from: input.from.toISOString(), to: input.to.toISOString(), bucket: input.bucket, points: [], peakAircraftCount: 0, peakAircraftAt: null, averageAircraftCount: 0, totalEntries: 0, totalExits: 0, busiestBucket: null, quietestBucket: null, averageGroundSpeed: null, averageAltitude: null, coverage })), coverage }; }
  type Acc = { snapshots: Map<number, Set<number>>; entering: number; leaving: number; climbing: number; descending: number; level: number; altitudeSum: number; altitudeCount: number; speedSum: number; speedCount: number };
  const accumulators = new Map<string, Acc>(); const previous = new Map<string, boolean>(); let positionsProcessed = 0; let chunksProcessed = 0; let adaptiveSplits = 0;
  const pending: Array<[number, number]> = [];
  for (let start = input.from.getTime(); start < input.to.getTime(); start += INITIAL_CHUNK_MS) pending.push([start, Math.min(input.to.getTime(), start + INITIAL_CHUNK_MS)]);
  while (pending.length) {
    const [start, end] = pending.shift()!;
    const chunkRows = await (db.orm.public.FlightPosition as unknown as Collection<Position>).where((r) => r.recordedAt.gte(new Date(start))).where((r) => r.recordedAt.lt(new Date(end))).orderBy({ recordedAt: "asc", id: "asc" }).limit(MAX_POSITIONS_PER_CHUNK + 1).all();
    if (chunkRows.length > MAX_POSITIONS_PER_CHUNK) {
      if (end - start <= MIN_CHUNK_MS) throw new Error("ATC_HISTORY_CHUNK_TOO_DENSE");
      const midpoint = start + Math.floor((end - start) / 2); pending.unshift([midpoint, end], [start, midpoint]); adaptiveSplits++; continue;
    }
    if (positionsProcessed + chunkRows.length > MAX_TOTAL_POSITIONS_PER_REQUEST) throw new Error("ATC_HISTORY_PROCESSING_LIMIT");
    for (const row of chunkRows) {
      const recordedAt = date(row.recordedAt); const bucket = bucketStart(recordedAt.getTime(), size); positionsProcessed++;
      for (const sector of sectors) {
        const key = `${sector.id}|${bucket}`; const acc = accumulators.get(key) ?? { snapshots: new Map(), entering: 0, leaving: 0, climbing: 0, descending: 0, level: 0, altitudeSum: 0, altitudeCount: 0, speedSum: 0, speedCount: 0 };
        const snapshot = acc.snapshots.get(recordedAt.getTime()) ?? new Set<number>(); snapshot.add(row.flightId); acc.snapshots.set(recordedAt.getTime(), snapshot);
        const inside = Boolean(matchSector(sector, { latitude: row.lat, longitude: row.lon, altitudeFt: row.altitude, observedAt: recordedAt })); const previousKey = `${key}|${row.flightId}`; const prior = previous.get(previousKey);
        if (prior !== undefined && prior !== inside) { if (inside) acc.entering++; else acc.leaving++; }
        previous.set(previousKey, inside);
        if (inside) { if ((row.verticalRate ?? 0) > 100) acc.climbing++; else if ((row.verticalRate ?? 0) < -100) acc.descending++; else acc.level++; if (row.altitude !== null) { acc.altitudeSum += row.altitude; acc.altitudeCount++; } if (row.groundSpeed !== null) { acc.speedSum += row.groundSpeed; acc.speedCount++; } }
        accumulators.set(key, acc);
      }
    }
    chunksProcessed++;
  }
  const coverage = { complete: true, truncated: false, positionsProcessed, chunksProcessed, adaptiveSplits };
  const histories = sectors.map((sector) => {
  const entries = [...accumulators.entries()].filter(([key]) => key.startsWith(`${sector.id}|`)).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })); const points = entries.map(([compound, acc]) => { const key = Number(compound.slice(sector.id.length + 1)); const counts = [...acc.snapshots.values()].map((snapshot) => snapshot.size); const count = counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : 0;
    return { time: new Date(key).toISOString(), aircraftCount: Number(count.toFixed(1)), entering: acc.entering, leaving: acc.leaving, climbing: acc.climbing, descending: acc.descending, level: acc.level, averageAltitude: acc.altitudeCount ? Math.round(acc.altitudeSum / acc.altitudeCount) : null, averageGroundSpeed: acc.speedCount ? Math.round(acc.speedSum / acc.speedCount) : null };
  });
  const peak = points.reduce((best, point) => !best || point.aircraftCount > best.aircraftCount ? point : best, null as SectorTrafficHistoryPoint | null); const avg = points.length ? points.reduce((sum, p) => sum + p.aircraftCount, 0) / points.length : 0; const mean = (field: "averageAltitude" | "averageGroundSpeed") => { const values = points.map((p) => p[field]).filter((v): v is number => v !== null); return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null; };
  return { sectorId: sector.id, name: sector.name, from: input.from.toISOString(), to: input.to.toISOString(), bucket: input.bucket, points, peakAircraftCount: peak?.aircraftCount ?? 0, peakAircraftAt: peak?.time ?? null, averageAircraftCount: Number(avg.toFixed(1)), totalEntries: points.reduce((sum, p) => sum + p.entering, 0), totalExits: points.reduce((sum, p) => sum + p.leaving, 0), busiestBucket: peak?.time ?? null, quietestBucket: points.reduce((best, p) => !best || p.aircraftCount < best.aircraftCount ? p : best, null as SectorTrafficHistoryPoint | null)?.time ?? null, averageGroundSpeed: mean("averageGroundSpeed"), averageAltitude: mean("averageAltitude") };
  });
  return { from: input.from.toISOString(), to: input.to.toISOString(), bucket: input.bucket, sectors: histories.map((history) => ({ ...history, coverage })), coverage };
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

export async function getSectorTransitions(input: { at?: string | Date; windowMinutes: 1 | 5 | 15 }): Promise<SectorTransitions> {
  const at = input.at ? new Date(input.at) : new Date();
  if (!Number.isFinite(at.getTime())) throw new Error("Invalid UTC timestamp");
  const data = await getAtcData();
  const sectors = data?.sectors.filter((s) => ["LKAATB","LKAAKV","LKAAMT","LKAAWL","LKAAW","LKAANL","LKAAN","LKAANSL","LKAAS"].includes(s.id)) ?? [];
  const db = getPrisma();
  if (!db) return { at: at.toISOString(), windowMinutes: input.windowMinutes, transitions: [], totalTransitions: 0 };
  const start = Temporal.Instant.fromEpochMilliseconds(at.getTime() - input.windowMinutes * 60000 - 120000);
  const end = Temporal.Instant.fromEpochMilliseconds(at.getTime() + 1);
  const positions = await (db.orm.public.FlightPosition as unknown as Collection<Position>).where((r) => r.recordedAt.gte(start)).where((r) => r.recordedAt.lt(end)).limit(40000).all();
  const byFlight = new Map<number, Position[]>();
  for (const position of positions) { const list = byFlight.get(position.flightId) ?? []; list.push(position); byFlight.set(position.flightId, list); }
  const counts = new Map<string, number>();
  for (const flightPositions of byFlight.values()) {
    const ordered = flightPositions.filter((p) => date(p.recordedAt) <= at).sort((a, b) => date(a.recordedAt).getTime() - date(b.recordedAt).getTime());
    const states: Array<{ sector: string; at: number }> = [];
    for (const position of ordered) {
      const match = sectors.find((sector) => matchSector(sector, { latitude: position.lat, longitude: position.lon, altitudeFt: position.altitude, observedAt: date(position.recordedAt) }));
      const sector = match?.id;
      if (!sector) continue;
      const last = states.at(-1);
      if (last?.sector === sector) continue;
      // A short A→B→A boundary jitter is treated as one stable observation.
      if (states.length >= 2 && states.at(-2)?.sector === sector && date(position.recordedAt).getTime() - (last?.at ?? 0) <= 30000) { states.pop(); continue; }
      states.push({ sector, at: date(position.recordedAt).getTime() });
    }
    for (let i = 1; i < states.length; i++) {
      const from = states[i - 1]; const to = states[i];
      if (to.at < at.getTime() - input.windowMinutes * 60000 || from.sector === to.sector) continue;
      const key = `${from.sector}|${to.sector}`; counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const transitions = [...counts.entries()].map(([key, count]) => { const [fromSectorId, toSectorId] = key.split("|"); return { fromSectorId, toSectorId, count }; }).sort((a, b) => b.count - a.count || a.fromSectorId.localeCompare(b.fromSectorId) || a.toSectorId.localeCompare(b.toSectorId));
  return { at: at.toISOString(), windowMinutes: input.windowMinutes, transitions, totalTransitions: transitions.reduce((sum, transition) => sum + transition.count, 0) };
}
