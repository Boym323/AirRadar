import type { OperationalTwinAircraftState } from "./corridor";
import type { OperationalTwinCorridor, OperationalTwinConfidence } from "./types";

export const OPERATIONAL_TWIN_TRAJECTORY_QUALITY_SHADOW_VERSION = "operational-digital-twin-trajectory-quality-shadow-v1" as const;

export type OperationalTwinTrajectoryPhase = "CLIMB" | "CRUISE" | "DESCENT" | "GROUND" | "UNKNOWN";

export interface OperationalTwinTrajectoryQualityCheckpoint {
  offsetMinutes: 5 | 15 | 30;
  canonicalAltitudeFt: number | null;
  candidateAltitudeFt: number | null;
  canonicalUncertaintyNm: number;
  candidateUncertaintyNm: number;
}

export interface OperationalTwinTrajectoryQualityShadow {
  version: typeof OPERATIONAL_TWIN_TRAJECTORY_QUALITY_SHADOW_VERSION;
  status: "AVAILABLE" | "INSUFFICIENT";
  phase: OperationalTwinTrajectoryPhase;
  confidence: OperationalTwinConfidence;
  geometryMode: OperationalTwinCorridor["mode"];
  canonicalRemainsActive: true;
  checkpoints: OperationalTwinTrajectoryQualityCheckpoint[];
  limitations: Array<
    "SHADOW_ONLY"
    | "NO_FMS_INTENT"
    | "NO_ATC_CLEARANCE_INFERENCE"
    | "SAME_HORIZONTAL_GEOMETRY_V1"
  >;
}

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function phaseFor(aircraft: OperationalTwinAircraftState): OperationalTwinTrajectoryPhase {
  if (aircraft.onGround) return "GROUND";
  const rate = finite(aircraft.verticalRateFpm) ? aircraft.verticalRateFpm : null;
  if (rate !== null && rate >= 500) return "CLIMB";
  if (rate !== null && rate <= -500) return "DESCENT";
  if (finite(aircraft.altitudeFt) && aircraft.altitudeFt >= 10_000) return "CRUISE";
  return rate === null ? "UNKNOWN" : "CRUISE";
}

function candidateAltitude(
  base: number | null,
  rateFpm: number | null,
  offsetMinutes: number,
  phase: OperationalTwinTrajectoryPhase,
): number | null {
  if (!finite(base)) return null;
  if (!finite(rateFpm) || phase === "CRUISE" || phase === "UNKNOWN") return Math.round(base);
  if (phase === "GROUND") return Math.max(0, Math.round(base));
  const fullRateMinutes = Math.min(offsetMinutes, 5);
  const decayMinutes = Math.max(0, Math.min(offsetMinutes - 5, 10));
  const effectiveMinutes = fullRateMinutes + decayMinutes * 0.5;
  return Math.max(0, Math.min(60_000, Math.round(base + rateFpm * effectiveMinutes)));
}

function confidenceFor(aircraft: OperationalTwinAircraftState, corridor: OperationalTwinCorridor): OperationalTwinConfidence {
  let evidence = 0;
  if (finite(aircraft.altitudeFt)) evidence += 1;
  if (finite(aircraft.verticalRateFpm)) evidence += 1;
  if (finite(aircraft.groundSpeedKt) && aircraft.groundSpeedKt >= 30) evidence += 1;
  if (finite(aircraft.trackDeg)) evidence += 1;
  if (corridor.mode === "ROUTE_AWARE") evidence += 1;
  return evidence >= 5 ? "HIGH" : evidence >= 3 ? "MEDIUM" : "LOW";
}

function uncertaintyScale(corridor: OperationalTwinCorridor, phase: OperationalTwinTrajectoryPhase, confidence: OperationalTwinConfidence): number {
  const modeScale = corridor.mode === "ROUTE_AWARE" ? 0.88 : 1.08;
  const phaseScale = phase === "CRUISE" ? 0.95 : phase === "CLIMB" || phase === "DESCENT" ? 1.05 : 1.12;
  const confidenceScale = confidence === "HIGH" ? 0.95 : confidence === "MEDIUM" ? 1 : 1.12;
  return modeScale * phaseScale * confidenceScale;
}

export function buildOperationalTwinTrajectoryQualityShadow(
  aircraft: OperationalTwinAircraftState,
  corridor: OperationalTwinCorridor,
): OperationalTwinTrajectoryQualityShadow {
  const phase = phaseFor(aircraft);
  const confidence = confidenceFor(aircraft, corridor);
  const status = phase === "GROUND" || confidence === "LOW" ? "INSUFFICIENT" : "AVAILABLE";
  const scale = uncertaintyScale(corridor, phase, confidence);
  const checkpoints = ([5, 15, 30] as const).map((offsetMinutes) => {
    const canonical = corridor.points.reduce((best, point) =>
      Math.abs(point.offsetMinutes - offsetMinutes) < Math.abs(best.offsetMinutes - offsetMinutes) ? point : best,
    corridor.points[0]!);
    return {
      offsetMinutes,
      canonicalAltitudeFt: canonical.altitudeFt,
      candidateAltitudeFt: candidateAltitude(aircraft.altitudeFt, aircraft.verticalRateFpm, offsetMinutes, phase),
      canonicalUncertaintyNm: canonical.uncertaintyNm,
      candidateUncertaintyNm: Number((canonical.uncertaintyNm * scale).toFixed(2)),
    };
  });
  return {
    version: OPERATIONAL_TWIN_TRAJECTORY_QUALITY_SHADOW_VERSION,
    status,
    phase,
    confidence,
    geometryMode: corridor.mode,
    canonicalRemainsActive: true,
    checkpoints,
    limitations: ["SHADOW_ONLY", "NO_FMS_INTENT", "NO_ATC_CLEARANCE_INFERENCE", "SAME_HORIZONTAL_GEOMETRY_V1"],
  };
}
