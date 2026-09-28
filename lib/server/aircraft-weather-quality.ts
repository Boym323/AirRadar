import "temporal-polyfill/full/global";
import { getPrisma } from "@/lib/server/db";
import {
  AIRCRAFT_WEATHER_LIMITS,
  getAircraftWeatherDiagnostics,
  observationFromStoredWeatherRow,
  type AircraftWeatherObservation,
  type WeatherRow,
} from "@/lib/server/aircraft-weather";

const QUALITY_SAMPLE_LIMIT = AIRCRAFT_WEATHER_LIMITS.maxRows;
const QUALITY_WINDOW_MS = 7 * 24 * 60 * 60_000;

export interface AircraftWeatherQualityReport {
  generatedAt: string;
  bounded: { maxRows: number; windowDays: number; truncated: boolean };
  persisted: { source: "postgres" | "unavailable" | "provided"; rows: number | null; from: string | null; to: string | null; contributingAircraft: number | null };
  timeWindows: Record<"1h" | "24h" | "7d", { rows: number | null; aircraft: number | null }>;
  sourceCoverage: Record<string, { observations: number; aircraft: number }> | null;
  fieldCoverage: { wind: number; sat: number; tat: number; staticPressure: number; humidity: number; turbulence: number } | null;
  altitudeBands: Record<string, number> | null;
  quality: Record<string, number> | null;
  bds44: { candidates: number; accepted: number; ambiguous: number; rejected: number } | null;
  runtimeDiagnostics: { scope: "process-local audit process"; bds44: { candidates: number; accepted: number; ambiguous: number; rejected: number } };
  runtimeDiagnosticsScope: "process-local audit process";
  likelyDataGaps: string[];
}

type WeatherCollection = {
  where(predicate: (row: Record<string, { gte(value: unknown): unknown; lt(value: unknown): unknown }>) => unknown): WeatherCollection;
  orderBy(value: unknown): WeatherCollection;
  limit(value: number): WeatherCollection;
  all(): Promise<WeatherRow[]>;
};

async function loadBoundedRows(from: Date, to: Date): Promise<{ rows: AircraftWeatherObservation[]; truncated: boolean; databaseAvailable: boolean }> {
  const database = getPrisma();
  if (!database) return { rows: [], truncated: false, databaseAvailable: false };
  try {
    const table = database.orm.public.AircraftWeatherObservation as unknown as WeatherCollection;
    const selected = await table
      .where((row) => row.observedAt.gte(Temporal.Instant.fromEpochMilliseconds(from.getTime())))
      .where((row) => row.observedAt.lt(Temporal.Instant.fromEpochMilliseconds(to.getTime())))
      .orderBy((row: Record<string, { desc(): unknown }>) => row.observedAt.desc())
      .limit(QUALITY_SAMPLE_LIMIT + 1)
      .all();
    return { rows: selected.slice(0, QUALITY_SAMPLE_LIMIT).map(observationFromStoredWeatherRow).filter((row) => row.quality !== "REJECTED"), truncated: selected.length > QUALITY_SAMPLE_LIMIT, databaseAvailable: true };
  } catch {
    return { rows: [], truncated: false, databaseAvailable: false };
  }
}

function windowMetric(rows: AircraftWeatherObservation[], from: number, to: number): { rows: number; aircraft: number } {
  const selected = rows.filter((row) => row.observedAt.getTime() >= from && row.observedAt.getTime() < to);
  return { rows: selected.length, aircraft: new Set(selected.map((row) => row.aircraftHex)).size };
}

function altitudeBand(altitudeFt: number): string {
  if (altitudeFt < 10_000) return "below_FL100";
  if (altitudeFt < 20_000) return "FL100_FL200";
  if (altitudeFt < 30_000) return "FL200_FL300";
  if (altitudeFt < 40_000) return "FL300_FL400";
  return "above_FL400";
}

export function buildAircraftWeatherQualityReport(rows: AircraftWeatherObservation[], now = new Date(), truncated = false, source: AircraftWeatherQualityReport["persisted"]["source"] = "provided"): AircraftWeatherQualityReport {
  const nowMs = now.getTime();
  const sorted = [...rows].sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
  const sourceCoverage: Record<string, { observations: number; aircraft: number }> = {};
  const sourceAircraft = new Map<string, Set<string>>();
  const fieldCoverage = { wind: 0, sat: 0, tat: 0, staticPressure: 0, humidity: 0, turbulence: 0 };
  const altitudeBands: Record<string, number> = {};
  const quality: Record<string, number> = {};
  for (const row of rows) {
    sourceCoverage[row.source] = sourceCoverage[row.source] ?? { observations: 0, aircraft: 0 };
    sourceCoverage[row.source].observations += 1;
    const aircraft = sourceAircraft.get(row.source) ?? new Set<string>();
    aircraft.add(row.aircraftHex);
    sourceAircraft.set(row.source, aircraft);
    sourceCoverage[row.source].aircraft = aircraft.size;
    if (row.windDirectionDeg !== null && row.windSpeedKt !== null) fieldCoverage.wind += 1;
    if (row.staticAirTemperatureC !== null) fieldCoverage.sat += 1;
    if (row.totalAirTemperatureC !== null) fieldCoverage.tat += 1;
    if (row.staticPressureHpa !== null) fieldCoverage.staticPressure += 1;
    if (row.humidityPct !== null) fieldCoverage.humidity += 1;
    if (row.turbulenceLevel !== null) fieldCoverage.turbulence += 1;
    const band = altitudeBand(row.altitudeFt);
    altitudeBands[band] = (altitudeBands[band] ?? 0) + 1;
    quality[row.quality] = (quality[row.quality] ?? 0) + 1;
  }
  const first = sorted[0]?.observedAt.toISOString() ?? null;
  const last = sorted.at(-1)?.observedAt.toISOString() ?? null;
  const gaps: string[] = [];
  if (source === "unavailable") gaps.push("Production database was unavailable; persisted metrics could not be read.");
  else if (!rows.length) gaps.push("No persisted accepted observations in the bounded seven-day sample.");
  else if (nowMs - Date.parse(last!) > 60 * 60_000) gaps.push("No accepted observation in the last hour.");
  if (source !== "unavailable" && !sourceCoverage.BDS_4_4) gaps.push("No persisted BDS_4_4 observations in the sample.");
  if (source !== "unavailable" && !fieldCoverage.humidity) gaps.push("Humidity was unavailable in the sample.");
  if (source !== "unavailable" && !fieldCoverage.turbulence) gaps.push("Turbulence was unavailable in the sample.");
  const diagnostics = getAircraftWeatherDiagnostics();
  const runtimeBds44 = { candidates: diagnostics.weatherBds44Accepted + diagnostics.weatherBds44Ambiguous, accepted: diagnostics.weatherBds44Accepted, ambiguous: diagnostics.weatherBds44Ambiguous, rejected: diagnostics.weatherRejected };
  const databaseUnavailable = source === "unavailable";
  return {
    generatedAt: now.toISOString(),
    bounded: { maxRows: QUALITY_SAMPLE_LIMIT, windowDays: 7, truncated },
    persisted: { source, rows: databaseUnavailable ? null : rows.length, from: databaseUnavailable ? null : first, to: databaseUnavailable ? null : last, contributingAircraft: databaseUnavailable ? null : new Set(rows.map((row) => row.aircraftHex)).size },
    timeWindows: databaseUnavailable
      ? { "1h": { rows: null, aircraft: null }, "24h": { rows: null, aircraft: null }, "7d": { rows: null, aircraft: null } }
      : { "1h": windowMetric(rows, nowMs - 60 * 60_000, nowMs), "24h": windowMetric(rows, nowMs - 24 * 60 * 60_000, nowMs), "7d": windowMetric(rows, nowMs - QUALITY_WINDOW_MS, nowMs) },
    sourceCoverage: databaseUnavailable ? null : sourceCoverage,
    fieldCoverage: databaseUnavailable ? null : fieldCoverage,
    altitudeBands: databaseUnavailable ? null : altitudeBands,
    quality: databaseUnavailable ? null : quality,
    bds44: databaseUnavailable ? null : runtimeBds44,
    runtimeDiagnostics: { scope: "process-local audit process", bds44: runtimeBds44 },
    runtimeDiagnosticsScope: "process-local audit process",
    likelyDataGaps: gaps,
  };
}

export async function collectAircraftWeatherQualityReport(now = new Date()): Promise<AircraftWeatherQualityReport> {
  const to = now;
  const from = new Date(now.getTime() - QUALITY_WINDOW_MS);
  const result = await loadBoundedRows(from, to);
  return buildAircraftWeatherQualityReport(result.rows, now, result.truncated, result.databaseAvailable ? "postgres" : "unavailable");
}
