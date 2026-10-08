import { describe, expect, it } from "vitest";
import { buildPredictiveHorizonQuality, type PredictiveHorizonObservation } from "@/lib/predictive-intelligence/horizon-quality";
import { buildPredictiveReadinessEvidence, type PredictiveReadinessObservationRow, type PredictiveReadinessLandingEventRow } from "@/lib/server/predictive-readiness";

const TOUCHDOWN = Date.parse("2026-10-08T13:00:00Z");
const row = (key: string, minutes: number, errorSeconds: number, actualLandingAtMs: number | null = TOUCHDOWN): PredictiveHorizonObservation => ({
  observationKey: key,
  lifecycleKey: key.split("-")[0]!,
  predictedAtMs: TOUCHDOWN - minutes * 60_000,
  actualLandingAtMs,
  signedErrorSeconds: actualLandingAtMs === null ? null : errorSeconds,
});
const valid = { sourceAvailable: true, complete: true };

describe("Predictive Horizon Quality V1", () => {
  it("groups ETA by independent actual minutes remaining and one earliest sample per flight and band", () => {
    const samples = [];
    for (let i = 0; i < 10; i++) {
      samples.push(row(`flight${i}-early`, 34, 120));
      samples.push(row(`flight${i}-late`, 21, 2)); // same flight in the 15-30m band; 34m is a different band
      samples.push(row(`flight${i}-first`, 27, -60));
      samples.push(row(`flight${i}-fivemin`, 4, 30));
    }
    const report = buildPredictiveHorizonQuality(samples, valid);
    const band = report.bands.find((item) => item.bucket === "15-30m")!;
    expect(band.state).toBe("MEASURED");
    expect(band.flights).toBe(10);
    expect(band.maeSeconds).toBe(60); // earliest 27m sample, not the optimistic 21m sample
    expect(band.medianAbsoluteErrorSeconds).toBe(60);
    expect(band.biasSeconds).toBe(-60);
    expect(report.bands.find((item) => item.bucket === "30-60m")).toMatchObject({ state: "MEASURED", maeSeconds: 120, flights: 10 });
    expect(report.bands.find((item) => item.bucket === "0-5m")).toMatchObject({ state: "MEASURED", flights: 10 });
  });

  it("keeps 5, 15, 30 and 60 minute boundaries deterministic", () => {
    const report = buildPredictiveHorizonQuality([
      row("a-1", 4, 1), row("b-1", 5, 1), row("c-1", 15, 1),
      row("d-1", 30, 1), row("e-1", 60, 1),
      row("f-1", 0, 1), row("g-1", -1, 1), row("h-1", 361, 1),
    ], valid);
    expect(report.bands.map((b) => [b.bucket, b.flights])).toEqual([
      ["0-5m", 1], ["5-15m", 1], ["15-30m", 1],
      ["30-60m", 1], ["60m+", 1],
    ]);
    expect(report.unclassifiedFlights).toBe(3);
    expect(report.bands.every((b) => b.maeSeconds === null)).toBe(true);
  });

  it("never turns unknown truth or short samples into a confident quality metric", () => {
    const report = buildPredictiveHorizonQuality([
      row("missing-1", 20, 80, null), row("short-1", 20, 180),
    ], valid);
    expect(report.unclassifiedFlights).toBe(1);
    expect(report.bands[2]).toMatchObject({ state: "INSUFFICIENT_TRUTH", flights: 1, maeSeconds: null });
    expect(buildPredictiveHorizonQuality([], { sourceAvailable: false, complete: false }).bands[0]?.state).toBe("SOURCE_UNAVAILABLE");
    expect(buildPredictiveHorizonQuality([row("valid-1", 20, 20)], { sourceAvailable: true, complete: false }).bands[2]?.state).toBe("COLLECTION_INCOMPLETE");
  });

  it("uses actual terminal ground confirmation rather than estimated ETA to pick a horizon band", () => {
    const predictionAt = "2026-10-08T12:30:00Z";
    const observation: PredictiveReadinessObservationRow = {
      observationKey: "flight:eta:15m", lifecycleKey: "flight", capability: "ETA", aircraftIcao: "A0B0C0", flightId: 3,
      predictedAt: predictionAt, predictedLandingAt: "2026-10-08T12:35:00Z",
      destinationIcao: "LKPR", predictedRunway: null, previousRunway: null, evidenceJson: "[]", createdAt: predictionAt,
    };
    const landing: PredictiveReadinessLandingEventRow = {
      eventKey: "landing", icaoHex: "A0B0C0", flightId: 3,
      occurredAt: "2026-10-08T13:00:00Z", metadataJson: JSON.stringify({
        lifecycleKey: "flight", terminalEvidence: { groundConfirmation: { observedAt: "2026-10-08T13:00:00Z" } },
      }),
    };
    const evidence = buildPredictiveReadinessEvidence([observation], [landing]);
    expect(evidence.horizonObservations).toHaveLength(1);
    expect(evidence.horizonObservations[0]?.signedErrorSeconds).toBe(-1500);
    expect(buildPredictiveHorizonQuality(evidence.horizonObservations, valid).bands.find(x => x.bucket === "30-60m")?.flights).toBe(1);
    const wrongIcao = buildPredictiveReadinessEvidence([observation], [{ ...landing, icaoHex: "DEF123" }]);
    expect(buildPredictiveHorizonQuality(wrongIcao.horizonObservations, valid).bands.every(x => x.flights === 0)).toBe(true);
  });
});
