import { describe, expect, it } from "vitest";
import { buildPredictiveTruthIntegrity } from "@/lib/predictive-intelligence/truth-integrity-e1";
import type { PredictiveTrendSample } from "@/lib/predictive-intelligence/accuracy-trends";
const now = new Date("2026-10-09T00:00:00Z");
const row = (patch: Partial<PredictiveTrendSample> = {}): PredictiveTrendSample => ({
  capability: "ETA", lifecycleKey: "flight-1", observationKey: "first",
  predictedAtMs: Date.parse("2026-10-08T12:00:00Z"),
  scored: true, etaAbsoluteErrorSeconds: 80, ...patch,
});
describe("E1 Ground Truth integrity", () => {
  it("deduplicates captures per capability and lifecycle without double counting", () => {
    const r = buildPredictiveTruthIntegrity([
      row(), row({ observationKey: "later", predictedAtMs: Date.parse("2026-10-08T13:00:00Z") }),
      row({ lifecycleKey: "flight-2", scored: false }),
    ], { now, sourceAvailable: true, complete: true });
    expect(r).toMatchObject({ distinctFlights: 2, scoreable: 1, unscorable: 1, state: "PARTIAL", eligibleForGraduation: false });
    expect(r.reasons.DUPLICATE_CAPTURE).toBe(1);
    expect(r.reasons.UNCONFIRMED_TRUTH).toBe(1);
  });
  it("reports invalid, future and missing evidence separately from wrong predictions", () => {
    const r = buildPredictiveTruthIntegrity([
      row({ lifecycleKey: "" }), row({ predictedAtMs: now.getTime() + 1000 }),
      row({ etaAbsoluteErrorSeconds: Number.NaN }), row({ lifecycleKey: "runway", capability: "RUNWAY", runwayExactEnd: false }),
    ], {now, sourceAvailable: true, complete: true});
    expect(r.reasons).toMatchObject({ INVALID_LIFECYCLE: 1, INVALID_TIMESTAMP: 1, INVALID_SCORE: 1 });
    expect(r.scoreable).toBe(1);
  });
  it("fails closed for missing source and truncated collections", () => {
    expect(buildPredictiveTruthIntegrity([row()], {now, sourceAvailable: false, complete: true}).state).toBe("SOURCE_UNAVAILABLE");
    expect(buildPredictiveTruthIntegrity([row()], {now, sourceAvailable: true, complete: false}).state).toBe("COLLECTION_INCOMPLETE");
  });
});