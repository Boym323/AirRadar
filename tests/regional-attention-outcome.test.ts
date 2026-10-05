import { describe, expect, it } from "vitest";
import type { Aircraft } from "@/lib/aircraft/types";
import type { OperationalAttentionSummary } from "@/lib/operational-twin/operational-attention";
import {
  REGIONAL_ATTENTION_OUTCOME_VERSION,
  RegionalAttentionOutcomeValidator,
} from "@/lib/operational-twin/regional-attention-outcome";

const START = Date.parse("2026-10-05T15:00:00.000Z");

function attention(offsetMinutes: number | null = 5): OperationalAttentionSummary {
  return {
    version: "operational-attention-v1",
    generatedAt: new Date(START).toISOString(),
    total: 1,
    watch: 1,
    attention: 0,
    truncated: false,
    items: [{
      id: "copresence:A:B",
      type: "REGIONAL_COPRESENCE",
      level: "WATCH",
      aircraft: ["A", "B"],
      destination: null,
      projectedOffsetMinutes: offsetMinutes,
      projectedDistanceNm: 4,
      evidence: ["test"],
    }],
    limitations: [
      "OPERATIONAL_CONTEXT_ONLY",
      "NOT_COLLISION_WARNING",
      "NOT_SEPARATION_PRODUCT",
      "BOUNDED_GRAPH_INPUT",
    ],
  };
}

function aircraft(hex: string, lat: number, lon: number, altitude: number, at: number): Aircraft {
  return {
    icaoHex: hex,
    lat,
    lon,
    baroAltitude: altitude,
    altitude,
    geomAltitude: altitude,
    lastSeen: new Date(at).toISOString(),
    seenSeconds: 0,
    seenPosSeconds: 0,
  } as unknown as Aircraft;
}

describe("Regional Attention Outcome Validation V1", () => {
  it("scores a predicted co-presence against later LOCAL pair truth", () => {
    const validator = new RegionalAttentionOutcomeValidator();
    validator.capture(attention(), START);

    const observedAt = START + 4 * 60_000;
    validator.observeTruth(new Map([
      ["A", aircraft("A", 49, 17, 30_000, observedAt)],
      ["B", aircraft("B", 49.05, 17, 32_000, observedAt)],
    ]), observedAt);

    const report = validator.report(new Date(observedAt + 1_000));
    expect(report.overall).toMatchObject({
      predictions: 1,
      scoreable: 1,
      observed: 1,
      falsePositive: 0,
      precision: 1,
      timingSamples: 1,
    });
    expect(report.overall.meanAbsoluteTimingErrorSeconds).toBe(60);
    expect(report.truthSource).toBe("LOCAL_RECEIVER_PAIR_STATE");
  });

  it("counts a scoreable miss as false positive after the truth window expires", () => {
    const validator = new RegionalAttentionOutcomeValidator();
    validator.capture(attention(), START);

    const observedAt = START + 4 * 60_000;
    validator.observeTruth(new Map([
      ["A", aircraft("A", 49, 17, 30_000, observedAt)],
      ["B", aircraft("B", 50, 18, 32_000, observedAt)],
    ]), observedAt);

    const expiredAt = START + 9 * 60_000;
    validator.observeTruth(new Map(), expiredAt);
    expect(validator.report(new Date(expiredAt)).overall).toMatchObject({
      scoreable: 1,
      observed: 0,
      falsePositive: 1,
      precision: 0,
    });
  });

  it("keeps missing LOCAL truth separate from false positives", () => {
    const validator = new RegionalAttentionOutcomeValidator();
    validator.capture(attention(), START);
    const expiredAt = START + 9 * 60_000;
    validator.observeTruth(new Map(), expiredAt);
    expect(validator.report(new Date(expiredAt)).overall).toMatchObject({
      scoreable: 0,
      falsePositive: 0,
      expiredNoTruth: 1,
      truthCoverage: 0,
    });
  });

  it("keeps destination clusters explicitly unscored", () => {
    const validator = new RegionalAttentionOutcomeValidator();
    const summary = attention();
    summary.items = [{
      id: "destination:LOWW",
      type: "DESTINATION_CLUSTER",
      level: "WATCH",
      aircraft: ["A", "B", "C"],
      destination: "LOWW",
      projectedOffsetMinutes: null,
      projectedDistanceNm: null,
      evidence: ["test"],
    }];
    validator.capture(summary, START);
    const report = validator.report(new Date(START + 1_000));
    expect(report.overall.predictions).toBe(0);
    expect(report.unscoredDestinationClusters).toBe(1);
    expect(report.limitations).toContain("DESTINATION_CLUSTER_UNSCORED");
  });

  it("round-trips anonymous five-minute aggregates without pair identity", () => {
    const validator = new RegionalAttentionOutcomeValidator();
    validator.capture(attention(), START);
    const observedAt = START + 4 * 60_000;
    validator.observeTruth(new Map([
      ["A", aircraft("A", 49, 17, 30_000, observedAt)],
      ["B", aircraft("B", 49.05, 17, 32_000, observedAt)],
    ]), observedAt);

    const exported = validator.exportCalibrationBuckets(observedAt);
    expect(exported).toHaveLength(1);
    expect(exported[0]?.payloadJson).not.toMatch(/icao|source|target|callsign|latitude|longitude/i);

    const hydrated = new RegionalAttentionOutcomeValidator();
    expect(hydrated.hydrateCalibrationBuckets(exported, observedAt)).toBe(1);
    expect(hydrated.report(new Date(observedAt)).overall.observed).toBe(1);
    expect(REGIONAL_ATTENTION_OUTCOME_VERSION).toBe("regional-attention-outcome-v1");
  });
});
