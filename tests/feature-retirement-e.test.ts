import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const state = readFileSync(new URL("../lib/server/aircraft-state.ts", import.meta.url), "utf8");
const twin = readFileSync(new URL("../lib/server/operational-twin.ts", import.meta.url), "utf8");
const config = readFileSync(new URL("../lib/server/config.ts", import.meta.url), "utf8");
const system = readFileSync(new URL("../components/system-status-page.tsx", import.meta.url), "utf8");

describe("Track Fusion Shadow retirement", () => {
  it("removes experimental consumers, endpoints and runtime work", () => {
    expect(existsSync(new URL("../lib/track-fusion/shadow.ts", import.meta.url))).toBe(false);
    expect(existsSync(new URL("../app/api/admin/track-fusion/readiness/route.ts", import.meta.url))).toBe(false);
    expect(existsSync(new URL("../app/api/admin/track-fusion/outcome/route.ts", import.meta.url))).toBe(false);
    expect(state).not.toContain("observeTrackFusionShadow");
    expect(state).not.toContain("getTrackFusionReadinessReport");
    expect(state).not.toContain("snapshot.trackFusion");
    expect(config).not.toContain("AIRRADAR_TRACK_FUSION_DIGITAL_TWIN_ENABLED");
    expect(system).not.toContain("trackFusionOutcome");
  });

  it("uses canonical LOCAL aircraft for Digital Twin regardless of legacy feature flags", () => {
    expect(twin).toContain('service.getAircraft(icaoHex, "local")');
    expect(twin).toContain('stateSource: "CANONICAL"');
    expect(twin).not.toContain("fusionEligible");
    expect(twin).not.toContain("getTrackFusionShadowTrack");
    expect(twin).toContain("getOperationalTwinForAircraft");
    expect(state).toContain("mergeAircraftMaps(this.localAircraft, this.networkAircraft");
    expect(state).toContain("this.continuity.observeMembership");
  });
});
