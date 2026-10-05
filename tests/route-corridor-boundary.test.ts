import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const hookSource = readFileSync(join(root, "components/radar/use-route-corridor-intelligence.ts"), "utf8");
const appSource = readFileSync(join(root, "components/airradar-app.tsx"), "utf8");
const drawerSource = readFileSync(join(root, "components/aircraft-radar-quick-detail.tsx"), "utf8");
const navRouteSource = readFileSync(join(root, "app/api/navigation/data/route.ts"), "utf8");

describe("Route Corridor Intelligence V1 boundaries", () => {
  it("reuses the existing aircraft stream and performs only one selected-route reference read", () => {
    expect(hookSource).toContain("/api/navigation/data?ids=");
    expect(hookSource).not.toContain("new EventSource");
    expect(hookSource).not.toContain("setInterval");
    expect(hookSource).not.toContain("/api/history");
    expect(hookSource).not.toContain("/api/intelligence");
  });

  it("keeps reference lookup bounded and delegates to the cached AWC provider", () => {
    expect(navRouteSource).toContain("slice(0, 24)");
    expect(navRouteSource).toContain("chunks(requestedIdentifiers.ids, 8)");
    expect(navRouteSource).toContain("defaultAviationNavDataProvider.searchIdentifiers");
    expect(navRouteSource).not.toContain("aviationweather.gov");
  });

  it("uses the existing Route Intelligence map source family and keeps the legacy fallback", () => {
    expect(appSource).toContain("useRouteCorridorIntelligence(selectedAircraft)");
    expect(appSource).toContain("ROUTE_INTELLIGENCE_SOURCE_ID");
    expect(appSource).toContain("createRouteIntelligenceGeoJSON(selectedRouteCorridor.route)");
    expect(appSource).toContain("ROUTE_V2_COMPLETED_LAYER_ID");
    expect(appSource).toContain("!routeIntelligenceActiveRef.current");
  });

  it("surfaces a bounded informational corridor card with explicit safety wording", () => {
    expect(drawerSource).toContain('data-testid="route-corridor-intelligence"');
    expect(drawerSource).toContain("t.routeCorridor.statuses[corridor.status]");
    expect(drawerSource).toContain("t.routeCorridor.disclaimer");
  });
});
