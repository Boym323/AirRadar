import type { OperationalTwinAircraftState } from "./corridor";
import type { OperationalTwinCorridor, OperationalTwinTrajectoryPoint } from "./types";

export const OPERATIONAL_TWIN_TRAJECTORY_QUALITY_V2_VERSION =
  "operational-digital-twin-trajectory-quality-v2" as const;

export type OperationalTwinTrajectoryPhase =
  | "CLIMB"
  | "CRUISE"
  | "DESCENT"
  | "LEVEL"
  | "UNKNOWN";

export interface OperationalTwinTrajectoryQualityCheckpoint {
  offsetMinutes: 5 | 15 | 30;
  canonicalAltitudeFt: number | null;
  qualityAltitudeFt: number | null;
  altitudeDeltaFt: number | null;
}

export interface OperationalTwinTrajectoryQualityV2 {
  version: typeof OPERATIONAL_TWIN_TRAJECTORY_QUALITY_V2_VERSION;
  status: "AVAILABLE" | "INSUFFICIENT";
  phase: OperationalTwinTrajectoryPhase;
  verticalProfile: "RATE_TAPERED" | "ALTITUDE_HOLD" | "UNAVAILABLE";
  points: OperationalTwinTrajectoryPoint[];
  checkpoints: OperationalTwinTrajectoryQualityCheckpoint[];
  canonicalRemainsActive: true;
  autoPromotion: false;
  limitations: Array<
    | "SHADOW_ONLY"
    | "NO_AIRCRAFT_PERFORMANCE_MODEL"
    | "NO_ATC_CLEARANCE_INFERENCE"
    | "HORIZONTAL_PATH_UNCHANGED"
    | "NOT_FMS_INTENT"
  >;
}

const MAX_ALTITUDE_FT = 60_000;
const FULL_RATE_MINUTES = 3;
const TAPER_END_MINUTES = 12;

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function classifyOperationalTwinTrajectoryPhase(
  altitudeFt: number | null,
  verticalRateFpm: number | null,
): OperationalTwinTrajectoryPhase {
  if (!finite(altitudeFt)) return "UNKNOWN";
  if (finite(verticalRateFpm) && verticalRateFpm >= 500) return "CLIMB";
  if (finite(verticalRateFpm) && verticalRateFpm <= -500) return "DESCENT";
  if (altitudeFt >= 18_000) return "CRUISE";
  return "LEVEL";
}

function effectiveRateMinutes(offsetMinutes: number): number {
  const bounded = Math.max(0, offsetMinutes);
  if (bounded <= FULL_RATE_MINUTES) return bounded;
  if (bounded >= TAPER_END_MINUTES) {
    return FULL_RATE_MINUTES + (TAPER_END_MINUTES - FULL_RATE_MINUTES) / 2;
  }
  const taperMinutes = bounded - FULL_RATE_MINUTES;
  const taperSpan = TAPER_END_MINUTES - FULL_RATE_MINUTES;
  return FULL_RATE_MINUTES
    + taperMinutes
    - (taperMinutes * taperMinutes) / (2 * taperSpan);
}

function phaseAwareAltitude(
  altitudeFt: number,
  verticalRateFpm: number | null,
  phase: OperationalTwinTrajectoryPhase,
  offsetMinutes: number,
): number {
  const rate = finite(verticalRateFpm) ? verticalRateFpm : 0;
  const projected = phase === "CLIMB" || phase === "DESCENT"
    ? altitudeFt + rate * effectiveRateMinutes(offsetMinutes)
    : altitudeFt;
  return Math.max(0, Math.min(MAX_ALTITUDE_FT, Math.round(projected)));
}

function interpolatedAltitude(
  points: readonly OperationalTwinTrajectoryPoint[],
  offsetMinutes: number,
): number | null {
  const exact = points.find((point) => point.offsetMinutes === offsetMinutes);
  if (exact) return exact.altitudeFt;
  const before = [...points].reverse().find((point) => point.offsetMinutes < offsetMinutes);
  const after = points.find((point) => point.offsetMinutes > offsetMinutes);
  if (!before || !after || before.altitudeFt === null || after.altitudeFt === null) return null;
  const span = after.offsetMinutes - before.offsetMinutes;
  if (span <= 0) return before.altitudeFt;
  const fraction = (offsetMinutes - before.offsetMinutes) / span;
  return Math.round(before.altitudeFt + (after.altitudeFt - before.altitudeFt) * fraction);
}

function checkpoint(
  offsetMinutes: 5 | 15 | 30,
  corridor: OperationalTwinCorridor,
  aircraft: OperationalTwinAircraftState,
  phase: OperationalTwinTrajectoryPhase,
): OperationalTwinTrajectoryQualityCheckpoint {
  const canonicalAltitudeFt = interpolatedAltitude(corridor.points, offsetMinutes);
  const qualityAltitudeFt = finite(aircraft.altitudeFt)
    ? phaseAwareAltitude(aircraft.altitudeFt, aircraft.verticalRateFpm, phase, offsetMinutes)
    : null;
  return {
    offsetMinutes,
    canonicalAltitudeFt,
    qualityAltitudeFt,
    altitudeDeltaFt: canonicalAltitudeFt !== null && qualityAltitudeFt !== null
      ? qualityAltitudeFt - canonicalAltitudeFt
      : null,
  };
}

export function buildOperationalTwinTrajectoryQualityV2(input: {
  aircraft: OperationalTwinAircraftState;
  corridor: OperationalTwinCorridor;
}): OperationalTwinTrajectoryQualityV2 {
  const phase = classifyOperationalTwinTrajectoryPhase(
    input.aircraft.altitudeFt,
    input.aircraft.verticalRateFpm,
  );
  const usableAltitude = finite(input.aircraft.altitudeFt);

  if (!usableAltitude) {
    return {
      version: OPERATIONAL_TWIN_TRAJECTORY_QUALITY_V2_VERSION,
      status: "INSUFFICIENT",
      phase,
      verticalProfile: "UNAVAILABLE",
      points: [],
      checkpoints: [],
      canonicalRemainsActive: true,
      autoPromotion: false,
      limitations: [
        "SHADOW_ONLY",
        "NO_AIRCRAFT_PERFORMANCE_MODEL",
        "NO_ATC_CLEARANCE_INFERENCE",
        "HORIZONTAL_PATH_UNCHANGED",
        "NOT_FMS_INTENT",
      ],
    };
  }

  const verticalProfile = phase === "CLIMB" || phase === "DESCENT"
    ? "RATE_TAPERED" as const
    : "ALTITUDE_HOLD" as const;
  const points = input.corridor.points.map((point) => ({
    ...point,
    altitudeFt: phaseAwareAltitude(
      input.aircraft.altitudeFt!,
      input.aircraft.verticalRateFpm,
      phase,
      point.offsetMinutes,
    ),
  }));

  const checkpoints = ([5, 15, 30] as const).map((offsetMinutes) =>
    checkpoint(offsetMinutes, input.corridor, input.aircraft, phase));

  return {
    version: OPERATIONAL_TWIN_TRAJECTORY_QUALITY_V2_VERSION,
    status: "AVAILABLE",
    phase,
    verticalProfile,
    points,
    checkpoints,
    canonicalRemainsActive: true,
    autoPromotion: false,
    limitations: [
      "SHADOW_ONLY",
      "NO_AIRCRAFT_PERFORMANCE_MODEL",
      "NO_ATC_CLEARANCE_INFERENCE",
      "HORIZONTAL_PATH_UNCHANGED",
      "NOT_FMS_INTENT",
    ],
  };
}
