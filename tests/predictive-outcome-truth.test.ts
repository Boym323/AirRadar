import { describe, expect, it } from "vitest";
import {
  scoreRunwayChangeOutcome,
  scoreTrajectoryOutcome,
  type PredictiveOutcomeEvent,
  type PredictiveOutcomeObservation,
} from "@/lib/predictive-intelligence/outcome-truth";

const NOW = Date.parse("2026-10-04T10:00:00.000Z");

function observation(overrides: Partial<PredictiveOutcomeObservation> = {}): PredictiveOutcomeObservation {
  return {
    lifecycleKey: "LIFE-1",
    aircraftIcao: "ABC123",
    flightId: 10,
    predictedAt: NOW,
    destinationIcao: "LOWW",
    predictedRunway: "24",
    previousRunway: "06",
    trajectoryState: "DEVIATING",
    ...overrides,
  };
}

function event(overrides: Partial<PredictiveOutcomeEvent> = {}): PredictiveOutcomeEvent {
  return {
    lifecycleKey: "LIFE-1",
    aircraftIcao: "ABC123",
    flightId: 10,
    type: "APPROACH",
    occurredAt: NOW - 5 * 60_000,
    confidence: 0.9,
    airportIcao: "LOWW",
    runway: "06",
    groundConfirmedAt: null,
    reportedRunway: null,
    ...overrides,
  };
}

describe("Predictive Outcome Truth V1", () => {
  it("confirms a predicted runway change only from independent approach-to-reported-landing evidence", () => {
    const result = scoreRunwayChangeOutcome(observation(), [
      event(),
      event({
        type: "LANDING",
        occurredAt: NOW + 20 * 60_000,
        runway: "24",
        reportedRunway: "24",
        groundConfirmedAt: NOW + 20 * 60_000,
      }),
    ]);

    expect(result).toEqual({
      status: "SCORED",
      correct: true,
      falsePositive: false,
      lifecycleKey: "LIFE-1",
      approachRunway: "06",
      finalRunway: "24",
    });
  });

  it("classifies a predicted runway change as false-positive when the independently observed runway never changed", () => {
    expect(scoreRunwayChangeOutcome(observation(), [
      event(),
      event({
        type: "LANDING",
        occurredAt: NOW + 20 * 60_000,
        runway: "06",
        reportedRunway: "06",
        groundConfirmedAt: NOW + 20 * 60_000,
      }),
    ])).toMatchObject({
      status: "SCORED",
      correct: false,
      falsePositive: true,
      approachRunway: "06",
      finalRunway: "06",
    });
  });

  it("refuses runway-change truth when the approach provenance does not match the predicted previous runway", () => {
    expect(scoreRunwayChangeOutcome(observation(), [
      event({ runway: "12" }),
      event({
        type: "LANDING",
        occurredAt: NOW + 20 * 60_000,
        reportedRunway: "24",
        groundConfirmedAt: NOW + 20 * 60_000,
      }),
    ]).status).toBe("UNSCORABLE");
  });

  it("validates a trajectory candidate from an independent subsequent flight-intelligence outcome", () => {
    expect(scoreTrajectoryOutcome(observation(), [
      event({
        type: "DIVERSION",
        occurredAt: NOW + 8 * 60_000,
        confidence: 0.85,
        runway: null,
      }),
    ])).toEqual({
      status: "SCORED",
      correct: true,
      lifecycleKey: "LIFE-1",
      outcomeType: "DIVERSION",
    });
  });

  it("uses a ground-confirmed landing at the same planned destination as strict negative trajectory truth", () => {
    expect(scoreTrajectoryOutcome(observation(), [
      event({
        type: "LANDING",
        occurredAt: NOW + 25 * 60_000,
        confidence: 0.95,
        airportIcao: "LOWW",
        runway: "24",
        groundConfirmedAt: NOW + 25 * 60_000,
        reportedRunway: "24",
      }),
    ])).toEqual({
      status: "SCORED",
      correct: false,
      lifecycleKey: "LIFE-1",
      outcomeType: "CLEAN_LANDING",
    });
  });

  it("does not create false negative truth when the landing destination differs or ground confirmation is absent", () => {
    expect(scoreTrajectoryOutcome(observation(), [
      event({
        type: "LANDING",
        occurredAt: NOW + 25 * 60_000,
        airportIcao: "LKPR",
        groundConfirmedAt: NOW + 25 * 60_000,
      }),
    ]).status).toBe("UNSCORABLE");

    expect(scoreTrajectoryOutcome(observation(), [
      event({
        type: "LANDING",
        occurredAt: NOW + 25 * 60_000,
        airportIcao: "LOWW",
        groundConfirmedAt: null,
      }),
    ]).status).toBe("UNSCORABLE");
  });

  it("rejects low-confidence, wrong-lifecycle and pre-prediction positive outcomes", () => {
    for (const candidate of [
      event({ type: "ORBIT", occurredAt: NOW + 60_000, confidence: 0.59 }),
      event({ type: "HOLDING", occurredAt: NOW + 60_000, lifecycleKey: "OTHER" }),
      event({ type: "UNUSUAL_TURN", occurredAt: NOW - 1 }),
    ]) {
      expect(scoreTrajectoryOutcome(observation(), [candidate]).status).toBe("UNSCORABLE");
    }
  });
});
