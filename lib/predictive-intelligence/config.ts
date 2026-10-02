import { PREDICTIVE_INTELLIGENCE_VERSION } from "./types";

/** Frozen, auditable parameters for calibration-1. Keep model constants here. */
export const PREDICTIVE_CALIBRATION_CONFIG = {
  modelVersion: PREDICTIVE_INTELLIGENCE_VERSION,
  calibrationVersion: "predictive-intelligence-v1-calibration-1",
  eta: { minimumProgressWindowMs: 90_000, maxSampleAgeMs: 5 * 60_000, minimumSpeedKt: 40, maximumSpeedKt: 650 },
  runway: { marginForChange: 0.15, minimumStabilityDurationMs: 0 },
  trajectory: { possibleCrossTrackKm: 25, deviationCrossTrackKm: 55 },
} as const;
