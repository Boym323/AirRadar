import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const intelligenceSource = readFileSync(new URL("../lib/operational-twin/navigation-integrity-corridor.ts", import.meta.url), "utf8");
const serverSource = readFileSync(new URL("../lib/server/operational-twin.ts", import.meta.url), "utf8");
const mapSource = readFileSync(new URL("../lib/operational-twin/map.ts", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../components/airradar-app.tsx", import.meta.url), "utf8");
const panelSource = readFileSync(new URL("../components/aircraft-operational-twin.tsx", import.meta.url), "utf8");

describe("Navigation Integrity Corridor V1 boundary", () => {
  it("is a pure sampled projection over existing corridor and Navigation Integrity snapshot data", () => {
    expect(intelligenceSource).toContain("buildNavigationIntegrityCorridorIntelligence");
    expect(intelligenceSource).toContain("altitudeBand(point.altitudeFt)");
    expect(intelligenceSource).toContain("anomaly.cellKeys.includes(key)");
    expect(intelligenceSource).not.toContain("fetch(");
    expect(intelligenceSource).not.toContain("getPrisma");
    expect(intelligenceSource).not.toContain("EventSource");
    expect(intelligenceSource).not.toContain("setInterval");
    expect(intelligenceSource).not.toContain("setTimeout");
  });

  it("reads the existing process-local Navigation Integrity service without another public API request", () => {
    expect(serverSource).toContain('getNavigationIntegrityService().getCurrent("15m", now)');
    expect(serverSource).toContain("buildNavigationIntegrityCorridorIntelligence");
    expect(serverSource).not.toContain("/api/navigation-integrity/current");
  });

  it("renders the inferred intersection through the existing Digital Twin map source", () => {
    expect(mapSource).toContain('"navigation-integrity-event"');
    expect(mapSource).toContain("OPERATIONAL_TWIN_NAVIGATION_INTEGRITY_LAYER_ID");
    expect(appSource).toContain("OPERATIONAL_TWIN_NAVIGATION_INTEGRITY_LAYER_ID");
    expect(appSource).toContain('filter: ["==", ["get", "kind"], "navigation-integrity-event"]');
    expect(panelSource).toContain('data-testid="navigation-integrity-corridor-v1"');
  });

  it("keeps semantics descriptive rather than asserting GNSS interference or safety", () => {
    expect(intelligenceSource).not.toMatch(/jamming|spoofing|safe|unsafe/i);
    expect(intelligenceSource).toContain('"REGIONAL_HEURISTIC"');
    expect(intelligenceSource).toContain('"CAUSE_UNKNOWN"');
  });
});
