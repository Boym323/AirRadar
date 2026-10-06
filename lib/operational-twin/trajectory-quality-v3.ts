import type { OperationalTwinAircraftState } from "./corridor";
import {
  classifyOperationalTwinTrajectoryPhase,
  type OperationalTwinTrajectoryPhase,
  type OperationalTwinTrajectoryQualityV2,
} from "./trajectory-quality-v2";
import type { OperationalTwinCorridor, OperationalTwinTrajectoryPoint } from "./types";

export const OPERATIONAL_TWIN_TRAJECTORY_QUALITY_V3_VERSION =
  "operational-digital-twin-trajectory-quality-v3" as const;

export type OperationalTwinPerformanceClass =
  | "JET"
  | "TURBOPROP"
  | "PISTON"
  | "ROTORCRAFT"
  | "UNKNOWN";

export type OperationalTwinPerformanceSize =
  | "LIGHT"
  | "SMALL"
  | "LARGE"
  | "HEAVY"
  | "UNKNOWN";

export type OperationalTwinTrajectoryQualityV3Profile =
  | "SELECTED_ALTITUDE_CAPTURE"
  | "PERFORMANCE_TAPERED"
  | "ALTITUDE_HOLD"
  | "V2_FALLBACK"
  | "UNAVAILABLE";

export interface OperationalTwinPerformanceEnvelope {
  performanceClass: OperationalTwinPerformanceClass;
  size: OperationalTwinPerformanceSize;
  maxVerticalRateFpm: number | null;
  fullRateMinutes: number | null;
  taperEndMinutes: number | null;
  source: "ICAO_DESCRIPTION" | "ADSB_CATEGORY" | "UNAVAILABLE";
}

export interface OperationalTwinSelectedAltitudeSignal {
  altitudeFt: number | null;
  source: "MCP/FCU" | "FMS" | "N/A" | null;
  accepted: boolean;
  estimatedCaptureMinutes: number | null;
  rejectionReason:
    | "unavailable"
    | "invalid"
    | "phase_not_vertical"
    | "direction_mismatch"
    | "source_unavailable"
    | null;
}

export interface OperationalTwinTrajectoryQualityV3Checkpoint {
  offsetMinutes: 5 | 15 | 30;
  canonicalAltitudeFt: number | null;
  v2AltitudeFt: number | null;
  v3AltitudeFt: number | null;
  deltaFromCanonicalFt: number | null;
  deltaFromV2Ft: number | null;
}

export interface OperationalTwinTrajectoryQualityV3 {
  version: typeof OPERATIONAL_TWIN_TRAJECTORY_QUALITY_V3_VERSION;
  status: "AVAILABLE" | "INSUFFICIENT";
  phase: OperationalTwinTrajectoryPhase;
  verticalProfile: OperationalTwinTrajectoryQualityV3Profile;
  performance: OperationalTwinPerformanceEnvelope;
  selectedAltitude: OperationalTwinSelectedAltitudeSignal;
  points: OperationalTwinTrajectoryPoint[];
  checkpoints: OperationalTwinTrajectoryQualityV3Checkpoint[];
  canonicalRemainsActive: true;
  v2RemainsPromotionCandidate: true;
  autoPromotion: false;
  limitations: Array<
    | "SHADOW_ONLY"
    | "PERFORMANCE_ENVELOPE_HEURISTIC"
    | "SELECTED_ALTITUDE_IS_NOT_CLEARANCE"
    | "NO_DESTINATION_VERTICAL_PROFILE"
    | "HORIZONTAL_PATH_UNCHANGED"
    | "NOT_FMS_INTENT"
  >;
}

const MAX_ALTITUDE_FT = 60_000;

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sizeFromCategory(category: string | null | undefined): OperationalTwinPerformanceSize {
  switch (category?.trim().toUpperCase()) {
    case "A1": return "LIGHT";
    case "A2": return "SMALL";
    case "A3":
    case "A4": return "LARGE";
    case "A5": return "HEAVY";
    default: return "UNKNOWN";
  }
}

export function classifyOperationalTwinPerformance(input: {
  aircraftDescription?: string | null;
  category?: string | null;
}): OperationalTwinPerformanceEnvelope {
  const description = input.aircraftDescription?.trim().toUpperCase() ?? "";
  const size = sizeFromCategory(input.category);

  if (input.category?.trim().toUpperCase() === "A7" || description.startsWith("H")) {
    return {
      performanceClass: "ROTORCRAFT",
      size,
      maxVerticalRateFpm: 1_800,
      fullRateMinutes: 2,
      taperEndMinutes: 7,
      source: description ? "ICAO_DESCRIPTION" : "ADSB_CATEGORY",
    };
  }

  const propulsion = /^.[0-9]([A-Z])/.exec(description)?.[1] ?? null;
  if (propulsion === "J") {
    const maxVerticalRateFpm = size === "HEAVY" ? 2_800 : size === "LARGE" ? 3_200 : 4_000;
    return {
      performanceClass: "JET",
      size,
      maxVerticalRateFpm,
      fullRateMinutes: 4,
      taperEndMinutes: 15,
      source: "ICAO_DESCRIPTION",
    };
  }
  if (propulsion === "T") {
    return {
      performanceClass: "TURBOPROP",
      size,
      maxVerticalRateFpm: 2_400,
      fullRateMinutes: 3,
      taperEndMinutes: 12,
      source: "ICAO_DESCRIPTION",
    };
  }
  if (propulsion === "P") {
    return {
      performanceClass: "PISTON",
      size,
      maxVerticalRateFpm: 1_600,
      fullRateMinutes: 2,
      taperEndMinutes: 9,
      source: "ICAO_DESCRIPTION",
    };
  }

  return {
    performanceClass: "UNKNOWN",
    size,
    maxVerticalRateFpm: null,
    fullRateMinutes: null,
    taperEndMinutes: null,
    source: "UNAVAILABLE",
  };
}

function boundedAltitude(value: number): number {
  return Math.max(0, Math.min(MAX_ALTITUDE_FT, Math.round(value)));
}

function effectiveRateMinutes(offsetMinutes: number, fullRateMinutes: number, taperEndMinutes: number): number {
  const bounded = Math.max(0, offsetMinutes);
  if (bounded <= fullRateMinutes) return bounded;
  if (bounded >= taperEndMinutes) {
    return fullRateMinutes + (taperEndMinutes - fullRateMinutes) / 2;
  }
  const taperMinutes = bounded - fullRateMinutes;
  const taperSpan = taperEndMinutes - fullRateMinutes;
  return fullRateMinutes
    + taperMinutes
    - (taperMinutes * taperMinutes) / (2 * taperSpan);
}

function selectedAltitudeSignal(
  aircraft: OperationalTwinAircraftState,
  phase: OperationalTwinTrajectoryPhase,
  boundedRateFpm: number,
): OperationalTwinSelectedAltitudeSignal {
  const selected = aircraft.selectedAltitudeFt;
  const source = aircraft.selectedAltitudeSource ?? null;
  if (!finite(selected)) {
    return { altitudeFt: null, source, accepted: false, estimatedCaptureMinutes: null, rejectionReason: "unavailable" };
  }
  if (selected < 0 || selected > MAX_ALTITUDE_FT) {
    return { altitudeFt: selected, source, accepted: false, estimatedCaptureMinutes: null, rejectionReason: "invalid" };
  }
  if (source === null || source === "N/A") {
    return { altitudeFt: selected, source, accepted: false, estimatedCaptureMinutes: null, rejectionReason: "source_unavailable" };
  }
  if (!finite(aircraft.altitudeFt) || (phase !== "CLIMB" && phase !== "DESCENT") || Math.abs(boundedRateFpm) < 500) {
    return { altitudeFt: selected, source, accepted: false, estimatedCaptureMinutes: null, rejectionReason: "phase_not_vertical" };
  }

  const delta = selected - aircraft.altitudeFt;
  const aligned = phase === "CLIMB"
    ? delta > 0 && boundedRateFpm > 0
    : delta < 0 && boundedRateFpm < 0;
  if (!aligned) {
    return { altitudeFt: selected, source, accepted: false, estimatedCaptureMinutes: null, rejectionReason: "direction_mismatch" };
  }

  return {
    altitudeFt: selected,
    source,
    accepted: true,
    estimatedCaptureMinutes: Number((Math.abs(delta / boundedRateFpm)).toFixed(1)),
    rejectionReason: null,
  };
}

function selectedAltitudeProjection(
  altitudeFt: number,
  rateFpm: number,
  targetFt: number,
  phase: "CLIMB" | "DESCENT",
  offsetMinutes: number,
): number {
  const projected = altitudeFt + rateFpm * Math.max(0, offsetMinutes);
  return boundedAltitude(phase === "CLIMB"
    ? Math.min(projected, targetFt)
    : Math.max(projected, targetFt));
}

function performanceProjection(
  altitudeFt: number,
  rateFpm: number,
  envelope: OperationalTwinPerformanceEnvelope,
  offsetMinutes: number,
): number {
  if (
    envelope.maxVerticalRateFpm === null
    || envelope.fullRateMinutes === null
    || envelope.taperEndMinutes === null
  ) {
    return boundedAltitude(altitudeFt);
  }
  const activeMinutes = effectiveRateMinutes(
    offsetMinutes,
    envelope.fullRateMinutes,
    envelope.taperEndMinutes,
  );
  return boundedAltitude(altitudeFt + rateFpm * activeMinutes);
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

function buildCheckpoints(
  corridor: OperationalTwinCorridor,
  v2: OperationalTwinTrajectoryQualityV2,
  v3Points: readonly OperationalTwinTrajectoryPoint[],
): OperationalTwinTrajectoryQualityV3Checkpoint[] {
  return ([5, 15, 30] as const).map((offsetMinutes) => {
    const canonicalAltitudeFt = interpolatedAltitude(corridor.points, offsetMinutes);
    const v2AltitudeFt = interpolatedAltitude(v2.points, offsetMinutes);
    const v3AltitudeFt = interpolatedAltitude(v3Points, offsetMinutes);
    return {
      offsetMinutes,
      canonicalAltitudeFt,
      v2AltitudeFt,
      v3AltitudeFt,
      deltaFromCanonicalFt: canonicalAltitudeFt !== null && v3AltitudeFt !== null
        ? v3AltitudeFt - canonicalAltitudeFt
        : null,
      deltaFromV2Ft: v2AltitudeFt !== null && v3AltitudeFt !== null
        ? v3AltitudeFt - v2AltitudeFt
        : null,
    };
  });
}

export function buildOperationalTwinTrajectoryQualityV3(input: {
  aircraft: OperationalTwinAircraftState;
  corridor: OperationalTwinCorridor;
  trajectoryQualityV2: OperationalTwinTrajectoryQualityV2;
}): OperationalTwinTrajectoryQualityV3 {
  const phase = classifyOperationalTwinTrajectoryPhase(
    input.aircraft.altitudeFt,
    input.aircraft.verticalRateFpm,
  );
  const performance = classifyOperationalTwinPerformance({
    aircraftDescription: input.aircraft.aircraftDescription,
    category: input.aircraft.category,
  });

  if (!finite(input.aircraft.altitudeFt) || input.trajectoryQualityV2.status !== "AVAILABLE") {
    return {
      version: OPERATIONAL_TWIN_TRAJECTORY_QUALITY_V3_VERSION,
      status: "INSUFFICIENT",
      phase,
      verticalProfile: "UNAVAILABLE",
      performance,
      selectedAltitude: {
        altitudeFt: finite(input.aircraft.selectedAltitudeFt) ? input.aircraft.selectedAltitudeFt : null,
        source: input.aircraft.selectedAltitudeSource ?? null,
        accepted: false,
        estimatedCaptureMinutes: null,
        rejectionReason: "unavailable",
      },
      points: [],
      checkpoints: [],
      canonicalRemainsActive: true,
      v2RemainsPromotionCandidate: true,
      autoPromotion: false,
      limitations: [
        "SHADOW_ONLY",
        "PERFORMANCE_ENVELOPE_HEURISTIC",
        "SELECTED_ALTITUDE_IS_NOT_CLEARANCE",
        "NO_DESTINATION_VERTICAL_PROFILE",
        "HORIZONTAL_PATH_UNCHANGED",
        "NOT_FMS_INTENT",
      ],
    };
  }

  const observedRate = finite(input.aircraft.verticalRateFpm) ? input.aircraft.verticalRateFpm : 0;
  const maxRate = performance.maxVerticalRateFpm;
  const boundedRate = maxRate === null
    ? observedRate
    : Math.max(-maxRate, Math.min(maxRate, observedRate));
  const selectedAltitude = selectedAltitudeSignal(input.aircraft, phase, boundedRate);

  let verticalProfile: OperationalTwinTrajectoryQualityV3Profile;
  let points: OperationalTwinTrajectoryPoint[];

  if (selectedAltitude.accepted && selectedAltitude.altitudeFt !== null && (phase === "CLIMB" || phase === "DESCENT")) {
    verticalProfile = "SELECTED_ALTITUDE_CAPTURE";
    points = input.corridor.points.map((point) => ({
      ...point,
      altitudeFt: selectedAltitudeProjection(
        input.aircraft.altitudeFt!,
        boundedRate,
        selectedAltitude.altitudeFt!,
        phase,
        point.offsetMinutes,
      ),
    }));
  } else if (
    (phase === "CLIMB" || phase === "DESCENT")
    && performance.performanceClass !== "UNKNOWN"
    && performance.maxVerticalRateFpm !== null
  ) {
    verticalProfile = "PERFORMANCE_TAPERED";
    points = input.corridor.points.map((point) => ({
      ...point,
      altitudeFt: performanceProjection(
        input.aircraft.altitudeFt!,
        boundedRate,
        performance,
        point.offsetMinutes,
      ),
    }));
  } else if (phase === "CRUISE" || phase === "LEVEL") {
    verticalProfile = "ALTITUDE_HOLD";
    points = input.corridor.points.map((point) => ({
      ...point,
      altitudeFt: boundedAltitude(input.aircraft.altitudeFt!),
    }));
  } else {
    verticalProfile = "V2_FALLBACK";
    points = input.trajectoryQualityV2.points.map((point) => ({ ...point }));
  }

  return {
    version: OPERATIONAL_TWIN_TRAJECTORY_QUALITY_V3_VERSION,
    status: "AVAILABLE",
    phase,
    verticalProfile,
    performance,
    selectedAltitude,
    points,
    checkpoints: buildCheckpoints(input.corridor, input.trajectoryQualityV2, points),
    canonicalRemainsActive: true,
    v2RemainsPromotionCandidate: true,
    autoPromotion: false,
    limitations: [
      "SHADOW_ONLY",
      "PERFORMANCE_ENVELOPE_HEURISTIC",
      "SELECTED_ALTITUDE_IS_NOT_CLEARANCE",
      "NO_DESTINATION_VERTICAL_PROFILE",
      "HORIZONTAL_PATH_UNCHANGED",
      "NOT_FMS_INTENT",
    ],
  };
}
