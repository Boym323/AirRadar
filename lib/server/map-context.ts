import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { getPrisma } from "@/lib/server/db";
import { SAMPLE_AIRPORTS } from "@/lib/server/airport-catalog";
import { getAirspaceActivity } from "@/lib/server/airspace-activity";
import type { AirspacePlanSnapshot } from "@/lib/airspace-activity/types";
import type { MetarMapObservation } from "@/lib/weather/types";
import { isWindLevel, defaultWindAloftProvider, type WindAloftResponse, type WindLevelHpa } from "@/lib/server/wind-aloft";
import { defaultAviationWeatherProvider } from "@/lib/server/aviation-weather-provider";
import { defaultWeatherRadarProvider, parseWeatherRadarFilename } from "@/lib/server/weather-radar/provider";
import type { WeatherRadarFrame } from "@/lib/server/weather-radar/types";
import { getMapContextPollIntervalMs, getMapContextRetentionDays, getWeatherRadarArchiveDir, getWeatherRadarArchiveMaxBytes, isAviationWeatherEnabled } from "@/lib/server/config";
import { resolveIntervalContains, resolveNearestBefore, resolveNearestValid } from "@/lib/map-time/temporal";
import { normalizeInstant, unavailableResolution, type MapContextSourceKind, type TemporalResolution } from "@/lib/map-time/types";

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const RADAR_MAX_DELTA_MS = 10 * 60_000;
const METAR_MAX_AGE_MS = 2 * 60 * 60_000;
const WIND_MAX_DELTA_MS = 60 * 60_000;
const MAX_METAR_ENTRIES = 100_000;
const MAX_WIND_ENTRIES = 1_024;
const MAX_AUP_ENTRIES = 512;

export interface HistoricalMetarObservation extends Omit<MetarMapObservation, "observedAt"> {
  observedAt: string;
  retrievedAt: string;
  source: "Aviation Weather Center";
}

export interface HistoricalWindSnapshot extends WindAloftResponse {
  archivedAt: string;
}

export interface HistoricalAupSnapshot extends AirspacePlanSnapshot {
  archivedAt: string;
}

export interface ResolvedLayer<T> {
  available: boolean;
  source: MapContextSourceKind;
  provider: string;
  resolution: TemporalResolution;
  data: T | null;
  reason?: "NO_ARCHIVE" | "OUTSIDE_TOLERANCE" | "NO_VALID_REVISION" | "DISABLED";
}

export interface MapContextManifest {
  requestedAt: string;
  mode: "LIVE" | "HISTORICAL";
  radar: ResolvedLayer<WeatherRadarFrame>;
  metar: ResolvedLayer<{ stations: number }>;
  wind: ResolvedLayer<{ model: string; modelRun: string | null; validAt: string; levelHpa: WindLevelHpa }>;
  aup: ResolvedLayer<{ validFrom: string; validTo: string; windows: number }>;
  sigmet: ResolvedLayer<null>;
}

interface PersistedFile<T> { version: 1; savedAt: string; entries: T[]; }

class JsonArchive<T> {
  private entries: T[] | null = null;
  private writeQueue = Promise.resolve();

  constructor(private readonly file: string, private readonly maxEntries: number, private readonly isEntry: (value: unknown) => value is T) {}

  async read(): Promise<T[]> {
    if (this.entries) return [...this.entries];
    try {
      const parsed = JSON.parse(await readFile(this.file, "utf8")) as Partial<PersistedFile<unknown>>;
      this.entries = Array.isArray(parsed.entries) ? parsed.entries.filter(this.isEntry).slice(-this.maxEntries) : [];
    } catch {
      this.entries = [];
    }
    return [...this.entries];
  }

  async replace(entries: T[]): Promise<void> {
    this.entries = entries.slice(-this.maxEntries);
    const snapshot = { version: 1 as const, savedAt: new Date().toISOString(), entries: this.entries } satisfies PersistedFile<T>;
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(path.dirname(this.file), { recursive: true, mode: 0o750 });
      const temporary = `${this.file}.tmp`;
      await writeFile(temporary, JSON.stringify(snapshot), { mode: 0o600 });
      await rename(temporary, this.file);
    }).catch((error) => console.warn(`[map-context] archive write failed (${path.basename(this.file)})`, error instanceof Error ? error.message : error));
    await this.writeQueue;
  }

  async diagnostics(timestampField: (entry: T) => string | null): Promise<{ oldest: string | null; latest: string | null; entries: number; fileBytes: number | null }> {
    const entries = await this.read();
    const timestamps = entries.map(timestampField).filter((value): value is string => value !== null && Number.isFinite(Date.parse(value))).sort((left, right) => Date.parse(left) - Date.parse(right));
    let fileBytes: number | null = null;
    try { fileBytes = (await stat(this.file)).size; } catch { /* missing archive is a valid empty state */ }
    return { oldest: timestamps[0] ?? null, latest: timestamps.at(-1) ?? null, entries: entries.length, fileBytes };
  }
}

function archiveMetadataPath(name: string): string { return path.join(path.dirname(getWeatherRadarArchiveDir()), name); }
function validString(value: unknown): value is string { return typeof value === "string" && value.length <= 100_000; }
function validDateString(value: unknown): value is string { return validString(value) && Number.isFinite(Date.parse(value)); }
function isMetarEntry(value: unknown): value is HistoricalMetarObservation {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<HistoricalMetarObservation>;
  return typeof candidate.stationId === "string" && validDateString(candidate.observedAt) && validDateString(candidate.retrievedAt) && typeof candidate.lat === "number" && typeof candidate.lon === "number";
}
function isWindEntry(value: unknown): value is HistoricalWindSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<HistoricalWindSnapshot>;
  return validDateString(candidate.validAt) && validDateString(candidate.fetchedAt) && typeof candidate.levelHpa === "number" && Array.isArray(candidate.points);
}
function isAupEntry(value: unknown): value is HistoricalAupSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<HistoricalAupSnapshot>;
  return validDateString(candidate.archivedAt) && Array.isArray(candidate.windows);
}

function radarDateFromId(id: string): Date | null {
  const parsed = parseWeatherRadarFilename(`pacz2gmaps3.z_max3d.${id.slice(0, 8)}.${id.slice(8)}.0.png`, Number.MAX_SAFE_INTEGER);
  return parsed ? new Date(parsed.observedAt) : null;
}

function radarPath(id: string): string {
  const date = radarDateFromId(id);
  if (!date) throw new Error("Invalid radar frame id");
  return path.join(getWeatherRadarArchiveDir(), String(date.getUTCFullYear()), String(date.getUTCMonth() + 1).padStart(2, "0"), String(date.getUTCDate()).padStart(2, "0"), `${id}.png`);
}

function validPng(bytes: Uint8Array): boolean { return bytes.length > PNG_SIGNATURE.length && PNG_SIGNATURE.every((value, index) => bytes[index] === value); }

export function getMapContextMaxAgeMs(): number { return getMapContextRetentionDays() * 24 * 60 * 60_000; }

export class WeatherRadarArchiveService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private polling: Promise<void> | null = null;
  private archivedCount = 0;
  private oldest: string | null = null;
  private latest: string | null = null;
  private failures = 0;
  private lastWriteAt: string | null = null;
  private diagnosticsCache: { at: number; value: Awaited<ReturnType<WeatherRadarArchiveService["diagnostics"]>> } | null = null;

  async start(): Promise<void> {
    if (this.timer) return;
    void this.poll();
    this.timer = setInterval(() => { void this.poll(); }, getMapContextPollIntervalMs());
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.polling;
  }

  async poll(): Promise<void> {
    if (this.polling) return this.polling;
    this.polling = this.archiveCatalog().catch((error) => {
      this.failures += 1;
      console.warn("[map-context] radar archive degraded", error instanceof Error ? error.message : error);
    }).finally(() => { this.polling = null; });
    return this.polling;
  }

  async resolve(at: string): Promise<ResolvedLayer<WeatherRadarFrame>> {
    const requestedAt = normalizeInstant(at);
    const frames = await this.listFrames();
    const selected = resolveNearestBefore(frames, requestedAt, RADAR_MAX_DELTA_MS);
    if (!selected.record) return { available: false, source: "OBSERVED", provider: "CHMI", resolution: selected.resolution, data: null, reason: frames.length ? "OUTSIDE_TOLERANCE" : "NO_ARCHIVE" };
    const frame = { id: selected.record.id, observedAt: selected.record.at, provider: "CHMI", product: "MAX_Z_MASKED", imageUrl: `/api/map-context/radar/frame/${selected.record.id}`, latest: false, stale: false } satisfies WeatherRadarFrame;
    return { available: true, source: "OBSERVED", provider: "CHMI", resolution: selected.resolution, data: frame };
  }

  async getFrame(id: string): Promise<Uint8Array | null> {
    try {
      const bytes = new Uint8Array(await readFile(radarPath(id)));
      return validPng(bytes) ? bytes : null;
    } catch { return null; }
  }

  async listFrames(): Promise<Array<{ id: string; at: string }>> {
    const root = getWeatherRadarArchiveDir();
    const found: Array<{ id: string; at: string }> = [];
    const years = await readdir(root, { withFileTypes: true }).catch(() => []);
    for (const year of years) {
      if (!year.isDirectory() || !/^\d{4}$/.test(year.name)) continue;
      const months = await readdir(path.join(root, year.name), { withFileTypes: true }).catch(() => []);
      for (const month of months) {
        if (!month.isDirectory() || !/^\d{2}$/.test(month.name)) continue;
        const days = await readdir(path.join(root, year.name, month.name), { withFileTypes: true }).catch(() => []);
        for (const day of days) {
          if (!day.isDirectory() || !/^\d{2}$/.test(day.name)) continue;
          const files = await readdir(path.join(root, year.name, month.name, day.name), { withFileTypes: true }).catch(() => []);
          for (const file of files) {
            if (!file.isFile() || !/^\d{12}\.png$/.test(file.name)) continue;
            const id = file.name.slice(0, -4); const date = radarDateFromId(id);
            if (date) found.push({ id, at: date.toISOString() });
          }
        }
      }
    }
    const minimum = Date.now() - getMapContextMaxAgeMs();
    return [...new Map(found.filter((frame) => Date.parse(frame.at) >= minimum).map((frame) => [frame.id, frame])).values()].sort((left, right) => left.at.localeCompare(right.at));
  }

  async diagnostics(): Promise<{ status: "online" | "degraded" | "offline"; oldest: string | null; latest: string | null; frames: number; diskBytes: number | null; failures: number; lastWriteAt: string | null }> {
    if (this.diagnosticsCache && Date.now() - this.diagnosticsCache.at < 30_000) return this.diagnosticsCache.value;
    const frames = await this.listFrames();
    let diskBytes = 0;
    for (const frame of frames) { try { diskBytes += (await stat(radarPath(frame.id))).size; } catch { /* ignore disappearing files */ } }
    const value = { status: this.failures && !frames.length ? "offline" as const : this.failures ? "degraded" as const : "online" as const, oldest: frames[0]?.at ?? this.oldest, latest: frames.at(-1)?.at ?? this.latest, frames: frames.length || this.archivedCount, diskBytes, failures: this.failures, lastWriteAt: this.lastWriteAt };
    this.diagnosticsCache = { at: Date.now(), value };
    return value;
  }

  private async archiveCatalog(): Promise<void> {
    const catalog = await defaultWeatherRadarProvider.getFrames();
    const existing = new Set((await this.listFrames()).map((frame) => frame.id));
    const pending = catalog.frames.filter((frame) => !existing.has(frame.id)).slice(-25);
    let cursor = 0;
    const worker = async () => {
      while (cursor < pending.length) {
        const frame = pending[cursor++];
        try {
          const bytes = await defaultWeatherRadarProvider.getFrame(frame.id);
          if (!validPng(bytes)) throw new Error("invalid PNG");
          const destination = radarPath(frame.id);
          await mkdir(path.dirname(destination), { recursive: true, mode: 0o750 });
          const temporary = `${destination}.tmp`;
          await writeFile(temporary, bytes, { mode: 0o640 });
          await rename(temporary, destination);
          this.archivedCount += 1; this.lastWriteAt = new Date().toISOString();
        } catch (error) { this.failures += 1; console.warn("[map-context] radar frame archive failed", error instanceof Error ? error.message : error); }
      }
    };
    await Promise.all([worker(), worker()]);
    await this.cleanup();
    const frames = await this.listFrames();
    this.oldest = frames[0]?.at ?? null; this.latest = frames.at(-1)?.at ?? null;
    this.diagnosticsCache = null;
  }

  private async cleanup(): Promise<void> {
    const frames = await this.listFrames();
    const cutoff = Date.now() - getMapContextMaxAgeMs();
    let bytes = 0;
    const sizes = await Promise.all(frames.map(async (frame) => ({ frame, size: await stat(radarPath(frame.id)).then((value) => value.size).catch(() => 0) })));
    bytes = sizes.reduce((total, item) => total + item.size, 0);
    for (const item of sizes) {
      if (Date.parse(item.frame.at) < cutoff || bytes > getWeatherRadarArchiveMaxBytes()) {
        await import("node:fs/promises").then(({ unlink }) => unlink(radarPath(item.frame.id)).catch(() => undefined));
        bytes -= item.size;
      }
    }
  }
}

export class MapContextArchive {
  private readonly metar = new JsonArchive<HistoricalMetarObservation>(archiveMetadataPath("map-context-metar-v1.json"), MAX_METAR_ENTRIES, isMetarEntry);
  private readonly wind = new JsonArchive<HistoricalWindSnapshot>(archiveMetadataPath("map-context-wind-v1.json"), MAX_WIND_ENTRIES, isWindEntry);
  private readonly aup = new JsonArchive<HistoricalAupSnapshot>(archiveMetadataPath("map-context-aup-v1.json"), MAX_AUP_ENTRIES, isAupEntry);
  private metarWrite = Promise.resolve();
  private windWrite = Promise.resolve();
  private aupWrite = Promise.resolve();

  async addMetar(observations: readonly MetarMapObservation[], retrievedAt = new Date().toISOString()): Promise<void> {
    this.metarWrite = this.metarWrite.then(async () => {
      const entries = await this.metar.read(); const byKey = new Map(entries.map((entry) => [`${entry.stationId}:${entry.observedAt}`, entry]));
      for (const observation of observations) {
        const observedAt = observation.observedAt;
        if (observedAt && Number.isFinite(Date.parse(observedAt))) byKey.set(`${observation.stationId}:${observedAt}`, { ...observation, observedAt, retrievedAt, source: "Aviation Weather Center" });
      }
      const cutoff = Date.now() - getMapContextMaxAgeMs();
      await this.metar.replace([...byKey.values()].filter((entry) => Date.parse(entry.observedAt) >= cutoff).sort((left, right) => left.observedAt.localeCompare(right.observedAt)));
    });
    await this.metarWrite;
  }

  async addWind(snapshot: WindAloftResponse, archivedAt = new Date().toISOString()): Promise<void> {
    this.windWrite = this.windWrite.then(async () => {
      const entries = await this.wind.read(); const key = `${snapshot.modelRun}:${snapshot.validAt}:${snapshot.levelHpa}`;
      const byKey = new Map(entries.map((entry) => [`${entry.modelRun}:${entry.validAt}:${entry.levelHpa}`, entry]));
      byKey.set(key, { ...snapshot, archivedAt });
      const cutoff = Date.now() - getMapContextMaxAgeMs();
      await this.wind.replace([...byKey.values()].filter((entry) => Date.parse(entry.validAt) >= cutoff - 24 * 60 * 60_000).sort((left, right) => left.validAt.localeCompare(right.validAt)));
    });
    await this.windWrite;
  }

  async addAup(snapshot: AirspacePlanSnapshot, archivedAt = new Date().toISOString()): Promise<void> {
    this.aupWrite = this.aupWrite.then(async () => {
      const entries = await this.aup.read(); const key = `${snapshot.issuedAt}:${snapshot.validityStart}:${snapshot.latestUupReference}`;
      const byKey = new Map(entries.map((entry) => [`${entry.issuedAt}:${entry.validityStart}:${entry.latestUupReference}`, entry]));
      byKey.set(key, { ...snapshot, archivedAt });
      const cutoff = Date.now() - getMapContextMaxAgeMs();
      await this.aup.replace([...byKey.values()].filter((entry) => Date.parse(entry.archivedAt) >= cutoff).sort((left, right) => entryTime(left).localeCompare(entryTime(right))));
    });
    await this.aupWrite;
  }

  async resolveMetarAt(at: string): Promise<ResolvedLayer<{ observations: HistoricalMetarObservation[] }>> {
    const requestedAt = normalizeInstant(at); const records = await this.metar.read(); const grouped = new Map<string, HistoricalMetarObservation>();
    for (const record of records) { if (Date.parse(record.observedAt) > Date.parse(requestedAt)) continue; const previous = grouped.get(record.stationId); if (!previous || Date.parse(record.observedAt) > Date.parse(previous.observedAt)) grouped.set(record.stationId, record); }
    const observations = [...grouped.values()].filter((record) => Date.parse(requestedAt) - Date.parse(record.observedAt) <= METAR_MAX_AGE_MS);
    const latest = observations.sort((left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt))[0];
    const resolution = latest ? resolveNearestBefore([{ at: latest.observedAt }], requestedAt, METAR_MAX_AGE_MS).resolution : unavailableResolution(requestedAt);
    return latest ? { available: true, source: "OBSERVED", provider: "Aviation Weather Center", resolution, data: { observations } } : { available: false, source: "OBSERVED", provider: "Aviation Weather Center", resolution, data: null, reason: records.length ? "OUTSIDE_TOLERANCE" : "NO_ARCHIVE" };
  }

  async resolveWindAt(at: string, level: WindLevelHpa): Promise<ResolvedLayer<HistoricalWindSnapshot>> {
    const requestedAt = normalizeInstant(at); const records = (await this.wind.read()).filter((record) => record.levelHpa === level && Boolean(record.modelRun) && Date.parse(record.modelRun!) <= Date.parse(requestedAt));
    const selected = resolveNearestValid(records.map((record) => ({ ...record, at: record.validAt })), requestedAt, WIND_MAX_DELTA_MS);
    const record = selected.record as HistoricalWindSnapshot | null;
    return record ? { available: true, source: "MODEL", provider: record.model, resolution: selected.resolution, data: record } : { available: false, source: "MODEL", provider: "ICON-EU", resolution: selected.resolution, data: null, reason: records.length ? "OUTSIDE_TOLERANCE" : "NO_ARCHIVE" };
  }

  async resolveAupAt(at: string): Promise<ResolvedLayer<HistoricalAupSnapshot>> {
    const requestedAt = normalizeInstant(at); const records = (await this.aup.read()).filter((record) => Boolean(record.issuedAt) && Date.parse(record.issuedAt!) <= Date.parse(requestedAt));
    const candidates = records.filter((record) => record.validityStart && record.validityEnd);
    const selected = resolveIntervalContains(candidates.map((record) => ({ ...record, validFrom: record.validityStart!, validTo: record.validityEnd! })), requestedAt);
    const record = selected.record as HistoricalAupSnapshot | null;
    return record ? { available: true, source: "PLANNED", provider: "Czech AIM AUP/UUP", resolution: selected.resolution, data: record } : { available: false, source: "PLANNED", provider: "Czech AIM AUP/UUP", resolution: selected.resolution, data: null, reason: records.length ? "NO_VALID_REVISION" : "NO_ARCHIVE" };
  }

  async range(): Promise<{ metar: { minAvailableAt: string | null; maxAvailableAt: string | null }; wind: { minAvailableAt: string | null; maxAvailableAt: string | null }; aup: { minAvailableAt: string | null; maxAvailableAt: string | null } }> {
    const [metar, wind, aup] = await Promise.all([this.metar.diagnostics((entry) => entry.observedAt), this.wind.diagnostics((entry) => entry.validAt), this.aup.diagnostics((entry) => entry.validityStart)]);
    return { metar: { minAvailableAt: metar.oldest, maxAvailableAt: metar.latest }, wind: { minAvailableAt: wind.oldest, maxAvailableAt: wind.latest }, aup: { minAvailableAt: aup.oldest, maxAvailableAt: aup.latest } };
  }

  async diagnostics(): Promise<{ metar: Awaited<ReturnType<JsonArchive<HistoricalMetarObservation>["diagnostics"]>>; wind: Awaited<ReturnType<JsonArchive<HistoricalWindSnapshot>["diagnostics"]>>; aup: Awaited<ReturnType<JsonArchive<HistoricalAupSnapshot>["diagnostics"]>> }> {
    return { metar: await this.metar.diagnostics((entry) => entry.observedAt), wind: await this.wind.diagnostics((entry) => entry.validAt), aup: await this.aup.diagnostics((entry) => entry.validityStart) };
  }
}

function entryTime(entry: HistoricalAupSnapshot): string { return entry.archivedAt; }

export class MapContextResolver {
  constructor(private readonly radar = defaultWeatherRadarArchive, private readonly archive = defaultMapContextArchive) {}

  async resolve(at: string): Promise<MapContextManifest> {
    const requestedAt = normalizeInstant(at); const mode = Math.abs(Date.now() - Date.parse(requestedAt)) <= 60_000 ? "LIVE" : "HISTORICAL";
    const [radar, metar, wind, aup] = await Promise.allSettled([this.radar.resolve(requestedAt), this.archive.resolveMetarAt(requestedAt), this.archive.resolveWindAt(requestedAt, 300), this.archive.resolveAupAt(requestedAt)]);
    const failed = <T>(source: MapContextSourceKind, provider: string): ResolvedLayer<T> => ({ available: false, source, provider, resolution: unavailableResolution(requestedAt), data: null, reason: "NO_ARCHIVE" });
    return {
      requestedAt, mode,
      radar: radar.status === "fulfilled" ? radar.value : failed("OBSERVED", "CHMI"),
      metar: metar.status === "fulfilled" ? { ...metar.value, data: metar.value.data ? { stations: metar.value.data.observations.length } : null } : failed("OBSERVED", "Aviation Weather Center"),
      wind: wind.status === "fulfilled" ? { ...wind.value, data: wind.value.data ? { model: wind.value.data.model, modelRun: wind.value.data.modelRun, validAt: wind.value.data.validAt, levelHpa: wind.value.data.levelHpa } : null } : failed("MODEL", "ICON-EU"),
      aup: aup.status === "fulfilled" ? { ...aup.value, data: aup.value.data ? { validFrom: aup.value.data.validityStart!, validTo: aup.value.data.validityEnd!, windows: aup.value.data.windows.length } : null } : failed("PLANNED", "Czech AIM AUP/UUP"),
      sigmet: { available: false, source: "OBSERVED", provider: "Aviation Weather Center", resolution: unavailableResolution(requestedAt), data: null, reason: "NO_ARCHIVE" },
    };
  }
}

export class MapContextArchiveService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private pollInFlight: Promise<void> | null = null;

  async start(): Promise<void> {
    if (this.timer) return;
    void this.poll();
    this.timer = setInterval(() => { void this.poll(); }, getMapContextPollIntervalMs());
  }
  async stop(): Promise<void> { if (this.timer) clearInterval(this.timer); this.timer = null; await this.pollInFlight; }
  async poll(): Promise<void> {
    if (this.pollInFlight) return this.pollInFlight;
    this.pollInFlight = Promise.allSettled([this.pollMetar(), this.pollWind(), this.pollAup(), defaultWeatherRadarArchive.poll()]).then(() => undefined).finally(() => { this.pollInFlight = null; });
    return this.pollInFlight;
  }
  private async pollMetar(): Promise<void> {
    if (!isAviationWeatherEnabled()) return;
    let airports: Array<{ stationId: string; lat: number; lon: number }> = SAMPLE_AIRPORTS.map((airport) => ({ stationId: airport.icaoCode, lat: airport.latitude, lon: airport.longitude }));
    const database = getPrisma();
    if (database) { try { const rows = await database.orm.public.Airport.select("icao", "latitude", "longitude").limit(10_000).all(); if (rows.length) airports = rows.map((row) => ({ stationId: row.icao, lat: row.latitude, lon: row.longitude })); } catch { /* sample fallback */ } }
    const result = await defaultAviationWeatherProvider.getMetarMap(airports.slice(0, 256));
    await defaultMapContextArchive.addMetar(result.observations, result.fetchedAt);
  }
  private async pollWind(): Promise<void> { for (const level of [850, 700, 500, 300, 200] as const) await defaultMapContextArchive.addWind(await defaultWindAloftProvider.getWind(level)); }
  private async pollAup(): Promise<void> { const result = await getAirspaceActivity(); if (result.planned.status !== "unavailable") await defaultMapContextArchive.addAup(result.planned); }
}

export const defaultWeatherRadarArchive = new WeatherRadarArchiveService();
export const defaultMapContextArchive = new MapContextArchive();
export const defaultMapContextResolver = new MapContextResolver(defaultWeatherRadarArchive, defaultMapContextArchive);
export const defaultMapContextArchiveService = new MapContextArchiveService();

export function validateMapContextAt(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value)) || !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) throw new Error("Invalid UTC timestamp");
  const instant = normalizeInstant(value);
  if (Date.parse(instant) > Date.now() + 5 * 60_000) throw new Error("Timestamp is too far in the future");
  if (Date.parse(instant) < Date.now() - getMapContextMaxAgeMs()) throw new Error("Timestamp is outside the map-context retention range");
  return instant;
}

export function isWindLevelParam(value: string | null): value is `${WindLevelHpa}` { const parsed = Number(value); return isWindLevel(parsed) && String(parsed) === value; }
