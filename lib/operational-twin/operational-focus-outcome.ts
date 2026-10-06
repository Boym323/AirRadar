import type { AircraftOperationalFocusType } from "./types";
import type { OperationalTwinEventOutcomeReport, OperationalTwinEventOutcomeSlice } from "./event-outcome";

export const OPERATIONAL_FOCUS_OUTCOME_VERSION = "operational-focus-outcome-v1" as const;

export type OperationalFocusOutcomeAvailability = "AVAILABLE" | "UNAVAILABLE";

export interface OperationalFocusOutcomeTypeReport {
  type: AircraftOperationalFocusType;
  availability: OperationalFocusOutcomeAvailability;
  truthLane: "EVENT_OUTCOME_SIGMET" | null;
  scoreable: number;
  observed: number;
  falsePositive: number;
  precision: number | null;
  missingTruthRate: number | null;
  timingSamples: number;
  meanAbsoluteTimingErrorSeconds: number | null;
  limitation: string | null;
}

export interface OperationalFocusOutcomeReport {
  version: typeof OPERATIONAL_FOCUS_OUTCOME_VERSION;
  generatedAt: string;
  decision: "PASS" | "WAIT" | "FAIL";
  scoreableTypes: AircraftOperationalFocusType[];
  byType: Record<AircraftOperationalFocusType, OperationalFocusOutcomeTypeReport>;
  limitations: Array<
    "DERIVED_FROM_INDEPENDENT_EVENT_OUTCOME"
    | "NO_FOCUS_SELF_VALIDATION"
    | "NON_SIGMET_FOCUS_TRUTH_UNAVAILABLE_V1"
  >;
}

function unavailable(type: AircraftOperationalFocusType, limitation: string): OperationalFocusOutcomeTypeReport {
  return {
    type,
    availability: "UNAVAILABLE",
    truthLane: null,
    scoreable: 0,
    observed: 0,
    falsePositive: 0,
    precision: null,
    missingTruthRate: null,
    timingSamples: 0,
    meanAbsoluteTimingErrorSeconds: null,
    limitation,
  };
}

function fromSigmet(slice: OperationalTwinEventOutcomeSlice): OperationalFocusOutcomeTypeReport {
  return {
    type: "WEATHER",
    availability: "AVAILABLE",
    truthLane: "EVENT_OUTCOME_SIGMET",
    scoreable: slice.scoreable,
    observed: slice.observed,
    falsePositive: slice.falsePositive,
    precision: slice.precision,
    missingTruthRate: slice.missingTruthRate,
    timingSamples: slice.timingSamples,
    meanAbsoluteTimingErrorSeconds: slice.meanAbsoluteTimingErrorSeconds,
    limitation: "WEATHER_V1_VALIDATES_SIGMET_INTERSECTION_ONLY",
  };
}

export function buildOperationalFocusOutcomeReport(
  eventOutcome: OperationalTwinEventOutcomeReport,
): OperationalFocusOutcomeReport {
  const weather = fromSigmet(eventOutcome.byType.SIGMET_INTERSECTION);
  const byType: Record<AircraftOperationalFocusType, OperationalFocusOutcomeTypeReport> = {
    WEATHER: weather,
    NAVIGATION_INTEGRITY: unavailable("NAVIGATION_INTEGRITY", "INDEPENDENT_NAVIGATION_INTEGRITY_FOCUS_TRUTH_NOT_AVAILABLE"),
    PLANNED_AIRSPACE: unavailable("PLANNED_AIRSPACE", "PLANNED_ALLOCATION_IS_NOT_CONFIRMED_ACTIVATION_TRUTH"),
    TRAJECTORY: unavailable("TRAJECTORY", "INDEPENDENT_TRAJECTORY_FOCUS_TRUTH_NOT_AVAILABLE"),
  };

  const enoughEvidence = weather.scoreable >= 20 && weather.timingSamples >= 10;
  const qualityPass = enoughEvidence
    && weather.precision !== null
    && weather.precision >= 0.70
    && weather.missingTruthRate !== null
    && weather.missingTruthRate <= 0.40
    && weather.meanAbsoluteTimingErrorSeconds !== null
    && weather.meanAbsoluteTimingErrorSeconds <= 240;
  const qualityFail = enoughEvidence && !qualityPass;

  return {
    version: OPERATIONAL_FOCUS_OUTCOME_VERSION,
    generatedAt: eventOutcome.generatedAt,
    decision: !enoughEvidence ? "WAIT" : qualityFail ? "FAIL" : "PASS",
    scoreableTypes: ["WEATHER"],
    byType,
    limitations: [
      "DERIVED_FROM_INDEPENDENT_EVENT_OUTCOME",
      "NO_FOCUS_SELF_VALIDATION",
      "NON_SIGMET_FOCUS_TRUTH_UNAVAILABLE_V1",
    ],
  };
}
