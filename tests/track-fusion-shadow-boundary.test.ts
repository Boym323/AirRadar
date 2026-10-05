import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stateSource = readFileSync(new URL("../lib/server/aircraft-state.ts", import.meta.url), "utf8");
const fusionSource = readFileSync(new URL("../lib/track-fusion/shadow.ts", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../app/api/admin/track-fusion/[hex]/route.ts", import.meta.url), "utf8");
const historySource = readFileSync(new URL("../lib/server/history.ts", import.meta.url), "utf8");

describe("Track Fusion Shadow V1 boundary", () => {
  it("runs beside canonical merge without replacing the public aircraft maps", () => {
    expect(stateSource).toContain("private readonly trackFusionShadow");
    expect(stateSource).toContain("this.trackFusionShadow.observe({");
    expect(stateSource).toContain("mergeAircraftMaps(this.localAircraft, this.networkAircraft");
    expect(stateSource).not.toContain("this.localAircraft = this.trackFusionShadow");
    expect(stateSource).not.toContain("this.networkAircraft = this.trackFusionShadow");
  });

  it("never enters history persistence or FlightPosition writes", () => {
    expect(fusionSource).not.toContain("getPrisma");
    expect(fusionSource).not.toContain("FlightPosition");
    expect(fusionSource).not.toContain("recordAircraftSnapshot");
    expect(historySource).not.toContain("trackFusion");
  });

  it("does not add a polling loop, network request or SSE path", () => {
    expect(fusionSource).not.toContain("fetch(");
    expect(fusionSource).not.toContain("setInterval");
    expect(fusionSource).not.toContain("setTimeout");
    expect(fusionSource).not.toContain("EventSource");
  });

  it("keeps inspection admin-only and no-store", () => {
    expect(routeSource).toContain("isWatchlistSessionValid(request)");
    expect(routeSource).toContain('"Cache-Control": "no-store"');
    expect(routeSource).toContain('status: "shadow"');
  });

  it("keeps the shadow feature explicitly configurable", () => {
    expect(stateSource).toContain("isTrackFusionShadowEnabled()");
    expect(stateSource).toContain("new TrackFusionShadow");
  });
});
