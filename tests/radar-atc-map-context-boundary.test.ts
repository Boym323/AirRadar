import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../components/airradar-app.tsx", import.meta.url), "utf8");
const contextSource = readFileSync(new URL("../components/radar/use-radar-atc-map-context.ts", import.meta.url), "utf8");

describe("radar ATC map context boundary", () => {
  it("owns AUP/UUP loading and historical map time outside AirRadarApp", () => {
    expect(appSource).toContain("useRadarAtcMapContext");
    expect(appSource).not.toContain('searchParams.get("at")');
    expect(appSource).not.toContain("/api/airspace/activity");
    expect(contextSource).toContain("/api/airspace/activity");
    expect(contextSource).toContain('searchParams.get("at")');
    expect(contextSource).toContain("normalizeMapTime");
  });

  it("owns ATC traffic and transition polling in the context hook", () => {
    expect(appSource).not.toContain("/api/atc/sectors/traffic");
    expect(appSource).not.toContain("/api/atc/sectors/transitions");
    expect(contextSource).toContain("/api/atc/sectors/traffic");
    expect(contextSource).toContain("/api/atc/sectors/transitions");
    expect(contextSource).toContain("12_000");
    expect(contextSource).toContain("15_000");
  });

  it("freezes polling when a historical map time is selected", () => {
    expect(contextSource).toContain("if (!requestedAt && active)");
    expect(contextSource).toContain("requestedAt ?");
    expect(contextSource).toContain("?at=");
    expect(contextSource).toContain("&at=");
  });
});
