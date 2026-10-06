import { describe, expect, it } from "vitest";
import {
  OperationalTwinEventOutcomeValidator,
  OperationalTwinOutcomeValidator,
  OperationalTwinTrajectoryQualityOutcomeValidator,
  OperationalTwinTrajectoryQualityOutcomeV2Validator,
  OPERATIONAL_TWIN_EVENT_OUTCOME_VERSION,
  OPERATIONAL_TWIN_OUTCOME_VERSION,
  OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_VERSION,
  OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_V2_VERSION,
} from "@/lib/operational-twin";

const START = Date.parse("2026-10-05T14:00:00.000Z");
const NOW = Date.parse("2026-10-05T15:00:00.000Z");

const outcomeAggregate = {
  samples: 2,
  positionErrorNmSum: 3,
  uncertaintyNmSum: 5,
  errorToUncertaintyRatioSum: 1.2,
  insideUncertainty: 2,
  altitudeSamples: 1,
  altitudeErrorFtSum: 300,
};

const emptyOutcomeAggregate = {
  samples: 0,
  positionErrorNmSum: 0,
  uncertaintyNmSum: 0,
  errorToUncertaintyRatioSum: 0,
  insideUncertainty: 0,
  altitudeSamples: 0,
  altitudeErrorFtSum: 0,
};

const eventAggregate = {
  predictions: 2,
  observed: 1,
  falsePositive: 1,
  expiredNoTruth: 0,
  unscoreableTruth: 0,
  timingSamples: 1,
  signedTimingErrorSecondsSum: -30,
  absoluteTimingErrorSecondsSum: 30,
  within120Seconds: 1,
  within300Seconds: 1,
};

const emptyEventAggregate = {
  predictions: 0,
  observed: 0,
  falsePositive: 0,
  expiredNoTruth: 0,
  unscoreableTruth: 0,
  timingSamples: 0,
  signedTimingErrorSecondsSum: 0,
  absoluteTimingErrorSecondsSum: 0,
  within120Seconds: 0,
  within300Seconds: 0,
};

const trajectoryAggregate = {
  pairedSamples: 2,
  canonicalAbsoluteErrorFtSum: 1800,
  qualityAbsoluteErrorFtSum: 1000,
  qualityWins: 2,
  canonicalWins: 0,
  ties: 0,
};

const emptyTrajectoryAggregate = {
  pairedSamples: 0,
  canonicalAbsoluteErrorFtSum: 0,
  qualityAbsoluteErrorFtSum: 0,
  qualityWins: 0,
  canonicalWins: 0,
  ties: 0,
};

const trajectoryV2Aggregate = {
  pairedSamples: 2,
  canonicalAbsoluteErrorFtSum: 1800,
  v2AbsoluteErrorFtSum: 1000,
  v3AbsoluteErrorFtSum: 600,
  v2WinsCanonical: 2,
  canonicalWinsV2: 0,
  v2CanonicalTies: 0,
  v3WinsCanonical: 2,
  canonicalWinsV3: 0,
  v3CanonicalTies: 0,
  v3WinsV2: 2,
  v2WinsV3: 0,
  v3V2Ties: 0,
};

const emptyTrajectoryV2Aggregate = {
  pairedSamples: 0,
  canonicalAbsoluteErrorFtSum: 0,
  v2AbsoluteErrorFtSum: 0,
  v3AbsoluteErrorFtSum: 0,
  v2WinsCanonical: 0,
  canonicalWinsV2: 0,
  v2CanonicalTies: 0,
  v3WinsCanonical: 0,
  canonicalWinsV3: 0,
  v3CanonicalTies: 0,
  v3WinsV2: 0,
  v2WinsV3: 0,
  v3V2Ties: 0,
};

describe("Operational Digital Twin Calibration Persistence V1", () => {
  it("round-trips anonymous corridor aggregates", () => {
    const validator = new OperationalTwinOutcomeValidator();
    const payloadJson = JSON.stringify({
      startMs: START,
      created: 2,
      completed: 2,
      expiredWithoutTruth: 0,
      byHorizon: {
        5: outcomeAggregate,
        15: emptyOutcomeAggregate,
        30: emptyOutcomeAggregate,
      },
      byMode: {
        ROUTE_AWARE: outcomeAggregate,
        KINEMATIC: emptyOutcomeAggregate,
      },
      byStateSource: {
        CANONICAL: outcomeAggregate,
        TRACK_FUSION: emptyOutcomeAggregate,
      },
    });

    expect(validator.hydrateCalibrationBuckets([{ startMs: START, payloadJson }], NOW)).toBe(1);
    const exported = validator.exportCalibrationBuckets(NOW);
    expect(exported).toHaveLength(1);
    expect(exported[0]?.startMs).toBe(START);
    expect(exported[0]?.payloadJson).not.toMatch(/icao|callsign|latitude|longitude/i);
    expect(validator.report(new Date(NOW)).overall.samples).toBe(2);
    expect(OPERATIONAL_TWIN_OUTCOME_VERSION).toBe("operational-digital-twin-outcome-validation-v1");
  });

  it("round-trips event and wind-graduation aggregates without raw prediction identity", () => {
    const validator = new OperationalTwinEventOutcomeValidator();
    const payloadJson = JSON.stringify({
      startMs: START,
      overall: eventAggregate,
      byType: {
        WAYPOINT: eventAggregate,
        ATC_SECTOR_ENTRY: emptyEventAggregate,
        SIGMET_INTERSECTION: emptyEventAggregate,
        ARRIVAL_ETA: emptyEventAggregate,
        RUNWAY_EXPECTATION: emptyEventAggregate,
      },
      byLead: {
        "0_5": eventAggregate,
        "5_15": emptyEventAggregate,
        "15_30": emptyEventAggregate,
      },
      windTimingComparison: {
        eligiblePredictions: 1,
        pairedSamples: 1,
        unpairedResolutions: 0,
        meaningfulAdjustments: 1,
        canonicalAbsoluteTimingErrorSecondsSum: 60,
        shadowAbsoluteTimingErrorSecondsSum: 30,
        shadowWins: 1,
        canonicalWins: 0,
        ties: 0,
        absoluteAdjustmentSecondsSum: 45,
      },
    });

    expect(validator.hydrateCalibrationBuckets([{ startMs: START, payloadJson }], NOW)).toBe(1);
    const exported = validator.exportCalibrationBuckets(NOW);
    expect(exported).toHaveLength(1);
    expect(exported[0]?.payloadJson).not.toMatch(/icao|callsign|latitude|longitude|semanticKey/i);
    const report = validator.report(new Date(NOW));
    expect(report.overall.predictions).toBe(2);
    expect(report.windTimingGraduation.pairedSamples).toBe(1);
    expect(OPERATIONAL_TWIN_EVENT_OUTCOME_VERSION).toBe("operational-digital-twin-event-outcome-v2");
  });

  it("round-trips trajectory-quality aggregates without aircraft identity", () => {
    const validator = new OperationalTwinTrajectoryQualityOutcomeValidator();
    const payloadJson = JSON.stringify({
      startMs: START,
      captured: 2,
      expiredWithoutTruth: 0,
      byHorizon: {
        5: trajectoryAggregate,
        15: emptyTrajectoryAggregate,
        30: emptyTrajectoryAggregate,
      },
      byPhase: {
        CLIMB: emptyTrajectoryAggregate,
        CRUISE: emptyTrajectoryAggregate,
        DESCENT: trajectoryAggregate,
        LEVEL: emptyTrajectoryAggregate,
        UNKNOWN: emptyTrajectoryAggregate,
      },
    });

    expect(validator.hydrateCalibrationBuckets([{ startMs: START, payloadJson }], NOW)).toBe(1);
    const exported = validator.exportCalibrationBuckets(NOW);
    expect(exported).toHaveLength(1);
    expect(exported[0]?.payloadJson).not.toMatch(/icao|callsign|registration|route|latitude|longitude/i);

    const report = validator.report(new Date(NOW));
    expect(report.overall.pairedSamples).toBe(2);
    expect(report.overall.canonicalMeanAbsoluteErrorFt).toBe(900);
    expect(report.overall.qualityMeanAbsoluteErrorFt).toBe(500);
    expect(report.phases.DESCENT.pairedSamples).toBe(2);
    expect(report.window.restartStableAggregates).toBe(true);
    expect(OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_VERSION)
      .toBe("operational-digital-twin-trajectory-quality-outcome-v1");
  });

  it("round-trips triple-paired trajectory-quality V2 aggregates independently from V1", () => {
    const validator = new OperationalTwinTrajectoryQualityOutcomeV2Validator();
    const payloadJson = JSON.stringify({
      startMs: START,
      captured: 2,
      expiredWithoutTruth: 0,
      byHorizon: {
        5: trajectoryV2Aggregate,
        15: emptyTrajectoryV2Aggregate,
        30: emptyTrajectoryV2Aggregate,
      },
      byPhase: {
        CLIMB: emptyTrajectoryV2Aggregate,
        CRUISE: emptyTrajectoryV2Aggregate,
        DESCENT: trajectoryV2Aggregate,
        LEVEL: emptyTrajectoryV2Aggregate,
        UNKNOWN: emptyTrajectoryV2Aggregate,
      },
      byPerformanceClass: {
        JET: trajectoryV2Aggregate,
        TURBOPROP: emptyTrajectoryV2Aggregate,
        PISTON: emptyTrajectoryV2Aggregate,
        ROTORCRAFT: emptyTrajectoryV2Aggregate,
        UNKNOWN: emptyTrajectoryV2Aggregate,
      },
      byV3Profile: {
        SELECTED_ALTITUDE_CAPTURE: trajectoryV2Aggregate,
        PERFORMANCE_TAPERED: emptyTrajectoryV2Aggregate,
        ALTITUDE_HOLD: emptyTrajectoryV2Aggregate,
        V2_FALLBACK: emptyTrajectoryV2Aggregate,
        UNAVAILABLE: emptyTrajectoryV2Aggregate,
      },
    });

    expect(validator.hydrateCalibrationBuckets([{ startMs: START, payloadJson }], NOW)).toBe(1);
    const exported = validator.exportCalibrationBuckets(NOW);
    expect(exported).toHaveLength(1);
    expect(exported[0]?.payloadJson).not.toMatch(/icao|callsign|registration|latitude|longitude/i);

    const report = validator.report(new Date(NOW));
    expect(report.overall.pairedSamples).toBe(2);
    expect(report.overall.canonicalMeanAbsoluteErrorFt).toBe(900);
    expect(report.overall.v2MeanAbsoluteErrorFt).toBe(500);
    expect(report.overall.v3MeanAbsoluteErrorFt).toBe(300);
    expect(report.overall.v3WinRateVsV2).toBe(1);
    expect(report.performanceClasses.JET.pairedSamples).toBe(2);
    expect(report.v3Profiles.SELECTED_ALTITUDE_CAPTURE.pairedSamples).toBe(2);
    expect(OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_V2_VERSION)
      .toBe("operational-digital-twin-trajectory-quality-outcome-v2");
  });

  it("rejects malformed persisted buckets instead of poisoning calibration", () => {
    const outcome = new OperationalTwinOutcomeValidator();
    const eventOutcome = new OperationalTwinEventOutcomeValidator();
    const trajectoryQuality = new OperationalTwinTrajectoryQualityOutcomeValidator();
    const trajectoryQualityV2 = new OperationalTwinTrajectoryQualityOutcomeV2Validator();
    expect(outcome.hydrateCalibrationBuckets([{ startMs: START, payloadJson: "{bad" }], NOW)).toBe(0);
    expect(eventOutcome.hydrateCalibrationBuckets([{ startMs: START, payloadJson: "{}" }], NOW)).toBe(0);
    expect(trajectoryQuality.hydrateCalibrationBuckets([{ startMs: START, payloadJson: "{}" }], NOW)).toBe(0);
    expect(trajectoryQualityV2.hydrateCalibrationBuckets([{ startMs: START, payloadJson: "{}" }], NOW)).toBe(0);
    expect(outcome.exportCalibrationBuckets(NOW)).toEqual([]);
    expect(eventOutcome.exportCalibrationBuckets(NOW)).toEqual([]);
    expect(trajectoryQuality.exportCalibrationBuckets(NOW)).toEqual([]);
    expect(trajectoryQualityV2.exportCalibrationBuckets(NOW)).toEqual([]);
  });
});
