import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  new URL("../app/admin/operational-twin/calibration/page.tsx", import.meta.url),
  "utf8",
);
const routeSource = readFileSync(
  new URL("../app/api/admin/operational-twin/calibration/route.ts", import.meta.url),
  "utf8",
);
const componentSource = readFileSync(
  new URL("../components/digital-twin-calibration-center.tsx", import.meta.url),
  "utf8",
);

describe("Digital Twin Calibration Center V1 boundary", () => {
  it("keeps the center on an explicit admin route", () => {
    expect(pageSource).toContain("DigitalTwinCalibrationCenter");
    expect(pageSource).toContain("AirRadarPageShell");
    expect(componentSource).toContain('data-testid="digital-twin-calibration-center"');
  });

  it("aggregates existing calibration reports without creating a second calibration engine", () => {
    expect(routeSource).toContain("getOperationalTwinOutcomeReport()");
    expect(routeSource).toContain("getOperationalTwinEventOutcomeReport()");
    expect(routeSource).toContain("getRegionalAttentionOutcomeReport()");
    expect(routeSource).not.toContain("new OperationalTwin");
    expect(routeSource).not.toContain("setInterval");
    expect(routeSource).not.toContain("setTimeout");
  });

  it("keeps the aggregate endpoint admin-only and no-store", () => {
    expect(routeSource).toContain("isWatchlistSessionValid(request)");
    expect(routeSource).toContain('"Cache-Control": "no-store"');
  });

  it("surfaces every calibration lane and persistence health", () => {
    expect(componentSource).toContain('data-testid="calibration-corridor-outcome"');
    expect(componentSource).toContain('data-testid="calibration-event-outcome"');
    expect(componentSource).toContain('data-testid="calibration-truth-first"');
    expect(componentSource).toContain('data-testid="calibration-wind-timing"');
    expect(componentSource).toContain('data-testid="calibration-regional-attention"');
    expect(componentSource).toContain('data-testid="calibration-persistence"');
    expect(componentSource).toContain("hydratedRegionalAttentionOutcomeBuckets");
  });

  it("uses one bounded no-store request and no client polling loop", () => {
    expect(componentSource).toContain('fetch("/api/admin/operational-twin/calibration"');
    expect(componentSource).not.toContain("setInterval");
    expect(componentSource).not.toContain("EventSource");
  });
});
