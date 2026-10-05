import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Aviation Nav Data V1 boundaries", () => {
  it("keeps AWC nav data bounded and outside the ADS-B hot path", async () => {
    const provider = await readFile("lib/server/aviation-nav-data-provider.ts", "utf8");
    const route = await readFile("app/api/navigation/data/route.ts", "utf8");
    const aircraftState = await readFile("lib/server/aircraft-state.ts", "utf8");

    expect(provider).toContain("endpointForKind(kind)");
    expect(provider).toContain('url.searchParams.set("bbox", bbox)');
    expect(provider).toContain('url.searchParams.set("format", "json")');
    expect(provider).toContain("MAX_CACHE_ENTRIES = 64");
    expect(provider).toContain("MAX_UPSTREAM_RESULTS = 400");
    expect(provider).toContain("MAX_UPSTREAM_REQUESTS_PER_MINUTE = 80");
    expect(provider).toContain("DEFAULT_TTL_MS = 6 * 60 * 60_000");
    expect(route).toContain('checkPublicRateLimit("mapContext", request)');
    expect(aircraftState).not.toContain("aviation-nav-data-provider");
  });

  it("keeps global nav search bounded and route highlighting display-only", async () => {
    const provider = await readFile("lib/server/aviation-nav-data-provider.ts", "utf8");
    const search = await readFile("lib/server/search.ts", "utf8");
    const routeReference = await readFile("lib/navigation-data/route-reference.ts", "utf8");
    const app = await readFile("components/airradar-app.tsx", "utf8");

    expect(provider).toContain('url.searchParams.set("ids", ids.join(","))');
    expect(provider).toContain("MAX_IDENTIFIER_CACHE_ENTRIES = 128");
    expect(search).toContain("searchIdentifiers([normalized])");
    expect(routeReference).toContain("tokenizeRoute(routeText");
    expect(routeReference).toContain("display/enrichment only");
    expect(app).toContain('searchParams.get("navPoint")');
    expect(app).toContain("routeReferencePointIds");
    expect(app).toContain("selectedNavRoutePointIds");
  });

  it("renders nav data as an optional independent map layer", async () => {
    const app = await readFile("components/airradar-app.tsx", "utf8");
    const menu = await readFile("components/radar/radar-map-layer-menu.tsx", "utf8");

    expect(app).toContain('map.addSource("aviation-nav-data"');
    expect(app).toContain('id: "aviation-nav-data-points"');
    expect(app).toContain('id: "aviation-nav-data-labels"');
    expect(app).toContain('localStorage.setItem("airradar-nav-data-layer"');
    expect(menu).toContain('data-testid="map-layer-nav-data"');
  });
});
