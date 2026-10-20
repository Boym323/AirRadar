import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const aircraft = readFileSync(new URL("../lib/server/aircraft-state.ts", import.meta.url), "utf8");

describe("Retired predictive runtime boundary", () => {
  it("does not instantiate or export any Predictive Intelligence shadow model", () => {
    expect(aircraft).not.toContain("PredictiveStateStore");
    expect(aircraft).not.toContain("getPredictiveState");
    expect(aircraft).not.toContain("buildPredictiveShadowInput");
    expect(aircraft).not.toContain("this.predictive.flushProspective");
    expect(aircraft).not.toContain('measureRuntime("snapshot.predictive"');
    expect(aircraft).toContain("this.navigationIntegrity.observe(activeAircraft");
  });

  it("keeps retired prediction code and APIs absent, without modifying history", () => {
    for (const name of [
      "lib/predictive-intelligence",
      "lib/server/predictive-readiness.ts",
      "lib/server/aircraft-predictive-projection.ts",
      "lib/server/predictive-observation-retention.ts",
      "lib/watchlist-predictive-alerts-v2.ts",
      "app/api/admin/flights/[id]/evidence/route.ts",
      "app/api/aircraft/[hex]/prediction/route.ts",
    ]) {
      expect(existsSync(new URL("../" + name, import.meta.url)), name).toBe(false);
    }
    expect(existsSync(new URL("../lib/server/history.ts", import.meta.url))).toBe(true);
  });
});
