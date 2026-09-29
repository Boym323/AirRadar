import "temporal-polyfill/full/global";
import type { Aircraft, AircraftFieldProvenance } from "@/lib/aircraft/types";
import { haversineDistanceKm } from "@/lib/geo";
import { getPrisma } from "@/lib/server/db";
import { trackDbOperation } from "@/lib/server/db-operation-diagnostics";
import { getHistoryRetentionDays } from "@/lib/server/config";

/**
 * Aircraft-observed weather is deliberately a separate, sparse data product.
 * It is not an official AMDAR feed and it must not inherit the semantics of
 * QNH, model weather, or METAR observations.
 */
export type AircraftWeatherSource = "BDS_4_4" | "READSB_JSON" | "DERIVED" | "UNKNOWN";
export type WeatherQuality = "HIGH" | "GOOD" | "LOW" | "REJECTED";
export type WeatherSourceQuality = "INVALID" | "INS" | "GNSS" | "DME_DME" | "VOR_DME" | "UNKNOWN";
export type ProfileConfidence = "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";

export const AIRCRAFT_WEATHER_LIMITS = {
  maxPositionWeatherSkewMs: 10_000,
  maxFieldAgeMs: 20_000,
  sampleIntervalMs: 20_000,
  altitudeChangeFt: 2_000,
  positionChangeKm: 5,
  temperatureChangeC: 1,
  windSpeedChangeKt: 10,
  windDirectionChangeDeg: 20,
  maxQueryWindowMs: 90 * 60_000,
  maxRadiusKm: 300,
  maxRows: 20_000,
  defaultWindowMs: 30 * 60_000,
  defaultBinSizeFt: 2_000,
  minAltitudeFt: -2_000,
  maxAltitudeFt: 60_000,
} as const;

export const AIRCRAFT_WEATHER_PERSISTENCE_POLICY = {
  readsb: {
    bucketMs: 60_000,
    heartbeatMs: 120_000,
    altitudeBinFt: 1_000,
    satDeltaC: 1,
    tatDeltaC: 1,
    windSpeedDeltaKt: 5,
    windDirectionDeltaDeg: 15,
    staticPressureDeltaHpa: 2,
    humidityDeltaPct: 5,
    spatialDeltaKm: 20,
  },
  bds44: {
    duplicateWindowMs: 15_000,
  },
  accumulator: {
    ttlMs: 10 * 60_000,
    maxEntries: 10_000,
    shutdownFlushMaxEntries: 500,
  },
} as const;

export type WeatherPersistenceReason =
  | "FIRST_OBSERVATION"
  | "BDS44_UNIQUE"
  | "ALTITUDE_BIN_CHANGE"
  | "WEATHER_CHANGE"
  | "SOURCE_CHANGE"
  | "QUALITY_CHANGE"
  | "HEARTBEAT"
  | "SPATIAL_CHANGE";

export interface AircraftWeatherObservation {
  id?: number;
  aircraftHex: string;
  flightId: number | null;
  callsign: string | null;
  observedAt: Date;
  receivedAt: Date | null;
  lat: number;
  lon: number;
  altitudeFt: number;
  altitudeType: "BAROMETRIC" | "GNSS" | "UNKNOWN";
  windDirectionDeg: number | null;
  windSpeedKt: number | null;
  staticAirTemperatureC: number | null;
  totalAirTemperatureC: number | null;
  staticPressureHpa: number | null;
  humidityPct: number | null;
  turbulenceLevel: number | null;
  source: AircraftWeatherSource;
  provider: string | null;
  quality: WeatherQuality;
  weatherSourceQuality: WeatherSourceQuality | null;
  bdsConfidence: "HIGH" | "MEDIUM" | "AMBIGUOUS" | null;
  provenance: Record<string, AircraftFieldProvenance>;
  dedupKey?: string;
}

export interface AircraftWeatherDiagnostics {
  weatherCandidates: number;
  weatherAccepted: number;
  weatherRejected: number;
  weatherBds44Accepted: number;
  weatherBds44Ambiguous: number;
  weatherReadsbAccepted: number;
  weatherPersisted: number;
  weatherDeduplicated: number;
  weatherPersistedFirst: number;
  weatherPersistedBds44: number;
  weatherPersistedAltitudeBinChange: number;
  weatherPersistedWeatherChange: number;
  weatherPersistedSourceChange: number;
  weatherPersistedQualityChange: number;
  weatherPersistedHeartbeat: number;
  weatherPersistedSpatialChange: number;
  weatherCoalesced: number;
  weatherExactDeduplicated: number;
  weatherPersistenceFailures: number;
  weatherAccumulatorEntries: number;
  weatherAccumulatorEvicted: number;
  weatherAccumulatorMaxObserved: number;
  weatherQcRejected: number;
  withWind: number;
  withTemperature: number;
  withPressure: number;
  withHumidity: number;
  withTurbulence: number;
  lastAcceptedAt: string | null;
  lastPersistedAt: string | null;
  lastAnomalies: Array<{ aircraftHex: string; observedAt: string; reason: string }>;
}

const emptyDiagnostics = (): AircraftWeatherDiagnostics => ({
  weatherCandidates: 0, weatherAccepted: 0, weatherRejected: 0,
  weatherBds44Accepted: 0, weatherBds44Ambiguous: 0, weatherReadsbAccepted: 0,
  weatherPersisted: 0, weatherDeduplicated: 0, weatherQcRejected: 0,
  weatherPersistedFirst: 0, weatherPersistedBds44: 0, weatherPersistedAltitudeBinChange: 0,
  weatherPersistedWeatherChange: 0, weatherPersistedSourceChange: 0, weatherPersistedQualityChange: 0,
  weatherPersistedHeartbeat: 0, weatherPersistedSpatialChange: 0, weatherCoalesced: 0,
  weatherExactDeduplicated: 0, weatherPersistenceFailures: 0,
  weatherAccumulatorEntries: 0, weatherAccumulatorEvicted: 0, weatherAccumulatorMaxObserved: 0,
  withWind: 0, withTemperature: 0, withPressure: 0, withHumidity: 0, withTurbulence: 0,
  lastAcceptedAt: null, lastPersistedAt: null,
  lastAnomalies: [],
});

const globalForWeather = globalThis as unknown as {
  aircraftWeatherDiagnostics?: AircraftWeatherDiagnostics;
  aircraftWeatherAccumulators?: Map<string, WeatherAircraftAccumulator>;
  aircraftWeatherMemoryRows?: AircraftWeatherObservation[];
};
const diagnostics = globalForWeather.aircraftWeatherDiagnostics ??= emptyDiagnostics();

export interface WeatherAircraftAccumulator {
  lastSeenAt: number;
  lastObservation?: AircraftWeatherObservation;
  lastPersisted?: AircraftWeatherObservation;
  lastPersistedAt?: number;
  lastPersistedFingerprint?: string;
  currentBucket?: number;
}

const accumulators = globalForWeather.aircraftWeatherAccumulators ??= new Map<string, WeatherAircraftAccumulator>();
const memoryRows = globalForWeather.aircraftWeatherMemoryRows ??= [];

function finite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function dateOf(value: Date | Temporal.Instant): Date { return value instanceof Date ? value : new Date(value.epochMilliseconds); }
function normaliseDirection(value: number | null): number | null { return value === null ? null : ((value % 360) + 360) % 360; }
export function circularWindDirectionDelta(a: number, b: number): number { const delta = Math.abs(a - b) % 360; return delta > 180 ? 360 - delta : delta; }
function fieldAt(aircraft: Aircraft, name: string, fallback: number): number {
  const raw = aircraft.provenance?.fields?.[name]?.observedAt;
  const value = raw ? Date.parse(raw) : Number.NaN;
  return Number.isFinite(value) ? value : fallback;
}
function field(aircraft: Aircraft, name: string): AircraftFieldProvenance | null {
  return aircraft.provenance?.fields?.[name] ?? null;
}
function bdsField(value: AircraftFieldProvenance | null): boolean {
  return Boolean(value?.protocol === "beast-mode-s" && value.bds === "BDS4,4" && value.confidence !== "ambiguous" && value.bdsInferenceConfidence === "high");
}
function usableField(value: number | null, provenance: AircraftFieldProvenance | null, at: number): boolean {
  const observedAt = provenance?.observedAt ? Date.parse(provenance.observedAt) : at;
  return value !== null && provenance?.confidence !== "ambiguous" && Number.isFinite(observedAt) && at - observedAt <= AIRCRAFT_WEATHER_LIMITS.maxFieldAgeMs;
}
function latestMeasurementAt(aircraft: Aircraft, receivedAt: number): number {
  const names = ["windDirectionDeg", "windSpeedKt", "outsideAirTemperatureC", "totalAirTemperatureC", "staticPressureHpa", "humidityPct", "turbulenceLevel"];
  return Math.max(...names.map((name) => fieldAt(aircraft, name, receivedAt)));
}
function sourceFor(fields: Record<string, AircraftFieldProvenance>, names: string[]): AircraftWeatherSource {
  const values = names.map((name) => fields[name]).filter((value): value is AircraftFieldProvenance => Boolean(value));
  if (values.some(bdsField)) return "BDS_4_4";
  if (values.some((value) => value.protocol === "readsb-json")) return "READSB_JSON";
  if (values.some((value) => value.protocol === "sbs")) return "DERIVED";
  return "UNKNOWN";
}

export function observationFromAircraft(
  aircraft: Aircraft,
  receivedAt = new Date(),
  context: { flightId?: number | null; provider?: string | null } = {},
): AircraftWeatherObservation | null {
  diagnostics.weatherCandidates += 1;
  const receivedMs = receivedAt.getTime();
  const positionAt = aircraft.observationTimes?.position ?? fieldAt(aircraft, "position", Date.parse(aircraft.lastSeen));
  const altitudeAt = aircraft.observationTimes?.altitude ?? fieldAt(aircraft, "altitude", Date.parse(aircraft.lastSeen));
  const measurementAt = latestMeasurementAt(aircraft, receivedMs);
  if (![aircraft.lat, aircraft.lon, aircraft.altitude, positionAt, altitudeAt, measurementAt].every((value) => typeof value === "number" && Number.isFinite(value))) return null;
  if (Math.abs(positionAt - measurementAt) > AIRCRAFT_WEATHER_LIMITS.maxPositionWeatherSkewMs || Math.abs(altitudeAt - measurementAt) > AIRCRAFT_WEATHER_LIMITS.maxPositionWeatherSkewMs) {
    diagnostics.weatherRejected += 1;
    recordAnomaly(aircraft.icaoHex, measurementAt, "STALE_LOCATION_OR_ALTITUDE");
    return null;
  }

  const telemetry = aircraft.adsbTelemetry;
  const provenance = aircraft.provenance?.fields ?? {};
  const values = {
    windDirectionDeg: normaliseDirection(usableField(finite(telemetry?.windDirectionDeg), field(aircraft, "windDirectionDeg"), measurementAt) ? finite(telemetry?.windDirectionDeg) : null),
    windSpeedKt: usableField(finite(telemetry?.windSpeedKt), field(aircraft, "windSpeedKt"), measurementAt) ? finite(telemetry?.windSpeedKt) : null,
    staticAirTemperatureC: usableField(finite(telemetry?.outsideAirTemperatureC), field(aircraft, "outsideAirTemperatureC"), measurementAt) ? finite(telemetry?.outsideAirTemperatureC) : null,
    totalAirTemperatureC: usableField(finite(telemetry?.totalAirTemperatureC), field(aircraft, "totalAirTemperatureC"), measurementAt) ? finite(telemetry?.totalAirTemperatureC) : null,
    staticPressureHpa: usableField(finite(telemetry?.staticPressureHpa), field(aircraft, "staticPressureHpa"), measurementAt) ? finite(telemetry?.staticPressureHpa) : null,
    humidityPct: usableField(finite(telemetry?.humidityPct), field(aircraft, "humidityPct"), measurementAt) ? finite(telemetry?.humidityPct) : null,
    turbulenceLevel: usableField(finite(telemetry?.turbulenceLevel), field(aircraft, "turbulenceLevel"), measurementAt) ? finite(telemetry?.turbulenceLevel) : null,
  };
  // Readsb has no explicit BDS 4,4 identity. Its weather values therefore
  // remain READSB_JSON even when a local Beast decoder also has telemetry.
  const source = sourceFor(provenance, Object.keys(values));
  if (source === "BDS_4_4") diagnostics.weatherBds44Accepted += 1;
  else if (source === "READSB_JSON") diagnostics.weatherReadsbAccepted += 1;
  const hasWeather = Object.values(values).some((value) => value !== null);
  if (!hasWeather) return null;
  const observedAt = new Date(measurementAt);
  const observation: AircraftWeatherObservation = {
    aircraftHex: aircraft.icaoHex,
    flightId: context.flightId ?? null,
    callsign: aircraft.callsign,
    observedAt,
    receivedAt,
    lat: aircraft.lat as number,
    lon: aircraft.lon as number,
    altitudeFt: Math.round(aircraft.altitude as number),
    altitudeType: aircraft.altitudeObservation?.altitudeType === "BAROMETRIC" ? "BAROMETRIC" : aircraft.altitudeObservation?.altitudeType === "GNSS" ? "GNSS" : "UNKNOWN",
    ...values,
    source,
    provider: context.provider ?? null,
    quality: "HIGH",
    weatherSourceQuality: source === "BDS_4_4" ? (provenance.outsideAirTemperatureC?.weatherSourceQuality ?? null) : null,
    bdsConfidence: source === "BDS_4_4" ? "HIGH" : null,
    provenance,
  };
  const checked = qualityControl(observation, accumulators.get(aircraft.icaoHex)?.lastObservation);
  observation.quality = checked.quality;
  if (checked.quality === "REJECTED") {
    diagnostics.weatherRejected += 1;
    diagnostics.weatherQcRejected += 1;
    recordAnomaly(aircraft.icaoHex, measurementAt, checked.reason ?? "QC_REJECTED");
    return null;
  }
  diagnostics.weatherAccepted += 1;
  diagnostics.lastAcceptedAt = observation.observedAt.toISOString();
  diagnostics.withWind += observation.windDirectionDeg !== null && observation.windSpeedKt !== null ? 1 : 0;
  diagnostics.withTemperature += observation.staticAirTemperatureC !== null || observation.totalAirTemperatureC !== null ? 1 : 0;
  diagnostics.withPressure += observation.staticPressureHpa !== null ? 1 : 0;
  diagnostics.withHumidity += observation.humidityPct !== null ? 1 : 0;
  diagnostics.withTurbulence += observation.turbulenceLevel !== null ? 1 : 0;
  rememberObservation(observation, receivedMs);
  return observation;
}

function qualityControl(observation: AircraftWeatherObservation, previous: AircraftWeatherObservation | undefined): { quality: WeatherQuality; reason?: string } {
  const checks: Array<[number | null, number, number, string]> = [
    [observation.staticAirTemperatureC, -100, 70, "TEMPERATURE_RANGE"],
    [observation.totalAirTemperatureC, -100, 100, "TOTAL_TEMPERATURE_RANGE"],
    [observation.windSpeedKt, 0, 512, "WIND_SPEED_RANGE"],
    [observation.staticPressureHpa, 150, 1_100, "STATIC_PRESSURE_RANGE"],
    [observation.humidityPct, 0, 100, "HUMIDITY_RANGE"],
    [observation.turbulenceLevel, 0, 3, "TURBULENCE_RANGE"],
  ];
  if (observation.altitudeFt < AIRCRAFT_WEATHER_LIMITS.minAltitudeFt || observation.altitudeFt > AIRCRAFT_WEATHER_LIMITS.maxAltitudeFt) return { quality: "REJECTED", reason: "ALTITUDE_RANGE" };
  for (const [value, min, max, reason] of checks) if (value !== null && (value < min || value > max)) return { quality: "REJECTED", reason };
  if (!previous) return { quality: "HIGH" };
  const elapsed = observation.observedAt.getTime() - previous.observedAt.getTime();
  if (elapsed > 0 && elapsed <= 15_000 && observation.staticAirTemperatureC !== null && previous.staticAirTemperatureC !== null && Math.abs(observation.staticAirTemperatureC - previous.staticAirTemperatureC) > 50) return { quality: "REJECTED", reason: "TEMPERATURE_JUMP" };
  if (elapsed > 0 && elapsed <= 15_000 && observation.windDirectionDeg !== null && observation.windSpeedKt !== null && previous.windDirectionDeg !== null && previous.windSpeedKt !== null) {
    const directionDelta = circularWindDirectionDelta(observation.windDirectionDeg, previous.windDirectionDeg);
    if (directionDelta > 150 && Math.abs(observation.windSpeedKt - previous.windSpeedKt) > 200) return { quality: "REJECTED", reason: "WIND_SPIKE" };
  }
  return { quality: "GOOD" };
}

function recordAnomaly(aircraftHex: string, at: number, reason: string): void {
  diagnostics.lastAnomalies.push({ aircraftHex, observedAt: new Date(at).toISOString(), reason });
  if (diagnostics.lastAnomalies.length > 20) diagnostics.lastAnomalies.splice(0, diagnostics.lastAnomalies.length - 20);
}

/**
 * Backward-compatible low-level sampler predicate. The live persistence lane
 * uses decideWeatherPersistence below, which has source-specific policy and
 * bounded RAM state.
 */
export function shouldPersistWeatherObservation(observation: AircraftWeatherObservation, previous = accumulators.get(observation.aircraftHex)?.lastPersisted): boolean {
  if (observation.quality === "REJECTED") return false;
  if (!previous) return true;
  const elapsed = observation.observedAt.getTime() - previous.observedAt.getTime();
  const moved = haversineDistanceKm(previous.lat, previous.lon, observation.lat, observation.lon) >= AIRCRAFT_WEATHER_LIMITS.positionChangeKm;
  const climbed = Math.abs(previous.altitudeFt - observation.altitudeFt) >= AIRCRAFT_WEATHER_LIMITS.altitudeChangeFt;
  const weatherChanged = (previous.staticAirTemperatureC !== null && observation.staticAirTemperatureC !== null && Math.abs(previous.staticAirTemperatureC - observation.staticAirTemperatureC) >= AIRCRAFT_WEATHER_LIMITS.temperatureChangeC)
    || (previous.windSpeedKt !== null && observation.windSpeedKt !== null && Math.abs(previous.windSpeedKt - observation.windSpeedKt) >= AIRCRAFT_WEATHER_LIMITS.windSpeedChangeKt)
    || (previous.windDirectionDeg !== null && observation.windDirectionDeg !== null && circularWindDirectionDelta(previous.windDirectionDeg, observation.windDirectionDeg) >= AIRCRAFT_WEATHER_LIMITS.windDirectionChangeDeg);
  if (elapsed < AIRCRAFT_WEATHER_LIMITS.sampleIntervalMs) return moved || climbed || weatherChanged;
  return elapsed >= AIRCRAFT_WEATHER_LIMITS.sampleIntervalMs || moved || climbed || weatherChanged;
}

function dedupKey(observation: AircraftWeatherObservation): string { return `${observation.aircraftHex}:${Math.floor(observation.observedAt.getTime() / 1_000)}:${observation.source}`; }

export function weatherObservationFingerprint(observation: AircraftWeatherObservation): string {
  return JSON.stringify([
    observation.aircraftHex, observation.lat, observation.lon, observation.altitudeFt,
    observation.altitudeType, observation.windDirectionDeg, observation.windSpeedKt,
    observation.staticAirTemperatureC, observation.totalAirTemperatureC,
    observation.staticPressureHpa, observation.humidityPct, observation.turbulenceLevel,
    observation.source, observation.provider,
  ]);
}

function altitudeBin(observation: AircraftWeatherObservation, binFt = AIRCRAFT_WEATHER_PERSISTENCE_POLICY.readsb.altitudeBinFt): number {
  return Math.floor(observation.altitudeFt / binFt);
}

function fieldChanged(previous: number | null, current: number | null, threshold: number, circular = false): boolean {
  if (previous === null || current === null) return previous !== current;
  return (circular ? circularWindDirectionDelta(previous, current) : Math.abs(previous - current)) >= threshold;
}

function meaningfulWeatherChange(previous: AircraftWeatherObservation, current: AircraftWeatherObservation): boolean {
  const policy = AIRCRAFT_WEATHER_PERSISTENCE_POLICY.readsb;
  return fieldChanged(previous.staticAirTemperatureC, current.staticAirTemperatureC, policy.satDeltaC)
    || fieldChanged(previous.totalAirTemperatureC, current.totalAirTemperatureC, policy.tatDeltaC)
    || fieldChanged(previous.windSpeedKt, current.windSpeedKt, policy.windSpeedDeltaKt)
    || fieldChanged(previous.windDirectionDeg, current.windDirectionDeg, policy.windDirectionDeltaDeg, true)
    || fieldChanged(previous.staticPressureHpa, current.staticPressureHpa, policy.staticPressureDeltaHpa)
    || fieldChanged(previous.humidityPct, current.humidityPct, policy.humidityDeltaPct)
    || fieldChanged(previous.turbulenceLevel, current.turbulenceLevel, 1);
}

function rememberObservation(observation: AircraftWeatherObservation, seenAt: number): void {
  evictAircraftWeatherAccumulators(seenAt);
  let accumulator = accumulators.get(observation.aircraftHex);
  if (!accumulator) {
    if (accumulators.size >= AIRCRAFT_WEATHER_PERSISTENCE_POLICY.accumulator.maxEntries) {
      let oldestKey: string | undefined;
      let oldestAt = Number.POSITIVE_INFINITY;
      for (const [key, candidate] of accumulators) {
        if (candidate.lastSeenAt < oldestAt) { oldestAt = candidate.lastSeenAt; oldestKey = key; }
      }
      if (oldestKey) { accumulators.delete(oldestKey); diagnostics.weatherAccumulatorEvicted += 1; }
    }
    accumulator = { lastSeenAt: seenAt };
    accumulators.set(observation.aircraftHex, accumulator);
  }
  accumulator.lastSeenAt = Math.max(accumulator.lastSeenAt, seenAt, observation.observedAt.getTime());
  accumulator.lastObservation = observation;
  diagnostics.weatherAccumulatorEntries = accumulators.size;
  diagnostics.weatherAccumulatorMaxObserved = Math.max(diagnostics.weatherAccumulatorMaxObserved, accumulators.size);
}

export function evictAircraftWeatherAccumulators(now = Date.now()): number {
  let evicted = 0;
  const cutoff = now - AIRCRAFT_WEATHER_PERSISTENCE_POLICY.accumulator.ttlMs;
  for (const [key, accumulator] of accumulators) {
    if (accumulator.lastSeenAt < cutoff) { accumulators.delete(key); evicted += 1; }
  }
  diagnostics.weatherAccumulatorEvicted += evicted;
  diagnostics.weatherAccumulatorEntries = accumulators.size;
  return evicted;
}

export function decideWeatherPersistence(observation: AircraftWeatherObservation, accumulator = accumulators.get(observation.aircraftHex)): WeatherPersistenceReason | null {
  if (observation.quality === "REJECTED") return null;
  const previous = accumulator?.lastPersisted;
  if (!previous) return "FIRST_OBSERVATION";
  const policy = AIRCRAFT_WEATHER_PERSISTENCE_POLICY.readsb;
  const elapsed = observation.observedAt.getTime() - (accumulator.lastPersistedAt ?? previous.observedAt.getTime());
  const fingerprint = weatherObservationFingerprint(observation);
  if (observation.source === "BDS_4_4"
    && accumulator.lastPersistedFingerprint === fingerprint
    && Math.abs(elapsed) <= AIRCRAFT_WEATHER_PERSISTENCE_POLICY.bds44.duplicateWindowMs) return null;
  if (observation.source === "BDS_4_4") return "BDS44_UNIQUE";
  if (previous.source !== observation.source || previous.provider !== observation.provider) return "SOURCE_CHANGE";
  // The first accepted sample is provisionally HIGH because QC has no
  // predecessor. The next stable sample is normally GOOD; that bookkeeping
  // transition is not a meaningful quality change and must not create a
  // second row immediately after every restart.
  if (previous.quality !== observation.quality && !(previous.quality === "HIGH" && observation.quality === "GOOD")) return "QUALITY_CHANGE";
  if (altitudeBin(previous) !== altitudeBin(observation)) return "ALTITUDE_BIN_CHANGE";
  if (meaningfulWeatherChange(previous, observation)) return "WEATHER_CHANGE";
  if (elapsed >= policy.heartbeatMs) return "HEARTBEAT";
  return null;
}

function incrementPersistenceReason(reason: WeatherPersistenceReason): void {
  const fieldByReason: Record<WeatherPersistenceReason, Exclude<keyof AircraftWeatherDiagnostics, "lastAnomalies">> = {
    FIRST_OBSERVATION: "weatherPersistedFirst",
    BDS44_UNIQUE: "weatherPersistedBds44",
    ALTITUDE_BIN_CHANGE: "weatherPersistedAltitudeBinChange",
    WEATHER_CHANGE: "weatherPersistedWeatherChange",
    SOURCE_CHANGE: "weatherPersistedSourceChange",
    QUALITY_CHANGE: "weatherPersistedQualityChange",
    HEARTBEAT: "weatherPersistedHeartbeat",
    SPATIAL_CHANGE: "weatherPersistedSpatialChange",
  };
  const numericDiagnostics = diagnostics as unknown as Record<Exclude<keyof AircraftWeatherDiagnostics, "lastAnomalies">, number>;
  numericDiagnostics[fieldByReason[reason]] += 1;
}

function isUniqueConflict(error: unknown): boolean {
  const message = String(error).toLowerCase();
  return message.includes("unique") || message.includes("23505");
}

function markPersisted(observation: AircraftWeatherObservation, reason: WeatherPersistenceReason): void {
  const accumulator = accumulators.get(observation.aircraftHex) ?? { lastSeenAt: observation.observedAt.getTime() };
  accumulator.lastPersisted = observation;
  accumulator.lastPersistedAt = observation.observedAt.getTime();
  accumulator.lastPersistedFingerprint = weatherObservationFingerprint(observation);
  accumulator.currentBucket = Math.floor(observation.observedAt.getTime() / AIRCRAFT_WEATHER_PERSISTENCE_POLICY.readsb.bucketMs);
  accumulators.set(observation.aircraftHex, accumulator);
  diagnostics.weatherPersisted += 1;
  diagnostics.lastPersistedAt = observation.observedAt.toISOString();
  incrementPersistenceReason(reason);
}

function rememberMemoryRow(observation: AircraftWeatherObservation): void {
  memoryRows.push(observation);
  while (memoryRows.length > AIRCRAFT_WEATHER_LIMITS.maxRows) memoryRows.shift();
}

async function writeWeatherObservation(database: NonNullable<ReturnType<typeof getPrisma>>, observation: AircraftWeatherObservation): Promise<void> {
  await trackDbOperation("weather.observation.create", () => database.orm.public.AircraftWeatherObservation.create({
    dedupKey: observation.dedupKey!,
    aircraftHex: observation.aircraftHex,
    flightId: observation.flightId,
    callsign: observation.callsign,
    observedAt: Temporal.Instant.fromEpochMilliseconds(observation.observedAt.getTime()),
    receivedAt: observation.receivedAt ? Temporal.Instant.fromEpochMilliseconds(observation.receivedAt.getTime()) : null,
    lat: observation.lat, lon: observation.lon, altitudeFt: observation.altitudeFt, altitudeType: observation.altitudeType,
    windDirectionDeg: observation.windDirectionDeg, windSpeedKt: observation.windSpeedKt,
    staticAirTempC: observation.staticAirTemperatureC, totalAirTempC: observation.totalAirTemperatureC,
    staticPressureHpa: observation.staticPressureHpa, humidityPct: observation.humidityPct, turbulenceLevel: observation.turbulenceLevel,
    source: observation.source, provider: observation.provider, quality: observation.quality,
    weatherSourceQuality: observation.weatherSourceQuality, bdsConfidence: observation.bdsConfidence,
    provenanceJson: JSON.stringify(observation.provenance),
  }));
}

async function persistWeatherBatch(aircraft: Aircraft[], receivedAt: Date, provider: string): Promise<void> {
  const database = getPrisma();
  for (const item of aircraft) {
    const observation = observationFromAircraft(item, receivedAt, { provider });
    if (!observation) continue;
    const accumulator = accumulators.get(observation.aircraftHex);
    const reason = decideWeatherPersistence(observation, accumulator);
    if (!reason) {
      const fingerprint = weatherObservationFingerprint(observation);
      if (observation.source === "BDS_4_4" && accumulator?.lastPersistedFingerprint === fingerprint) {
        diagnostics.weatherExactDeduplicated += 1;
        diagnostics.weatherDeduplicated += 1;
      } else {
        diagnostics.weatherCoalesced += 1;
      }
      continue;
    }
    observation.dedupKey = dedupKey(observation);
    if (!database) { rememberMemoryRow(observation); markPersisted(observation, reason); continue; }
    try {
      await writeWeatherObservation(database, observation);
      rememberMemoryRow(observation);
      markPersisted(observation, reason);
    } catch (error) {
      // PostgreSQL remains a second-line exact-duplicate safety net. Any
      // other failure leaves lastPersisted untouched so the next sample can retry.
      if (isUniqueConflict(error)) {
        diagnostics.weatherExactDeduplicated += 1;
        diagnostics.weatherDeduplicated += 1;
        markPersisted(observation, reason);
      } else diagnostics.weatherPersistenceFailures += 1;
    }
  }
}

let weatherWriteTail: Promise<void> = Promise.resolve();
function enqueueWeatherWork<T>(work: () => Promise<T>): Promise<T> {
  const operation = weatherWriteTail.then(work, work);
  weatherWriteTail = operation.then(() => undefined, () => undefined);
  return operation;
}

export function persistAircraftWeatherObservations(aircraft: Aircraft[], receivedAt: Date, provider = "local"): Promise<void> {
  return enqueueWeatherWork(() => persistWeatherBatch(aircraft, receivedAt, provider));
}

export function flushAircraftWeatherPersistence(deadline = Date.now() + 1_500): Promise<number> {
  return enqueueWeatherWork(async () => {
    const database = getPrisma();
    if (!database) return 0;
    let flushed = 0;
    for (const accumulator of accumulators.values()) {
      if (Date.now() >= deadline || flushed >= AIRCRAFT_WEATHER_PERSISTENCE_POLICY.accumulator.shutdownFlushMaxEntries) break;
      const observation = accumulator.lastObservation;
      if (!observation || (accumulator.lastPersisted && weatherObservationFingerprint(observation) === accumulator.lastPersistedFingerprint)) continue;
      observation.dedupKey = dedupKey(observation);
      try {
        await writeWeatherObservation(database, observation);
        rememberMemoryRow(observation);
        markPersisted(observation, "HEARTBEAT");
        flushed += 1;
      } catch (error) {
        if (isUniqueConflict(error)) markPersisted(observation, "HEARTBEAT");
        else diagnostics.weatherPersistenceFailures += 1;
      }
    }
    return flushed;
  });
}

let lastWeatherRetentionAt = 0;
export async function pruneAircraftWeatherRetention(database: NonNullable<ReturnType<typeof getPrisma>>, now = new Date()): Promise<number> {
  if (now.getTime() - lastWeatherRetentionAt < 6 * 60 * 60_000) return 0;
  lastWeatherRetentionAt = now.getTime();
  const table = (database.orm.public as unknown as { AircraftWeatherObservation?: unknown }).AircraftWeatherObservation;
  if (!table) return 0;
  const candidates = table as { where(predicate: (row: { observedAt: { lt(value: unknown): unknown } }) => unknown): { limit(value: number): { select(field: string): { all(): Promise<Array<{ id: number }>> } } } };
  const deleter = table as { where(predicate: (row: { id: { in(value: number[]): unknown } }) => unknown): { deleteAndCount(): Promise<number> } };
  const cutoff = Temporal.Instant.fromEpochMilliseconds(now.getTime() - getHistoryRetentionDays() * 24 * 60 * 60_000);
  let deleted = 0;
  for (let batch = 0; batch < 20; batch += 1) {
    const rows = await candidates.where((row) => row.observedAt.lt(cutoff)).limit(10_000).select("id").all();
    if (!rows.length) break;
    deleted += await deleter.where((row) => row.id.in(rows.map((row) => row.id))).deleteAndCount();
    if (rows.length < 10_000) break;
  }
  return deleted;
}

export function getAircraftWeatherDiagnostics(): AircraftWeatherDiagnostics { return { ...diagnostics, lastAnomalies: diagnostics.lastAnomalies.slice() }; }
export function resetAircraftWeatherDiagnostics(): void { Object.assign(diagnostics, emptyDiagnostics()); accumulators.clear(); memoryRows.length = 0; weatherWriteTail = Promise.resolve(); }

export interface WeatherQuery { from: Date; to: Date; aircraftHex?: string; lat?: number; lon?: number; radiusKm?: number; minAltitude?: number; maxAltitude?: number; source?: AircraftWeatherSource; limit?: number; offset?: number; }
export function weatherQueryFetchLimit(query: WeatherQuery, limit: number, offset: number): number {
  // The current ORM path applies the radius predicate after rows are read.
  // Fetch the bounded weather maximum first for spatial queries so nearby
  // observations are not hidden behind unrelated rows from the same window.
  return query.lat !== undefined && query.lon !== undefined
    ? AIRCRAFT_WEATHER_LIMITS.maxRows
    : Math.min(AIRCRAFT_WEATHER_LIMITS.maxRows, offset + limit + 1);
}
export interface WeatherRow extends Omit<AircraftWeatherObservation, "observedAt" | "receivedAt" | "provenance" | "staticAirTemperatureC" | "totalAirTemperatureC"> {
  staticAirTempC: number | null;
  totalAirTempC: number | null;
  observedAt: Date | Temporal.Instant;
  receivedAt: Date | Temporal.Instant | null;
  provenanceJson: string;
}
type Field = { gte(value: unknown): unknown; gt(value: unknown): unknown; lt(value: unknown): unknown; lte(value: unknown): unknown; asc(): unknown; desc(): unknown };
type Collection<T> = { where(predicate: (row: Record<string, Field>) => unknown): Collection<T>; orderBy(value: unknown): Collection<T>; limit(value: number): Collection<T>; offset?(value: number): Collection<T>; all(): Promise<T[]> };
function rowDate(value: Date | Temporal.Instant): Date { return dateOf(value); }
export function observationFromStoredWeatherRow(row: WeatherRow): AircraftWeatherObservation {
  const { staticAirTempC, totalAirTempC, provenanceJson, ...fields } = row;
  return {
    ...fields,
    observedAt: rowDate(row.observedAt),
    receivedAt: row.receivedAt ? rowDate(row.receivedAt) : null,
    staticAirTemperatureC: staticAirTempC,
    totalAirTemperatureC: totalAirTempC,
    provenance: JSON.parse(provenanceJson || "{}") as Record<string, AircraftFieldProvenance>,
  };
}

export async function queryAircraftWeatherObservations(query: WeatherQuery): Promise<{ observations: AircraftWeatherObservation[]; totalApproximate: number; source: "postgres" | "memory" }> {
  const limit = Math.min(AIRCRAFT_WEATHER_LIMITS.maxRows, Math.max(1, Math.trunc(query.limit ?? 500)));
  const offset = Math.max(0, Math.trunc(query.offset ?? 0));
  const inArea = (row: AircraftWeatherObservation): boolean => query.lat === undefined || query.lon === undefined || haversineDistanceKm(query.lat, query.lon, row.lat, row.lon) <= (query.radiusKm ?? 50);
  const inQuery = (row: AircraftWeatherObservation): boolean => row.observedAt >= query.from && row.observedAt < query.to && (query.aircraftHex === undefined || row.aircraftHex === query.aircraftHex) && (query.minAltitude === undefined || row.altitudeFt >= query.minAltitude) && (query.maxAltitude === undefined || row.altitudeFt <= query.maxAltitude) && (query.source === undefined || row.source === query.source) && row.quality !== "REJECTED" && inArea(row);
  const memoryResult = (): { observations: AircraftWeatherObservation[]; totalApproximate: number; source: "memory" } => {
    const matches = memoryRows.filter(inQuery).sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime());
    return { observations: matches.slice(offset, offset + limit), totalApproximate: matches.length, source: "memory" };
  };
  const database = getPrisma();
  if (!database) return memoryResult();
  try {
    const table = database.orm.public.AircraftWeatherObservation as unknown as Collection<WeatherRow>;
    let filtered = table.where((row) => row.observedAt.gte(Temporal.Instant.fromEpochMilliseconds(query.from.getTime()))).where((row) => row.observedAt.lt(Temporal.Instant.fromEpochMilliseconds(query.to.getTime())));
    if (query.aircraftHex !== undefined) filtered = (filtered as unknown as { where(value: Record<string, unknown>): Collection<WeatherRow> }).where({ aircraftHex: query.aircraftHex });
    if (query.minAltitude !== undefined) filtered = filtered.where((row) => row.altitudeFt.gte(query.minAltitude));
    if (query.maxAltitude !== undefined) filtered = filtered.where((row) => row.altitudeFt.lte(query.maxAltitude));
    if (query.source !== undefined) filtered = (filtered as unknown as { where(value: Record<string, unknown>): Collection<WeatherRow> }).where({ source: query.source });
    const rows = await trackDbOperation("weather.observation.query", () => filtered.orderBy((row: Record<string, Field>) => row.observedAt.desc()).limit(weatherQueryFetchLimit(query, limit, offset)).all());
    const observations = rows.map(observationFromStoredWeatherRow).filter(inArea).slice(offset, offset + limit);
    return { observations, totalApproximate: observations.length + (rows.length > offset + limit ? 1 : 0), source: "postgres" };
  } catch {
    // Backward-compatible during the short window before the additive
    // migration is applied: do not turn an otherwise healthy weather API into
    // a hard outage.
    return memoryResult();
  }
}

export interface WeatherProfileBin { altitudeFt: number; temperatureC: number | null; totalAirTemperatureC: number | null; windDirectionDeg: number | null; windSpeedKt: number | null; staticPressureHpa: number | null; humidityPct: number | null; turbulenceLevel: number | null; sampleCount: number; aircraftCount: number; confidence: ProfileConfidence; oldestObservedAt: string; newestObservedAt: string; }
export interface WeatherProfile { generatedAt: string; window: { from: string; to: string; minutes: number }; area: { lat: number; lon: number; radiusKm: number }; binSizeFt: number; bins: WeatherProfileBin[]; }
function median(values: number[]): number | null { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2; }
function windVector(direction: number, speed: number): { u: number; v: number } { const radians = direction * Math.PI / 180; return { u: -speed * Math.sin(radians), v: -speed * Math.cos(radians) }; }
function windFromVector(u: number, v: number): { direction: number; speed: number } { return { direction: ((Math.atan2(-u, -v) * 180 / Math.PI) + 360) % 360, speed: Math.hypot(u, v) }; }
function confidence(aircraftCount: number, sampleCount: number, newestAt: number, oldestAt: number, qualities: WeatherQuality[], spread: number | null, now: number): ProfileConfidence {
  const age = Math.max(0, now - newestAt); if (sampleCount < 2 || aircraftCount < 1) return "INSUFFICIENT";
  if (aircraftCount >= 3 && sampleCount >= 6 && age <= 10 * 60_000 && (spread === null || spread <= 12) && qualities.every((quality) => quality === "HIGH" || quality === "GOOD")) return "HIGH";
  if (aircraftCount >= 2 && age <= 20 * 60_000) return "MEDIUM";
  if (oldestAt < now - AIRCRAFT_WEATHER_LIMITS.maxQueryWindowMs) return "LOW";
  return "LOW";
}
export function aggregateAircraftWeatherProfile(observations: AircraftWeatherObservation[], options: { lat: number; lon: number; radiusKm: number; from: Date; to: Date; binSizeFt?: number; now?: Date }): WeatherProfile {
  const binSizeFt = Math.min(10_000, Math.max(500, Math.trunc(options.binSizeFt ?? AIRCRAFT_WEATHER_LIMITS.defaultBinSizeFt)));
  const selected = observations.filter((row) => row.quality !== "REJECTED" && row.observedAt >= options.from && row.observedAt < options.to && haversineDistanceKm(options.lat, options.lon, row.lat, row.lon) <= options.radiusKm);
  const grouped = new Map<number, AircraftWeatherObservation[]>();
  for (const row of selected) { const key = Math.floor(row.altitudeFt / binSizeFt) * binSizeFt; const values = grouped.get(key) ?? []; values.push(row); grouped.set(key, values); }
  const bins = [...grouped.entries()].sort(([a], [b]) => a - b).map(([altitudeFt, rows]) => {
    const byAircraft = new Map<string, AircraftWeatherObservation[]>(); for (const row of rows) (byAircraft.get(row.aircraftHex) ?? (byAircraft.set(row.aircraftHex, []), byAircraft.get(row.aircraftHex)!)).push(row);
    const representatives = [...byAircraft.values()].map((aircraftRows) => {
      const winds = aircraftRows.filter((row) => row.windDirectionDeg !== null && row.windSpeedKt !== null).map((row) => windVector(row.windDirectionDeg!, row.windSpeedKt!));
      const wind = winds.length ? windFromVector(winds.reduce((sum, value) => sum + value.u, 0) / winds.length, winds.reduce((sum, value) => sum + value.v, 0) / winds.length) : null;
      return {
        row: aircraftRows[0]!,
        temp: median(aircraftRows.map((row) => row.staticAirTemperatureC).filter((value): value is number => value !== null)),
        total: median(aircraftRows.map((row) => row.totalAirTemperatureC).filter((value): value is number => value !== null)),
        pressure: median(aircraftRows.map((row) => row.staticPressureHpa).filter((value): value is number => value !== null)),
        humidity: median(aircraftRows.map((row) => row.humidityPct).filter((value): value is number => value !== null)),
        turbulence: median(aircraftRows.map((row) => row.turbulenceLevel).filter((value): value is number => value !== null)),
        wind,
      };
    });
    const vectors = representatives.flatMap((representative) => representative.wind ? [windVector(representative.wind.direction, representative.wind.speed)] : []); const averagedWind = vectors.length ? windFromVector(vectors.reduce((sum, value) => sum + value.u, 0) / vectors.length, vectors.reduce((sum, value) => sum + value.v, 0) / vectors.length) : null;
    const temperatures = representatives.map((row) => row.temp).filter((value): value is number => value !== null); const oldest = Math.min(...rows.map((row) => row.observedAt.getTime())); const newest = Math.max(...rows.map((row) => row.observedAt.getTime()));
    return { altitudeFt, temperatureC: median(temperatures), totalAirTemperatureC: median(representatives.map((row) => row.total).filter((value): value is number => value !== null)), windDirectionDeg: averagedWind ? averagedWind.direction : null, windSpeedKt: averagedWind ? averagedWind.speed : null, staticPressureHpa: median(representatives.map((row) => row.pressure).filter((value): value is number => value !== null)), humidityPct: median(representatives.map((row) => row.humidity).filter((value): value is number => value !== null)), turbulenceLevel: median(representatives.map((row) => row.turbulence).filter((value): value is number => value !== null)), sampleCount: rows.length, aircraftCount: representatives.length, confidence: confidence(representatives.length, rows.length, newest, oldest, rows.map((row) => row.quality), temperatures.length > 1 ? Math.max(...temperatures) - Math.min(...temperatures) : null, (options.now ?? new Date()).getTime()), oldestObservedAt: new Date(oldest).toISOString(), newestObservedAt: new Date(newest).toISOString() };
  });
  return { generatedAt: (options.now ?? new Date()).toISOString(), window: { from: options.from.toISOString(), to: options.to.toISOString(), minutes: Math.round((options.to.getTime() - options.from.getTime()) / 60_000) }, area: { lat: options.lat, lon: options.lon, radiusKm: options.radiusKm }, binSizeFt, bins };
}

export async function getAircraftWeatherProfile(options: { lat: number; lon: number; radiusKm: number; from: Date; to: Date; binSizeFt?: number }): Promise<WeatherProfile> {
  const result = await queryAircraftWeatherObservations({ ...options, limit: AIRCRAFT_WEATHER_LIMITS.maxRows });
  return aggregateAircraftWeatherProfile(result.observations, options);
}
