import { describe, expect, it } from "vitest";
import {
  buildPredictiveReadinessEvidence,
  type PredictiveReadinessLandingEventRow,
  type PredictiveReadinessObservationRow,
  type PredictiveReadinessOutcomeEventRow,
} from "@/lib/server/predictive-readiness";

function observation(
  capability: string,
  overrides: Partial<PredictiveReadinessObservationRow> = {},
): PredictiveReadinessObservationRow {
  return {
    observationKey: `${capability}:LIFE-1:1m`,
    lifecycleKey: "LIFE-1",
    capability,
    aircraftIcao: "ABC123",
    flightId: 10,
    predictedAt: "2026-10-04T10:00:00.000Z",
    predictedLandingAt: capability === "ETA" ? "2026-10-04T10:31:00.000Z" : null,
    destinationIcao: "LOWW",
    predictedRunway: capability === "RUNWAY" ? "24" : null,
    previousRunway: null,
    evidenceJson: "[]",
    createdAt: "2026-10-04T10:00:02.000Z",
    ...overrides,
  };
}

function landing(overrides: Partial<PredictiveReadinessLandingEventRow> = {}): PredictiveReadinessLandingEventRow {
  return {
    eventKey: "LANDING:LIFE-1",
    icaoHex: "ABC123",
    flightId: 10,
    occurredAt: "2026-10-04T10:30:00.000Z",
    type: "LANDING",
    airportIcao: "LOWW",
    runway: "24",
    confidence: 0.95,
    metadataJson: JSON.stringify({
      lifecycleKey: "LIFE-1",
      terminalEvidence: {
        groundConfirmation: { observedAt: "2026-10-04T10:30:00.000Z" },
        reportedArrivalRunway: { runway: "24" },
      },
    }),
    ...overrides,
  };
}

function outcome(
  type: PredictiveReadinessOutcomeEventRow["type"],
  overrides: Partial<PredictiveReadinessOutcomeEventRow> = {},
): PredictiveReadinessOutcomeEventRow {
  return {
    eventKey: `${type}:LIFE-1`,
    type,
    icaoHex: "ABC123",
    flightId: 10,
    occurredAt: type === "APPROACH" ? "2026-10-04T09:55:00.000Z" : "2026-10-04T10:10:00.000Z",
    airportIcao: "LOWW",
    runway: type === "APPROACH" ? "06" : null,
    confidence: 0.9,
    metadataJson: JSON.stringify({ lifecycleKey: "LIFE-1" }),
    ...overrides,
  };
}

describe("predictive readiness evidence collector", () => {
  it("scores ETA only from independent ground confirmation and runway only from reported runway truth", () => {
    const result = buildPredictiveReadinessEvidence(
      [observation("ETA"), observation("RUNWAY")],
      [landing()],
    );

    expect(result.evidence.ETA).toMatchObject({
      observations: 1,
      scoreableObservations: 1,
      independentTruthFlights: 1,
      medianAbsoluteErrorSeconds: 60,
      p90AbsoluteErrorSeconds: 60,
      p95AbsoluteErrorSeconds: 60,
    });
    expect(result.evidence.RUNWAY).toMatchObject({
      observations: 1,
      scoreableObservations: 1,
      independentTruthFlights: 1,
      exactEndAccuracy: 1,
      coverage: 1,
    });
    expect(result.matchedLandingTruth).toBe(2);
  });

  it("does not score truth when ICAO or prediction-to-landing chronology does not match", () => {
    const wrongIcao = landing({ icaoHex: "DEF456" });
    const lateLanding = landing({
      occurredAt: "2026-10-05T10:30:00.000Z",
      metadataJson: JSON.stringify({
        lifecycleKey: "LIFE-1",
        terminalEvidence: {
          groundConfirmation: { observedAt: "2026-10-05T10:30:00.000Z" },
          reportedArrivalRunway: { runway: "24" },
        },
      }),
    });

    expect(buildPredictiveReadinessEvidence([observation("ETA")], [wrongIcao]).evidence.ETA.scoreableObservations).toBe(0);
    expect(buildPredictiveReadinessEvidence([observation("ETA")], [lateLanding]).evidence.ETA.scoreableObservations).toBe(0);
  });

  it("surfaces stale capture and lifecycle identity conflicts", () => {
    const observations = [
      observation("ETA", { createdAt: "2026-10-04T10:01:00.000Z" }),
      observation("RUNWAY", { aircraftIcao: "DEF456" }),
    ];
    const result = buildPredictiveReadinessEvidence(observations, [landing()]);

    expect(result.captureStaleObservations).toBe(1);
    expect(result.evidence.ETA.captureStaleRate).toBe(1);
    expect(result.evidence.integrity.crossIcaoLifecycleConflicts).toBe(1);
  });

  it("keeps runway-change and trajectory blocked when their independent validation contract is unavailable", () => {
    const result = buildPredictiveReadinessEvidence(
      [observation("RUNWAY_CHANGE", { predictedRunway: "24", previousRunway: "06" }), observation("TRAJECTORY")],
      [landing()],
    );

    expect(result.evidence.RUNWAY_CHANGE.independentChangeTruthAvailable).toBe(false);
    expect(result.evidence.TRAJECTORY).toMatchObject({
      stateCaptureAvailable: false,
      independentOutcomeTruthAvailable: false,
      validatedCandidates: 0,
      precision: null,
    });
  });

  it("scores runway changes only when independent approach provenance proves the prior runway", () => {
    const result = buildPredictiveReadinessEvidence(
      [observation("RUNWAY_CHANGE", { predictedRunway: "24", previousRunway: "06" })],
      [landing()],
      [outcome("APPROACH")],
    );

    expect(result.evidence.RUNWAY_CHANGE).toMatchObject({
      observations: 1,
      scoreableObservations: 1,
      independentTruthFlights: 1,
      outcomePrecision: 1,
      falsePositiveRate: 0,
      independentChangeTruthAvailable: true,
    });

    const mismatch = buildPredictiveReadinessEvidence(
      [observation("RUNWAY_CHANGE", { predictedRunway: "24", previousRunway: "06" })],
      [landing()],
      [outcome("APPROACH", { runway: "12" })],
    );
    expect(mismatch.evidence.RUNWAY_CHANGE).toMatchObject({
      scoreableObservations: 0,
      independentChangeTruthAvailable: false,
    });
  });

  it("computes runway-change false-positive rate from an independently unchanged runway", () => {
    const result = buildPredictiveReadinessEvidence(
      [observation("RUNWAY_CHANGE", { predictedRunway: "24", previousRunway: "06" })],
      [landing({
        runway: "06",
        metadataJson: JSON.stringify({
          lifecycleKey: "LIFE-1",
          terminalEvidence: {
            groundConfirmation: { observedAt: "2026-10-04T10:30:00.000Z" },
            reportedArrivalRunway: { runway: "06" },
          },
        }),
      })],
      [outcome("APPROACH")],
    );

    expect(result.evidence.RUNWAY_CHANGE).toMatchObject({
      scoreableObservations: 1,
      outcomePrecision: 0,
      falsePositiveRate: 1,
      independentChangeTruthAvailable: true,
    });
  });

  it("validates trajectory candidates from independent abnormal outcomes and strict clean landings", () => {
    const trajectory = observation("TRAJECTORY", {
      evidenceJson: JSON.stringify([{ key: "trajectoryState", value: "DEVIATING" }]),
    });
    const positive = buildPredictiveReadinessEvidence(
      [trajectory],
      [landing()],
      [outcome("DIVERSION")],
    );
    expect(positive.evidence.TRAJECTORY).toMatchObject({
      observations: 1,
      candidateObservations: 1,
      validatedCandidates: 1,
      precision: 1,
      stateCaptureAvailable: true,
      independentOutcomeTruthAvailable: true,
    });

    const negative = buildPredictiveReadinessEvidence([trajectory], [landing()], []);
    expect(negative.evidence.TRAJECTORY).toMatchObject({
      validatedCandidates: 1,
      precision: 0,
      independentOutcomeTruthAvailable: true,
    });
  });

  it("does not create negative trajectory truth from an unconfirmed or different-destination landing", () => {
    const trajectory = observation("TRAJECTORY", {
      evidenceJson: JSON.stringify([{ key: "trajectoryState", value: "POSSIBLE_DEVIATION" }]),
    });
    const differentDestination = landing({ airportIcao: "LKPR" });
    const noGround = landing({
      metadataJson: JSON.stringify({
        lifecycleKey: "LIFE-1",
        terminalEvidence: {
          groundConfirmation: null,
          reportedArrivalRunway: { runway: "24" },
        },
      }),
    });

    expect(buildPredictiveReadinessEvidence([trajectory], [differentDestination]).evidence.TRAJECTORY.validatedCandidates).toBe(0);
    expect(buildPredictiveReadinessEvidence([trajectory], [noGround]).evidence.TRAJECTORY.validatedCandidates).toBe(0);
  });
});
