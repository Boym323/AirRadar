import type { AircraftProvider } from "@/lib/server/provider";
import type { Aircraft, AircraftAdsbTelemetry, ProviderSnapshot } from "@/lib/aircraft/types";
import type { BeastLocalProvider, BeastDiagnostics } from "@/lib/server/beast-local-provider";

function mergeTelemetry(beast: AircraftAdsbTelemetry | null | undefined, json: AircraftAdsbTelemetry | null | undefined): AircraftAdsbTelemetry | null {
  if (!beast && !json) return null;
  const primary = beast ?? json!;
  const fallback = beast ? json : null;
  return {
    ...primary,
    iasKt: primary.iasKt ?? fallback?.iasKt ?? null,
    tasKt: primary.tasKt ?? fallback?.tasKt ?? null,
    mach: primary.mach ?? fallback?.mach ?? null,
    windDirectionDeg: primary.windDirectionDeg ?? fallback?.windDirectionDeg ?? null,
    windSpeedKt: primary.windSpeedKt ?? fallback?.windSpeedKt ?? null,
    outsideAirTemperatureC: primary.outsideAirTemperatureC ?? fallback?.outsideAirTemperatureC ?? null,
    totalAirTemperatureC: primary.totalAirTemperatureC ?? fallback?.totalAirTemperatureC ?? null,
    navQnhHpa: primary.navQnhHpa ?? fallback?.navQnhHpa ?? null,
    selectedAltitudeMcpFt: primary.selectedAltitudeMcpFt ?? fallback?.selectedAltitudeMcpFt ?? null,
    selectedAltitudeFmsFt: primary.selectedAltitudeFmsFt ?? fallback?.selectedAltitudeFmsFt ?? null,
    selectedHeadingDeg: primary.selectedHeadingDeg ?? fallback?.selectedHeadingDeg ?? null,
    navModes: primary.navModes.length > 0 ? primary.navModes : fallback?.navModes ?? [],
    nic: primary.nic ?? fallback?.nic ?? null,
    containmentRadiusM: primary.containmentRadiusM ?? fallback?.containmentRadiusM ?? null,
    nacP: primary.nacP ?? fallback?.nacP ?? null,
    nacV: primary.nacV ?? fallback?.nacV ?? null,
    sil: primary.sil ?? fallback?.sil ?? null,
    silType: primary.silType ?? fallback?.silType ?? null,
    gva: primary.gva ?? fallback?.gva ?? null,
    sda: primary.sda ?? fallback?.sda ?? null,
    adsbVersion: primary.adsbVersion ?? fallback?.adsbVersion ?? null,
    alert: primary.alert ?? fallback?.alert ?? null,
    spi: primary.spi ?? fallback?.spi ?? null,
    dbFlags: primary.dbFlags ?? fallback?.dbFlags ?? null,
  };
}

/** Merge two observations from the same local receiver without letting null
 * fields in a fresh Beast frame erase readsb's aggregated values. */
export function mergeLocalAircraft(beast: Aircraft, json: Aircraft): Aircraft {
  const position = beast.lat !== null && beast.lon !== null ? beast : json;
  return {
    ...json,
    ...beast,
    callsign: beast.callsign ?? json.callsign,
    registration: beast.registration ?? json.registration,
    aircraftType: beast.aircraftType ?? json.aircraftType,
    aircraftDescription: beast.aircraftDescription ?? json.aircraftDescription,
    lat: position.lat,
    lon: position.lon,
    altitude: beast.altitude ?? json.altitude,
    baroAltitude: beast.baroAltitude ?? json.baroAltitude,
    geomAltitude: beast.geomAltitude ?? json.geomAltitude,
    groundSpeed: beast.groundSpeed ?? json.groundSpeed,
    track: beast.track ?? json.track,
    verticalRate: beast.verticalRate ?? json.verticalRate,
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
    targetState: beast.targetState ?? json.targetState ?? null,
    operationalStatus: beast.operationalStatus ?? json.operationalStatus ?? null,
    adsbTelemetry: mergeTelemetry(beast.adsbTelemetry, json.adsbTelemetry),
    provenance: {
      seenLocal: true,
      seenNetwork: false,
      lastLocalSeen: beast.lastSeen,
      lastNetworkSeen: null,
      positionOrigin: position.lat !== null && position.lon !== null ? "local" : null,
      positionSource: position.source,
    },
  };
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
  constructor(private readonly beast: BeastLocalProvider, private readonly json: AircraftProvider, private readonly jsonEnabled: boolean) {}
  async getSnapshot(): Promise<ProviderSnapshot> {
    const beastSnapshot = await this.beast.getSnapshot(); const diagnostics = this.beast.getDiagnostics();
    const healthy = diagnostics.status === "healthy" && diagnostics.lastFrameAt !== null;
    if (healthy && this.active === "json") { this.recoveryFrames += diagnostics.framesDecoded > 0 ? 1 : 0; if (this.recoveryFrames >= 3) { this.active = "beast"; this.fallbackSince = null; } }
    if (!healthy) { this.recoveryFrames = 0; if (this.active === "beast" || this.fallbackSince === null) this.fallbackSince ??= Date.now(); this.active = this.jsonEnabled ? "json" : "beast"; }
    if (this.active === "beast") {
      if (!this.jsonEnabled) return beastSnapshot;
      try {
        const jsonSnapshot = await this.json.getSnapshot();
        return mergeLocalSnapshots(beastSnapshot, jsonSnapshot);
      } catch {
        // Beast remains the live source when the supplementary JSON endpoint
        // is temporarily unavailable.
        return beastSnapshot;
      }
    }
    if (this.jsonEnabled) { const snapshot = await this.json.getSnapshot(); return { ...snapshot, provider: "readsb-json-fallback" }; }
    return beastSnapshot;
  }
  getDiagnostics(): BeastDiagnostics & { activeSource: "beast" | "json-fallback"; fallbackSince: string | null } { return { ...this.beast.getDiagnostics(), activeSource: this.active === "beast" ? "beast" : "json-fallback", fallbackSince: this.fallbackSince === null ? null : new Date(this.fallbackSince).toISOString() }; }
  abort(): void { this.beast.abort?.(); this.json.abort?.(); }
  async close(): Promise<void> { await this.beast.close?.(); await this.json.close?.(); }
}
