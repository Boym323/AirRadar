import type { AircraftWeatherObservation } from "@/lib/server/aircraft-weather";
import type { AircraftWindContext } from "@/lib/weather/aircraft-wind-context";
import type { AircraftSigmetContext } from "@/lib/weather/aircraft-sigmet-context";
import type { MetarMapObservation, PirepObservation } from "@/lib/weather/types";

export type WeatherFusionRiskKind = "TURBULENCE" | "ICING" | "CONVECTION";
export type WeatherFusionSeverity = "NONE" | "LOW" | "MODERATE" | "HIGH" | "UNKNOWN";
export type WeatherFusionConfidence = "LOW" | "MEDIUM" | "HIGH";
export type WeatherFusionSource = "AIRCRAFT_BDS44" | "AIRCRAFT_OTHER" | "PIREP_AIREP" | "SIGMET" | "METAR" | "ICON_EU";
export type WeatherFusionEvidenceCode =
  | "BDS_TURBULENCE"
  | "PIREP_TURBULENCE"
  | "PIREP_ICING"
  | "SIGMET_TURBULENCE"
  | "SIGMET_ICING"
  | "SIGMET_CONVECTION"
  | "METAR_CONVECTION"
  | "METAR_FREEZING_MOISTURE";

export interface WeatherFusionEvidence {
  id: string;
  source: WeatherFusionSource;
  risk: WeatherFusionRiskKind;
  severity: Exclude<WeatherFusionSeverity, "UNKNOWN">;
  confidence: WeatherFusionConfidence;
  code: WeatherFusionEvidenceCode;
  observedAt: string | null;
  distanceNm: number | null;
  altitudeDeltaFt: number | null;
  detail: string | null;
}

export interface WeatherFusionRisk {
  kind: WeatherFusionRiskKind;
  severity: WeatherFusionSeverity;
  confidence: WeatherFusionConfidence;
  evidenceCount: number;
  sourceCount: number;
  evidenceIds: string[];
}

export interface WeatherFusionWindComparison {
  status: "AGREE" | "MIXED" | "DIVERGENT" | "UNAVAILABLE";
  confidence: WeatherFusionConfidence;
  observed: {
    source: "AIRCRAFT_BDS44" | "AIRCRAFT_OTHER";
    directionDeg: number;
    speedKt: number;
    observedAt: string;
  } | null;
  model: {
    source: "ICON_EU";
    directionDeg: number;
    speedKt: number;
    validAt: string;
    levelHpa: number;
    sourceDistanceKm: number;
    stale: boolean;
  } | null;
  speedDeltaKt: number | null;
  directionDeltaDeg: number | null;
}

export interface WeatherFusionSourceStatus {
  source: WeatherFusionSource;
  state: "AVAILABLE" | "STALE" | "UNAVAILABLE";
  count: number;
  newestAt: string | null;
}

export interface WeatherFusionResult {
  version: "weather-fusion-v1";
  generatedAt: string;
  status: "AVAILABLE" | "PARTIAL" | "INSUFFICIENT";
  aircraftHex: string;
  position: { lat: number; lon: number; altitudeFt: number | null };
  overall: {
    severity: WeatherFusionSeverity;
    confidence: WeatherFusionConfidence;
    dominantRisk: WeatherFusionRiskKind | null;
  };
  risks: WeatherFusionRisk[];
  wind: WeatherFusionWindComparison;
  evidence: WeatherFusionEvidence[];
  sources: WeatherFusionSourceStatus[];
}

export interface WeatherFusionInput {
  aircraftHex: string;
  lat: number;
  lon: number;
  altitudeFt: number | null;
  now?: Date;
  aircraftObservations: readonly AircraftWeatherObservation[];
  pireps: readonly PirepObservation[];
  sigmets: readonly AircraftSigmetContext[];
  metar: (MetarMapObservation & { distanceNm: number }) | null;
  modelWind: AircraftWindContext | null;
  sourceAvailability?: Partial<Record<WeatherFusionSource, "AVAILABLE" | "STALE" | "UNAVAILABLE">>;
}

const severityRank: Record<WeatherFusionSeverity, number> = { UNKNOWN: -1, NONE: 0, LOW: 1, MODERATE: 2, HIGH: 3 };
const confidenceRank: Record<WeatherFusionConfidence, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 };

function normalized(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

function circularDelta(a: number, b: number): number {
  const raw = Math.abs((((a - b) % 360) + 360) % 360);
  return raw > 180 ? 360 - raw : raw;
}

function distanceNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = 3440.065;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const p1 = lat1 * toRad;
  const p2 = lat2 * toRad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) ** 2;
  return r * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

function pirepSeverity(value: string | null | undefined): Exclude<WeatherFusionSeverity, "UNKNOWN"> | null {
  const text = normalized(value);
  if (!text || /^(NEG|NIL|NONE|SMTH|SMOOTH)$/.test(text)) return text ? "NONE" : null;
  if (/(EXTREME|EXTRM|SEV)/.test(text)) return "HIGH";
  if (/(MOD|MDT)/.test(text)) return "MODERATE";
  if (/(LGT|LIGHT|TRACE)/.test(text)) return "LOW";
  return null;
}

function bdsTurbulenceSeverity(level: number | null): Exclude<WeatherFusionSeverity, "UNKNOWN"> | null {
  if (level === null || !Number.isFinite(level)) return null;
  if (level <= 0) return "NONE";
  if (level === 1) return "LOW";
  if (level === 2) return "MODERATE";
  return "HIGH";
}

function sigmetRisk(value: AircraftSigmetContext): { risk: WeatherFusionRiskKind; code: WeatherFusionEvidenceCode } | null {
  const text = `${value.hazard ?? ""} ${value.phenomenon ?? ""}`.toUpperCase();
  if (/TURB/.test(text)) return { risk: "TURBULENCE", code: "SIGMET_TURBULENCE" };
  if (/ICE|ICING/.test(text)) return { risk: "ICING", code: "SIGMET_ICING" };
  if (/TS|THUNDER|CONV|CB/.test(text)) return { risk: "CONVECTION", code: "SIGMET_CONVECTION" };
  return null;
}

function metarConvection(metar: MetarMapObservation): boolean {
  const text = `${metar.rawMetar ?? ""}`.toUpperCase();
  return /(^|\s)(TS|VCTS|TSRA|TSGR|TSGS)(\s|$)/.test(text) || /(^|\s)CB(\s|$)/.test(text);
}

function metarFreezingMoisture(metar: MetarMapObservation): boolean {
  if (metar.temperature === null || metar.temperature < -20 || metar.temperature > 3) return false;
  const text = `${metar.rawMetar ?? ""}`.toUpperCase();
  const moisture = /(RA|DZ|SN|SG|PL|FZ|BR|FG)|BKN|OVC/.test(text);
  return moisture;
}

function evidenceConfidence(source: WeatherFusionSource, distance: number | null, altitudeDelta: number | null, stale = false): WeatherFusionConfidence {
  if (stale) return "LOW";
  if (source === "AIRCRAFT_BDS44") return "HIGH";
  if (source === "AIRCRAFT_OTHER") return "MEDIUM";
  if (source === "SIGMET") return "HIGH";
  if (source === "PIREP_AIREP") {
    if ((distance ?? 999) <= 30 && (altitudeDelta === null || altitudeDelta <= 3_000)) return "HIGH";
    if ((distance ?? 999) <= 80 && (altitudeDelta === null || altitudeDelta <= 6_000)) return "MEDIUM";
    return "LOW";
  }
  if (source === "METAR") return "LOW";
  return "MEDIUM";
}

function buildRisk(kind: WeatherFusionRiskKind, evidence: WeatherFusionEvidence[]): WeatherFusionRisk {
  const relevant = evidence.filter((item) => item.risk === kind && item.severity !== "NONE");
  if (!relevant.length) {
    const clearEvidence = evidence.filter((item) => item.risk === kind && item.severity === "NONE");
    return {
      kind,
      severity: clearEvidence.length ? "NONE" : "UNKNOWN",
      confidence: clearEvidence.length >= 2 ? "MEDIUM" : "LOW",
      evidenceCount: clearEvidence.length,
      sourceCount: new Set(clearEvidence.map((item) => item.source)).size,
      evidenceIds: clearEvidence.map((item) => item.id),
    };
  }
  const maxRank = Math.max(...relevant.map((item) => severityRank[item.severity]));
  const strongest = relevant.filter((item) => severityRank[item.severity] === maxRank);
  const sources = new Set(relevant.map((item) => item.source));
  const bestConfidence = Math.max(...strongest.map((item) => confidenceRank[item.confidence]));
  const confidence: WeatherFusionConfidence = sources.size >= 2 && bestConfidence >= 2 ? "HIGH" : bestConfidence >= 2 ? "MEDIUM" : "LOW";
  return {
    kind,
    severity: strongest[0]!.severity,
    confidence,
    evidenceCount: relevant.length,
    sourceCount: sources.size,
    evidenceIds: relevant.map((item) => item.id),
  };
}

function newest(values: Array<string | null | undefined>): string | null {
  const valid = values.filter((value): value is string => Boolean(value && Number.isFinite(Date.parse(value))));
  if (!valid.length) return null;
  return valid.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
}

export function buildWeatherFusion(input: WeatherFusionInput): WeatherFusionResult {
  const now = input.now ?? new Date();
  const evidence: WeatherFusionEvidence[] = [];
  const latestAircraft = [...input.aircraftObservations]
    .filter((item) => item.quality !== "REJECTED")
    .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime())[0] ?? null;

  if (latestAircraft) {
    const severity = bdsTurbulenceSeverity(latestAircraft.turbulenceLevel);
    if (severity !== null) {
      const source: WeatherFusionSource = latestAircraft.source === "BDS_4_4" ? "AIRCRAFT_BDS44" : "AIRCRAFT_OTHER";
      evidence.push({
        id: `aircraft:${latestAircraft.aircraftHex}:${latestAircraft.observedAt.toISOString()}:turb`,
        source,
        risk: "TURBULENCE",
        severity,
        confidence: evidenceConfidence(source, 0, input.altitudeFt === null ? null : Math.abs(latestAircraft.altitudeFt - input.altitudeFt)),
        code: "BDS_TURBULENCE",
        observedAt: latestAircraft.observedAt.toISOString(),
        distanceNm: distanceNm(input.lat, input.lon, latestAircraft.lat, latestAircraft.lon),
        altitudeDeltaFt: input.altitudeFt === null ? null : Math.abs(latestAircraft.altitudeFt - input.altitudeFt),
        detail: latestAircraft.turbulenceLevel === null ? null : String(latestAircraft.turbulenceLevel),
      });
    }
  }

  for (const report of input.pireps) {
    const distance = distanceNm(input.lat, input.lon, report.latitude, report.longitude);
    if (distance > 120) continue;
    const altitudeDelta = input.altitudeFt === null || report.altitudeFt === null ? null : Math.abs(report.altitudeFt - input.altitudeFt);
    if (altitudeDelta !== null && altitudeDelta > 10_000) continue;
    const turb = pirepSeverity(report.turbulence?.intensity);
    if (turb !== null) {
      evidence.push({
        id: `pirep:${report.id}:turb`,
        source: "PIREP_AIREP",
        risk: "TURBULENCE",
        severity: turb,
        confidence: evidenceConfidence("PIREP_AIREP", distance, altitudeDelta),
        code: "PIREP_TURBULENCE",
        observedAt: report.observedAt,
        distanceNm: Number(distance.toFixed(1)),
        altitudeDeltaFt: altitudeDelta,
        detail: report.turbulence?.intensity ?? null,
      });
    }
    const icing = pirepSeverity(report.icing?.intensity);
    if (icing !== null) {
      evidence.push({
        id: `pirep:${report.id}:icing`,
        source: "PIREP_AIREP",
        risk: "ICING",
        severity: icing,
        confidence: evidenceConfidence("PIREP_AIREP", distance, altitudeDelta),
        code: "PIREP_ICING",
        observedAt: report.observedAt,
        distanceNm: Number(distance.toFixed(1)),
        altitudeDeltaFt: altitudeDelta,
        detail: report.icing?.intensity ?? null,
      });
    }
  }

  for (const sigmet of input.sigmets) {
    const mapped = sigmetRisk(sigmet);
    if (!mapped) continue;
    evidence.push({
      id: `sigmet:${sigmet.id}:${mapped.risk}`,
      source: "SIGMET",
      risk: mapped.risk,
      severity: "HIGH",
      confidence: sigmet.verticalMatch === "matched" ? "HIGH" : "MEDIUM",
      code: mapped.code,
      observedAt: null,
      distanceNm: sigmet.distanceNm === null ? null : Number(sigmet.distanceNm.toFixed(1)),
      altitudeDeltaFt: null,
      detail: sigmet.hazard ?? sigmet.phenomenon,
    });
  }

  if (input.metar) {
    if (metarConvection(input.metar)) {
      evidence.push({
        id: `metar:${input.metar.stationId}:conv`,
        source: "METAR",
        risk: "CONVECTION",
        severity: "MODERATE",
        confidence: evidenceConfidence("METAR", input.metar.distanceNm, null, input.metar.stale),
        code: "METAR_CONVECTION",
        observedAt: input.metar.observedAt,
        distanceNm: input.metar.distanceNm,
        altitudeDeltaFt: null,
        detail: input.metar.rawMetar,
      });
    }
    if (metarFreezingMoisture(input.metar)) {
      evidence.push({
        id: `metar:${input.metar.stationId}:icing`,
        source: "METAR",
        risk: "ICING",
        severity: "LOW",
        confidence: evidenceConfidence("METAR", input.metar.distanceNm, null, input.metar.stale),
        code: "METAR_FREEZING_MOISTURE",
        observedAt: input.metar.observedAt,
        distanceNm: input.metar.distanceNm,
        altitudeDeltaFt: null,
        detail: input.metar.rawMetar,
      });
    }
  }

  const risks = (["TURBULENCE", "ICING", "CONVECTION"] as const).map((kind) => buildRisk(kind, evidence));
  const ranked = risks.filter((risk) => risk.severity !== "UNKNOWN").sort((a, b) => severityRank[b.severity] - severityRank[a.severity] || confidenceRank[b.confidence] - confidenceRank[a.confidence]);
  const dominant = ranked[0] ?? null;

  const observedWind = latestAircraft?.windDirectionDeg !== null && latestAircraft?.windDirectionDeg !== undefined
    && latestAircraft.windSpeedKt !== null && latestAircraft.windSpeedKt !== undefined
    ? {
        source: (latestAircraft.source === "BDS_4_4" ? "AIRCRAFT_BDS44" : "AIRCRAFT_OTHER") as "AIRCRAFT_BDS44" | "AIRCRAFT_OTHER",
        directionDeg: latestAircraft.windDirectionDeg,
        speedKt: latestAircraft.windSpeedKt,
        observedAt: latestAircraft.observedAt.toISOString(),
      }
    : null;
  const modelWind = input.modelWind ? {
    source: "ICON_EU" as const,
    directionDeg: input.modelWind.windFromDeg,
    speedKt: input.modelWind.windSpeedKt,
    validAt: input.modelWind.validAt,
    levelHpa: input.modelWind.levelHpa,
    sourceDistanceKm: input.modelWind.sourceDistanceKm,
    stale: input.modelWind.stale,
  } : null;

  let wind: WeatherFusionWindComparison;
  if (!observedWind || !modelWind) {
    wind = { status: "UNAVAILABLE", confidence: "LOW", observed: observedWind, model: modelWind, speedDeltaKt: null, directionDeltaDeg: null };
  } else {
    const speedDeltaKt = Math.abs(observedWind.speedKt - modelWind.speedKt);
    const directionDeltaDeg = circularDelta(observedWind.directionDeg, modelWind.directionDeg);
    const status = speedDeltaKt <= 20 && directionDeltaDeg <= 30 ? "AGREE"
      : speedDeltaKt <= 40 && directionDeltaDeg <= 60 ? "MIXED"
        : "DIVERGENT";
    wind = {
      status,
      confidence: observedWind.source === "AIRCRAFT_BDS44" && !modelWind.stale ? "HIGH" : modelWind.stale ? "LOW" : "MEDIUM",
      observed: observedWind,
      model: modelWind,
      speedDeltaKt: Number(speedDeltaKt.toFixed(1)),
      directionDeltaDeg: Number(directionDeltaDeg.toFixed(1)),
    };
  }

  const sourceEvidence: Record<WeatherFusionSource, { count: number; times: Array<string | null>; fallbackState: "AVAILABLE" | "STALE" | "UNAVAILABLE" }> = {
    AIRCRAFT_BDS44: { count: latestAircraft?.source === "BDS_4_4" ? 1 : 0, times: [latestAircraft?.source === "BDS_4_4" ? latestAircraft.observedAt.toISOString() : null], fallbackState: latestAircraft?.source === "BDS_4_4" ? "AVAILABLE" : "UNAVAILABLE" },
    AIRCRAFT_OTHER: { count: latestAircraft && latestAircraft.source !== "BDS_4_4" ? 1 : 0, times: [latestAircraft && latestAircraft.source !== "BDS_4_4" ? latestAircraft.observedAt.toISOString() : null], fallbackState: latestAircraft && latestAircraft.source !== "BDS_4_4" ? "AVAILABLE" : "UNAVAILABLE" },
    PIREP_AIREP: { count: input.pireps.length, times: input.pireps.map((item) => item.observedAt), fallbackState: input.pireps.length ? "AVAILABLE" : "UNAVAILABLE" },
    SIGMET: { count: input.sigmets.length, times: [], fallbackState: input.sigmets.length ? "AVAILABLE" : "UNAVAILABLE" },
    METAR: { count: input.metar ? 1 : 0, times: [input.metar?.observedAt ?? null], fallbackState: input.metar ? input.metar.stale ? "STALE" : "AVAILABLE" : "UNAVAILABLE" },
    ICON_EU: { count: input.modelWind ? 1 : 0, times: [input.modelWind?.validAt ?? null], fallbackState: input.modelWind ? input.modelWind.stale ? "STALE" : "AVAILABLE" : "UNAVAILABLE" },
  };
  const sources = (Object.keys(sourceEvidence) as WeatherFusionSource[]).map((source) => ({
    source,
    state: input.sourceAvailability?.[source] ?? sourceEvidence[source].fallbackState,
    count: sourceEvidence[source].count,
    newestAt: newest(sourceEvidence[source].times),
  }));

  const availableSourceCount = sources.filter((source) => source.state !== "UNAVAILABLE").length;
  const status: WeatherFusionResult["status"] = availableSourceCount >= 4 ? "AVAILABLE" : availableSourceCount >= 2 ? "PARTIAL" : "INSUFFICIENT";

  return {
    version: "weather-fusion-v1",
    generatedAt: now.toISOString(),
    status,
    aircraftHex: input.aircraftHex.toUpperCase(),
    position: { lat: input.lat, lon: input.lon, altitudeFt: input.altitudeFt },
    overall: {
      severity: dominant?.severity ?? "UNKNOWN",
      confidence: dominant?.confidence ?? "LOW",
      dominantRisk: dominant?.severity === "NONE" ? null : dominant?.kind ?? null,
    },
    risks,
    wind,
    evidence: evidence.sort((a, b) => severityRank[b.severity] - severityRank[a.severity] || confidenceRank[b.confidence] - confidenceRank[a.confidence]),
    sources,
  };
}
