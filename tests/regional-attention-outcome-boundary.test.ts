import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const outcomeSource = readFileSync(
  new URL("../lib/operational-twin/regional-attention-outcome.ts", import.meta.url),
  "utf8",
);
const stateSource = readFileSync(
  new URL("../lib/server/aircraft-state.ts", import.meta.url),
  "utf8",
);
const routeSource = readFileSync(
  new URL("../app/api/operations/situation/route.ts", import.meta.url),
  "utf8",
);
const adminRouteSource = readFileSync(
  new URL("../app/api/admin/operational-twin/regional-attention-outcome/route.ts", import.meta.url),
  "utf8",
);
const persistenceSource = readFileSync(
  new URL("../lib/server/operational-twin-calibration-persistence.ts", import.meta.url),
  "utf8",
);

describe("Regional Attention Outcome Validation V1 boundary", () => {
  it("keeps validation bounded, request-driven, and free of provider/database loops", () => {
    expect(outcomeSource).toContain("REGIONAL_ATTENTION_OUTCOME_HORIZONS_MINUTES = [5, 15, 30]");
    expect(outcomeSource).toContain("MAX_PENDING = 4_000");
    expect(outcomeSource).not.toContain("getPrisma");
    expect(outcomeSource).not.toContain("fetch(");
    expect(outcomeSource).not.toContain("EventSource");
    expect(outcomeSource).not.toContain("setInterval");
    expect(outcomeSource).not.toContain("setTimeout");
  });

  it("captures only from the existing regional situation request", () => {
    expect(routeSource).toContain("const attention = buildOperationalAttention(graph)");
    expect(routeSource).toContain("service.captureRegionalAttentionOutcome(attention)");
    expect(routeSource).not.toContain("RegionalAttentionOutcomeValidator");
  });

  it("resolves truth only from canonical LOCAL aircraft state", () => {
    expect(stateSource).toContain("this.regionalAttentionOutcome.observeTruth(this.localAircraft, now)");
    expect(outcomeSource).toContain('truthSource: "LOCAL_RECEIVER_PAIR_STATE"');
    expect(outcomeSource).not.toContain("networkAircraft");
    expect(outcomeSource).not.toContain("mergeAircraft");
  });

  it("persists anonymous aggregate buckets in the existing calibration table", () => {
    expect(persistenceSource).toContain('LANE_REGIONAL_ATTENTION_OUTCOME = "REGIONAL_ATTENTION_OUTCOME"');
    expect(persistenceSource).toContain("REGIONAL_ATTENTION_OUTCOME_VERSION");
    expect(persistenceSource).toContain("regionalAttentionOutcome.exportCalibrationBuckets");
    expect(outcomeSource).toContain("exportCalibrationBuckets");
    expect(outcomeSource).toContain("hydrateCalibrationBuckets");
  });

  it("keeps inspection admin-only and no-store", () => {
    expect(adminRouteSource).toContain("isWatchlistSessionValid(request)");
    expect(adminRouteSource).toContain('"Cache-Control": "no-store"');
  });

  it("keeps destination clusters explicitly outside V1 scoring", () => {
    expect(outcomeSource).toContain('unscoredType: "DESTINATION_CLUSTER"');
    expect(outcomeSource).toContain('"DESTINATION_CLUSTER_UNSCORED"');
  });
});
