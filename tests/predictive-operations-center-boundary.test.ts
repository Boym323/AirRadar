import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(new URL("../app/api/operations/predictive/route.ts", import.meta.url), "utf8");
const componentSource = readFileSync(new URL("../components/radar/radar-operations-center.tsx", import.meta.url), "utf8");

describe("Predictive Operations Center V1 boundary", () => {
  it("keeps the endpoint bounded to the published aircraft limit", () => {
    expect(routeSource).toContain("PREDICTIVE_OPERATIONS_MAX_AIRCRAFT");
    expect(routeSource).toContain("if (result.length >= PREDICTIVE_OPERATIONS_MAX_AIRCRAFT) break");
  });

  it("applies one shared readiness report before public serialization", () => {
    expect(routeSource.match(/readPredictiveReadinessReport\(\)/g)).toHaveLength(1);
    expect(routeSource).toContain("enforcePredictiveReadiness");
    expect(routeSource).toContain("buildPublicEtaAdvisory");
    expect(routeSource).toContain("buildPublicRunwayAdvisory");
    expect(routeSource).toContain("buildPublicRunwayChangeAdvisory");
  });

  it("keeps SHADOW previews behind the existing admin session", () => {
    expect(routeSource).toContain("isWatchlistSessionValid(request)");
    expect(routeSource).toContain("admin && state && etaReadiness");
    expect(routeSource).toContain("admin && state && runwayReadiness");
    expect(routeSource).toContain("admin && state && runwayChangeReadiness");
    expect(routeSource).toContain("RUNWAY_CHANGE");
    expect(routeSource).toContain("adminReadiness");
  });

  it("does not add predictive data to the main radar stream", () => {
    expect(componentSource).toContain("/api/operations/predictive?hexes=");
    expect(componentSource).not.toContain('new EventSource("/api/operations/predictive');
    expect(componentSource).toContain("PREDICTIVE_REFRESH_INTERVAL_MS");
  });

  it("uses the client-safe predictive operations module for stale expiry", () => {
    expect(componentSource).toContain('from "@/lib/predictive-intelligence/operations-center"');
    expect(componentSource).toContain("PREDICTIVE_OPERATIONS_STALE_AFTER_MS");
    expect(componentSource).toContain("RUNWAY_CHANGE_ADVISORY_EVENT_WINDOW_MS");
    expect(componentSource).toContain('data-testid="predictive-operations-center"');
  });
});
