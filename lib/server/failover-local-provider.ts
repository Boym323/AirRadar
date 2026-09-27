import type { AircraftProvider } from "@/lib/server/provider";
import type { Aircraft, AircraftAdsbTelemetry, ProviderSnapshot } from "@/lib/aircraft/types";
import type { BeastLocalProvider, BeastDiagnostics } from "@/lib/server/beast-local-provider";

const TELEMETRY_FRESHNESS_MS = 30_000;

function fieldObservedAt(beast: Aircraft, field: string, fallbackAt: number | null | undefined): number | null {
  const timestamp = beast.provenance?.fields?.[field]?.observedAt;
  if (timestamp) {
    const parsed = Date.parse(timestamp);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallbackAt ?? null;
}

function fieldFresh(beast: Aircraft, field: string, fallbackAt: number | null | undefined, jsonAt: number): boolean {
  const observedAt = fieldObservedAt(beast, field, fallbackAt);
  return observedAt !== null && jsonAt - observedAt <= TELEMETRY_FRESHNESS_MS;
}

function mergeTelemetry(beast: Aircraft, json: Aircraft, beastAt: number | null | undefined, jsonAt: number): AircraftAdsbTelemetry | null {
  const beastTelemetry = beast.adsbTelemetry;
  const jsonTelemetry = json.adsbTelemetry;
  if (!beastTelemetry && !jsonTelemetry) return null;

  const scalar = <K extends keyof AircraftAdsbTelemetry>(field: K): AircraftAdsbTelemetry[K] => {
    const beastValue = beastTelemetry?.[field];
    if (beastValue !== null && beastValue !== undefined && fieldFresh(beast, String(field), beastAt, jsonAt)) return beastValue;
    return (jsonTelemetry?.[field] ?? null) as AircraftAdsbTelemetry[K];
  };

  const result: AircraftAdsbTelemetry = {
    iasKt: scalar("iasKt") as number | null,
    tasKt: scalar("tasKt") as number | null,
    mach: scalar("mach") as number | null,
    windDirectionDeg: scalar("windDirectionDeg") as number | null,
    windSpeedKt: scalar("windSpeedKt") as number | null,
    outsideAirTemperatureC: scalar("outsideAirTemperatureC") as number | null,
    totalAirTemperatureC: scalar("totalAirTemperatureC") as number | null,
    staticPressureHpa: scalar("staticPressureHpa") as number | null,
    navQnhHpa: scalar("navQnhHpa") as number | null,
    selectedAltitudeMcpFt: scalar("selectedAltitudeMcpFt") as number | null,
    selectedAltitudeFmsFt: scalar("selectedAltitudeFmsFt") as number | null,
    selectedHeadingDeg: scalar("selectedHeadingDeg") as number | null,
    navModes: beastTelemetry?.navModes?.length && fieldFresh(beast, "navModes", beastAt, jsonAt)
      ? beastTelemetry.navModes
      : jsonTelemetry?.navModes ?? [],
    nic: scalar("nic") as number | null,
    containmentRadiusM: scalar("containmentRadiusM") as number | null,
    nacP: scalar("nacP") as number | null,
    nacV: scalar("nacV") as number | null,
    sil: scalar("sil") as number | null,
    silType: scalar("silType") as string | null,
    gva: scalar("gva") as number | null,
    sda: scalar("sda") as number | null,
    adsbVersion: scalar("adsbVersion") as number | null,
    alert: scalar("alert") as number | null,
    spi: scalar("spi") as number | null,
    dbFlags: scalar("dbFlags") as number | null,
    magneticHeadingDeg: scalar("magneticHeadingDeg") as number | null,
    trueHeadingDeg: scalar("trueHeadingDeg") as number | null,
    rollDeg: scalar("rollDeg") as number | null,
    trackRateDegPerSec: scalar("trackRateDegPerSec") as number | null,
  };
  return Object.values(result).some((item) => Array.isArray(item) ? item.length > 0 : item !== null && item !== undefined) ? result : null;
}

function preferredValue<T>(beastValue: T | null | undefined, jsonValue: T | null | undefined, beastAt: number | null | undefined, jsonAt: number | null | undefined): T | null {
  if (beastValue === null || beastValue === undefined) return jsonValue ?? null;
  if (jsonValue === null || jsonValue === undefined) return beastValue;
  if (beastAt !== undefined && beastAt !== null && jsonAt !== undefined && jsonAt !== null) return beastAt >= jsonAt ? beastValue : jsonValue;
  return beastValue;
}

function preferredAltitude(beastValue: number | null | undefined, jsonValue: number | null | undefined, beastAt: number | null | undefined, jsonAt: number): number | null {
  if (beastValue !== null && beastValue !== undefined && jsonValue !== null && jsonValue !== undefined
    && Math.abs(beastValue - jsonValue) > 12_000) return jsonValue;
  return preferredValue(beastValue, jsonValue, beastAt, jsonAt);
}

/** Merge two observations from the same local receiver without letting null
 * fields in a fresh Beast frame erase readsb's aggregated values. */
export function mergeLocalAircraft(beast: Aircraft, json: Aircraft): Aircraft {
  const position = beast.lat !== null && beast.lon !== null ? beast : json;
  const beastTimes = beast.observationTimes;
  const jsonTime = Date.parse(json.lastSeen);
  const beastExtendedAt = beastTimes?.extendedTelemetry;
  const beastTargetStateFresh = fieldFresh(beast, "targetState", beastExtendedAt, jsonTime);
  const beastOperationalStatusFresh = fieldFresh(beast, "operationalStatus", beastExtendedAt, jsonTime);
  return {
    ...json,
    ...beast,
    callsign: beast.callsign ?? json.callsign,
    registration: beast.registration ?? json.registration,
    aircraftType: beast.aircraftType ?? json.aircraftType,
    aircraftDescription: beast.aircraftDescription ?? json.aircraftDescription,
    lat: position.lat,
    lon: position.lon,
    altitude: preferredAltitude(beast.altitude, json.altitude, beastTimes?.altitude, jsonTime),
    baroAltitude: preferredAltitude(beast.baroAltitude, json.baroAltitude, beastTimes?.baroAltitude, jsonTime),
    geomAltitude: preferredAltitude(beast.geomAltitude, json.geomAltitude, beastTimes?.geomAltitude, jsonTime),
    groundSpeed: preferredValue(beast.groundSpeed, json.groundSpeed, beastTimes?.groundSpeed, jsonTime),
    track: preferredValue(beast.track, json.track, beastTimes?.track, jsonTime),
    verticalRate: preferredValue(beast.verticalRate, json.verticalRate, beastTimes?.verticalRate, jsonTime),
    baroRate: beast.baroRate ?? json.baroRate,
    geomRate: beast.geomRate ?? json.geomRate,
    squawk: beast.squawk ?? json.squawk,
    category: beast.category ?? json.category,
    emergency: beast.emergency ?? json.emergency,
    rssi: beast.rssi ?? json.rssi,
    messages: json.messages ?? beast.messages,
    seenPosSeconds: position.seenPosSeconds,
    distanceKm: position.distanceKm,
    bearing: position.bearing,
    trail: beast.trail.length > 0 ? beast.trail : json.trail,
    source: beast.source === "UNKNOWN" ? json.source : beast.source,
    sourceType: beast.sourceType ?? json.sourceType,
    onGround: beast.onGround || json.onGround,
    targetState: beastTargetStateFresh ? beast.targetState ?? json.targetState ?? null : json.targetState ?? null,
    operationalStatus: beastOperationalStatusFresh ? beast.operationalStatus ?? json.operationalStatus ?? null : json.operationalStatus ?? null,
    adsbTelemetry: mergeTelemetry(beast, json, beastExtendedAt, jsonTime),
    provenance: {
      seenLocal: true,
      seenNetwork: false,
      lastLocalSeen: beast.lastSeen,
      lastNetworkSeen: null,
      positionOrigin: position.lat !== null && position.lon !== null ? "local" : null,
      positionSource: position.source,
      fields: mergeFieldProvenance(beast, json, beastExtendedAt, jsonTime),
    },
    observationTimes: beast.observationTimes ?? json.observationTimes,
  };
}

function mergeFieldProvenance(beast: Aircraft, json: Aircraft, beastAt: number | null | undefined, jsonAt: number): NonNullable<Aircraft["provenance"]>["fields"] {
  const result = { ...(json.provenance?.fields ?? {}) };
  for (const [field, value] of Object.entries(beast.provenance?.fields ?? {})) {
    if (fieldFresh(beast, field, beastAt, jsonAt)) result[field] = value;
  }
  for (const field of Object.keys(beast.adsbTelemetry ?? {})) {
    const key = field as keyof AircraftAdsbTelemetry;
    const beastValue = beast.adsbTelemetry?.[key];
    const jsonValue = json.adsbTelemetry?.[key];
    if (beastValue != null && (!Array.isArray(beastValue) || beastValue.length > 0) && fieldFresh(beast, field, beastAt, jsonAt)) {
      const observedAt = fieldObservedAt(beast, field, beastAt);
      if (observedAt !== null) result[field] ??= { origin: "local", protocol: "beast-mode-s", observedAt: new Date(observedAt).toISOString(), confidence: "high" };
    } else if (!result[field] && jsonValue != null && (!Array.isArray(jsonValue) || jsonValue.length > 0)) {
      result[field] = { origin: "local", protocol: "readsb-json", observedAt: json.lastSeen, confidence: "high" };
    }
  }
  return result;
}

function mergeLocalSnapshots(beast: ProviderSnapshot, json: ProviderSnapshot): ProviderSnapshot {
  const byHex = new Map(json.aircraft.map((aircraft) => [aircraft.icaoHex, aircraft]));
  for (const aircraft of beast.aircraft) {
    const existing = byHex.get(aircraft.icaoHex);
    byHex.set(aircraft.icaoHex, existing ? mergeLocalAircraft(aircraft, existing) : aircraft);
  }
  return {
    ...beast,
    aircraft: [...byHex.values()],
    receiver: beast.receiver,
    provider: "readsb-beast+json-merged",
  };
}

export class FailoverLocalProvider implements AircraftProvider {
  readonly name = "local-beast+json-failover";
  private active: "beast" | "json" = "json";
  private fallbackSince: number | null = null;
  private recoveryFrames = 0;
  private jsonCache: { snapshot: ProviderSnapshot; fetchedAt: number } | null = null;
  private readonly jsonCacheMs = 1_000;
  private readonly jsonStaleGraceMs = 5_000;
  constructor(private readonly beast: BeastLocalProvider, private readonly json: AircraftProvider, private readonly jsonEnabled: boolean) {}
  async getSnapshot(): Promise<ProviderSnapshot> {
    const beastSnapshot = await this.beast.getSnapshot(); const diagnostics = this.beast.getDiagnostics();
    const healthy = diagnostics.status === "healthy" && diagnostics.lastFrameAt !== null;
    if (healthy && this.active === "json") { this.recoveryFrames += diagnostics.framesDecoded > 0 ? 1 : 0; if (this.recoveryFrames >= 3) { this.active = "beast"; this.fallbackSince = null; } }
    if (!healthy) { this.recoveryFrames = 0; if (this.active === "beast" || this.fallbackSince === null) this.fallbackSince ??= Date.now(); this.active = this.jsonEnabled ? "json" : "beast"; }
    if (this.active === "beast") {
      if (!this.jsonEnabled) return beastSnapshot;
      const jsonSnapshot = await this.supplementaryJsonSnapshot();
      if (jsonSnapshot) {
        return mergeLocalSnapshots(beastSnapshot, jsonSnapshot);
      }
      // Beast remains the live source when the supplementary JSON endpoint
      // is temporarily unavailable.
      return beastSnapshot;
    }
    if (this.jsonEnabled) {
      const snapshot = await this.supplementaryJsonSnapshot();
      if (snapshot) return { ...snapshot, provider: "readsb-json-fallback" };
    }
    return beastSnapshot;
  }
  private async supplementaryJsonSnapshot(): Promise<ProviderSnapshot | null> {
    const now = Date.now();
    if (this.jsonCache && now - this.jsonCache.fetchedAt < this.jsonCacheMs) return this.jsonCache.snapshot;
    try {
      const snapshot = await this.json.getSnapshot();
      this.jsonCache = { snapshot, fetchedAt: Date.now() };
      return snapshot;
    } catch {
      return this.jsonCache && now - this.jsonCache.fetchedAt <= this.jsonStaleGraceMs ? this.jsonCache.snapshot : null;
    }
  }
  getDiagnostics(): BeastDiagnostics & { activeSource: "beast" | "json-fallback"; fallbackSince: string | null } { return { ...this.beast.getDiagnostics(), activeSource: this.active === "beast" ? "beast" : "json-fallback", fallbackSince: this.fallbackSince === null ? null : new Date(this.fallbackSince).toISOString() }; }
  abort(): void { this.beast.abort?.(); this.json.abort?.(); }
  async close(): Promise<void> { await this.beast.close?.(); await this.json.close?.(); }
}
