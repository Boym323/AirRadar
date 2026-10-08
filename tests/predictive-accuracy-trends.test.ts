import { describe, expect, it } from "vitest";
import { buildPredictiveAccuracyTrends, type PredictiveTrendSample } from "@/lib/predictive-intelligence/accuracy-trends";
import { buildPredictiveReadinessEvidence, type PredictiveReadinessLandingEventRow, type PredictiveReadinessObservationRow } from "@/lib/server/predictive-readiness";

const now = new Date("2026-10-08T12:00:00.000Z");
const options = { now, sourceAvailable: true, complete: true };
const recentAt = Date.parse("2026-10-07T12:00:00.000Z");
const previousAt = Date.parse("2026-09-29T12:00:00.000Z");

function sample(capability: "ETA" | "RUNWAY", lifecycleKey: string, predictedAtMs: number, score: number | boolean | null): PredictiveTrendSample {
  return {
    capability, lifecycleKey, predictedAtMs, observationKey: `${lifecycleKey}:${predictedAtMs}`,
    scored: score !== null,
    etaAbsoluteErrorSeconds: capability === "ETA" && typeof score === "number" ? score : null,
    runwayExactEnd: capability === "RUNWAY" && typeof score === "boolean" ? score : null,
  };
}

describe("Prediction Accuracy Trends V1", () => {
  it("compares two independent seven-day cohorts with flight-level weight", () => {
    const samples: PredictiveTrendSample[] = [];
    for (let i = 0; i < 20; i++) {
      samples.push(sample("ETA", `new-${i}`, recentAt, 120));
      samples.push(sample("ETA", `old-${i}`, previousAt, 60));
      samples.push(sample("RUNWAY", `new-${i}`, recentAt, i < 15));
      samples.push(sample("RUNWAY", `old-${i}`, previousAt, i < 10));
    }
    const trends = buildPredictiveAccuracyTrends(samples, options);
    expect(trends.version).toBe("predictive-accuracy-trends-v1");
    expect(trends.capabilities.ETA.state).toBe("COMPARABLE");
    expect(trends.capabilities.ETA.recent).toMatchObject({
      observedFlights: 20, scoreableFlights: 20, unscorableFlights: 0,
      etaMaeSeconds: 120, etaMedianAbsoluteErrorSeconds: 120, etaP90AbsoluteErrorSeconds: 120,
      runwayExactEndAccuracy: null,
    });
    expect(trends.capabilities.ETA.previous.etaMaeSeconds).toBe(60);
    expect(trends.capabilities.ETA.deltaEtaMaeSeconds).toBe(60); // positive means a worsening error
    expect(trends.capabilities.RUNWAY.recent.runwayExactEndAccuracy).toBe(0.75);
    expect(trends.capabilities.RUNWAY.previous.runwayExactEndAccuracy).toBe(0.5);
    expect(trends.capabilities.RUNWAY.deltaRunwayAccuracyPercentagePoints).toBe(25);
    expect(trends.capabilities.RUNWAY.deltaEtaMaeSeconds).toBeNull();
  });

  it("uses the earliest prediction per flight across both windows and deterministic ties", () => {
    const samples = [
      sample("ETA", "crossing-flight", previousAt, 300),
      sample("ETA", "crossing-flight", recentAt, 5),
      sample("ETA", "recent-duplicate", recentAt, 120),
      sample("ETA", "recent-duplicate", recentAt + 60_000, 2),
      sample("RUNWAY", "recent-duplicate", recentAt, true), // independent capability
      sample("ETA", "unknown-truth", recentAt, null),
    ];
    const result = buildPredictiveAccuracyTrends(samples, options);
    expect(result.capabilities.ETA.previous).toMatchObject({ observedFlights: 1, scoreableFlights: 1, etaMaeSeconds: 300 });
    expect(result.capabilities.ETA.recent).toMatchObject({
      observedFlights: 2, scoreableFlights: 1, unscorableFlights: 1, etaMaeSeconds: 120,
    });
    expect(result.capabilities.ETA.state).toBe("INSUFFICIENT_TRUTH");
    expect(result.capabilities.ETA.deltaEtaMaeSeconds).toBeNull();
    expect(result.capabilities.RUNWAY.recent.scoreableFlights).toBe(1);
  });

  it("uses half-open UTC timestamps and excludes invalid, future and outside-window samples", () => {
    const boundary = Date.parse("2026-10-01T12:00:00.000Z");
    const report = buildPredictiveAccuracyTrends([
      sample("ETA", "just-before", boundary - 1, 30),
      sample("ETA", "on-boundary", boundary, 40),
      sample("ETA", "end", now.getTime(), 50),
      sample("ETA", "too-old", Date.parse("2026-09-20T12:00:00Z"), 60),
      { ...sample("ETA", "not-finite", recentAt, 60), predictedAtMs: Number.NaN },
      { ...sample("ETA", "invalid", recentAt, 60), lifecycleKey: "  " },
    ], options);
    expect(report.capabilities.ETA.previous.scoreableFlights).toBe(1);
    expect(report.capabilities.ETA.recent.scoreableFlights).toBe(1);
    expect(report.capabilities.ETA.recent.etaMaeSeconds).toBe(40);
  });

  it("does not publish deltas from missing ground truth, unavailable data or truncated results", () => {
    const samples = [
      sample("ETA", "new", recentAt, null),
      sample("ETA", "old", previousAt, 120),
      sample("RUNWAY", "new", recentAt, null),
      sample("RUNWAY", "old", previousAt, false),
    ];
    const insufficient = buildPredictiveAccuracyTrends(samples, options);
    expect(insufficient.capabilities.ETA.recent.unscorableFlights).toBe(1);
    expect(insufficient.capabilities.ETA.recent.etaMaeSeconds).toBeNull();
    expect(insufficient.capabilities.ETA.state).toBe("INSUFFICIENT_TRUTH");
    expect(insufficient.capabilities.ETA.deltaEtaMaeSeconds).toBeNull();
    expect(buildPredictiveAccuracyTrends(samples, { ...options, complete: false }).capabilities.ETA.state).toBe("COLLECTION_INCOMPLETE");
    expect(buildPredictiveAccuracyTrends(samples, { ...options, sourceAvailable: false }).capabilities.RUNWAY.state).toBe("SOURCE_UNAVAILABLE");
  });

  it("only scores independently confirmed terminal truth from canonical readiness", () => {
    const predictedAt = "2026-10-07T10:00:00.000Z";
    const observation = (capability: "ETA" | "RUNWAY", icao = "ABC123"): PredictiveReadinessObservationRow => ({
      observationKey: `${capability}:${icao}:first`, lifecycleKey: "LIFE-1", capability,
      aircraftIcao: icao, flightId: 100, predictedAt, createdAt: predictedAt,
      predictedLandingAt: capability === "ETA" ? "2026-10-07T10:36:00.000Z" : null,
      destinationIcao: "LOWW", predictedRunway: capability === "RUNWAY" ? "24" : null,
      previousRunway: null, evidenceJson: "[]",
    });
    const landing = (icao: string): PredictiveReadinessLandingEventRow => ({
      eventKey: "LIFE-1:LANDING", icaoHex: icao, flightId: 100, type: "LANDING",
      occurredAt: "2026-10-07T10:30:00.000Z", airportIcao: "LOWW",
      runway: "24", confidence: 0.95,
      metadataJson: JSON.stringify({
        lifecycleKey: "LIFE-1",
        terminalEvidence: {
          groundConfirmation: { observedAt: "2026-10-07T10:30:00.000Z" },
          reportedArrivalRunway: { runway: "24" },
        },
      }),
    });
    const truth = buildPredictiveReadinessEvidence([observation("ETA"), observation("RUNWAY")], [landing("ABC123")]);
    const result = buildPredictiveAccuracyTrends(truth.trendSamples, options);
    expect(result.capabilities.ETA.recent).toMatchObject({ scoreableFlights: 1, etaMaeSeconds: 360 });
    expect(result.capabilities.RUNWAY.recent).toMatchObject({ scoreableFlights: 1, runwayExactEndAccuracy: 1 });
    const wrongIdentity = buildPredictiveReadinessEvidence([observation("ETA")], [landing("DEF456")]);
    expect(buildPredictiveAccuracyTrends(wrongIdentity.trendSamples, options).capabilities.ETA.recent)
      .toMatchObject({ observedFlights: 1, scoreableFlights: 0, unscorableFlights: 1, etaMaeSeconds: null });
  });
});
