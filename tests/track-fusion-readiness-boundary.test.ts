import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readinessSource = readFileSync(new URL("../lib/track-fusion/readiness.ts", import.meta.url), "utf8");
const stateSource = readFileSync(new URL("../lib/server/aircraft-state.ts", import.meta.url), "utf8");
const configSource = readFileSync(new URL("../lib/server/config.ts", import.meta.url), "utf8");
const twinSource = readFileSync(new URL("../lib/server/operational-twin.ts", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../app/api/admin/track-fusion/readiness/route.ts", import.meta.url), "utf8");
const historySource = readFileSync(new URL("../lib/server/history.ts", import.meta.url), "utf8");

describe("Track Fusion Readiness V1 boundary", () => {
  it("uses bounded process-local aggregation without persistence or timers", () => {
    expect(readinessSource).toContain("TRACK_FUSION_READINESS_WINDOW_MINUTES = 24 * 60");
    expect(readinessSource).toContain("TRACK_FUSION_READINESS_BUCKET_MINUTES = 5");
    expect(readinessSource).toContain("MAX_BUCKETS");
    expect(readinessSource).not.toContain("getPrisma");
    expect(readinessSource).not.toContain("FlightPosition");
    expect(readinessSource).not.toContain("fetch(");
    expect(readinessSource).not.toContain("setInterval");
    expect(readinessSource).not.toContain("setTimeout");
  });

  it("collects readiness only from the existing shadow evaluation path", () => {
    expect(stateSource).toContain("this.trackFusionReadiness.observe(this.trackFusionShadow.diagnostics(), now)");
    expect(stateSource).toContain("getTrackFusionReadinessReport");
    expect(historySource).not.toContain("trackFusionReadiness");
  });

  it("keeps Digital Twin rollout fail-closed by default", () => {
    expect(configSource).toContain("AIRRADAR_TRACK_FUSION_DIGITAL_TWIN_ENABLED");
    expect(configSource).toContain('toLowerCase() === "true"');
    expect(twinSource).toContain("readiness.rollout.digitalTwinEffective");
    expect(twinSource).toContain('fused?.quality === "GOOD"');
    expect(twinSource).toContain("!fused.position.estimated");
    expect(twinSource).toContain('service.getAircraft(icaoHex, fusionEligible ? "extended" : "local")');
  });

  it("never promotes estimated or LOW-confidence fusion fields into Digital Twin", () => {
    expect(twinSource).toContain("!estimate.estimated");
    expect(twinSource).toContain('estimate.confidence !== "LOW"');
    expect(twinSource).toContain('stateSource: fusionEligible ? "TRACK_FUSION" : "CANONICAL"');
  });

  it("keeps readiness inspection admin-only and no-store", () => {
    expect(routeSource).toContain("isWatchlistSessionValid(request)");
    expect(routeSource).toContain('"Cache-Control": "no-store"');
  });
});
