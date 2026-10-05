import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const outcomeSource = readFileSync(new URL("../lib/track-fusion/outcome.ts", import.meta.url), "utf8");
const shadowSource = readFileSync(new URL("../lib/track-fusion/shadow.ts", import.meta.url), "utf8");
const stateSource = readFileSync(new URL("../lib/server/aircraft-state.ts", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../app/api/admin/track-fusion/outcome/route.ts", import.meta.url), "utf8");
const historySource = readFileSync(new URL("../lib/server/history.ts", import.meta.url), "utf8");

describe("Track Fusion Outcome Validation V1 boundary", () => {
  it("uses bounded prospective in-memory validation only", () => {
    expect(outcomeSource).toContain("TRACK_FUSION_OUTCOME_HORIZONS_SECONDS = [5, 15, 30]");
    expect(outcomeSource).toContain("TRACK_FUSION_OUTCOME_WINDOW_MINUTES = 24 * 60");
    expect(outcomeSource).toContain("MAX_PENDING = 6_000");
    expect(outcomeSource).not.toContain("getPrisma");
    expect(outcomeSource).not.toContain("FlightPosition");
    expect(outcomeSource).not.toContain("fetch(");
    expect(outcomeSource).not.toContain("setInterval");
    expect(outcomeSource).not.toContain("setTimeout");
  });

  it("uses future LOCAL position as ground truth", () => {
    expect(outcomeSource).toContain("this.resolvePending(input.local, now)");
    expect(outcomeSource).toContain("positionObservedAt(truth)");
    expect(outcomeSource).toContain("truthAt >= sample.targetAt");
    expect(outcomeSource).toContain("truthAt <= sample.expiresAt");
  });

  it("consumes only freshly evaluated shadow tracks without a second all-aircraft fusion pass", () => {
    expect(shadowSource).toContain("const evaluatedTracks: TrackFusionTrack[] = []");
    expect(shadowSource).toContain("evaluatedTracks.push(next)");
    expect(shadowSource).toContain("return evaluatedTracks");
    expect(stateSource).toContain("const evaluatedTracks = this.trackFusionShadow.observe");
    expect(stateSource).toContain("evaluatedTracks,");
  });

  it("never feeds validation output into history or canonical state", () => {
    expect(historySource).not.toContain("trackFusionOutcome");
    expect(stateSource).not.toContain("recordAircraftSnapshot(this.trackFusionOutcome");
    expect(stateSource).not.toContain("this.aircraft.set(trackFusionOutcome");
  });

  it("keeps outcome inspection admin-only and no-store", () => {
    expect(routeSource).toContain("isWatchlistSessionValid(request)");
    expect(routeSource).toContain('"Cache-Control": "no-store"');
  });
});
