import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getAircraftHistory } from "@/lib/server/history";
import { GET as getAirports } from "@/app/api/airports/route";

const appSource = readFileSync(new URL("../components/airradar-app.tsx", import.meta.url), "utf8");
const trafficBrowserSource = readFileSync(new URL("../components/radar/radar-traffic-browser.tsx", import.meta.url), "utf8");
const intelligenceHook = readFileSync(new URL("../components/use-intelligence-stream.ts", import.meta.url), "utf8");
const airportsRoute = readFileSync(new URL("../app/api/airports/route.ts", import.meta.url), "utf8");
const historyRoute = readFileSync(new URL("../app/api/history/[hex]/route.ts", import.meta.url), "utf8");

describe("secondary data loading", () => {
  it("does not mount Intelligence or Logbook before their details are opened", () => {
    expect(trafficBrowserSource).toContain("{intelligenceOpened && <IntelligenceFeed />}");
    expect(trafficBrowserSource).toContain("{logbookOpened && <LogbookSummary />}");
    expect(trafficBrowserSource).toContain("onToggle={(event) => setIntelligenceOpened(event.currentTarget.open)}");
    expect(trafficBrowserSource).toContain("onToggle={(event) => setLogbookOpened(event.currentTarget.open)}");
    expect(intelligenceHook).toContain("source.close()");
    expect(intelligenceHook).toContain("controller.abort()");
  });

  it("loads OGN only after the layer is explicitly enabled and closes its stream when hidden", () => {
    expect(appSource).toContain("if (!showOgn) {");
    expect(appSource).toContain("if (ognLoadStartedRef.current) return;");
    expect(appSource).toContain("if (ognEnabled !== true || !showOgn) return;");
    expect(appSource).toContain('fetch("/api/ogn/state"');
  });

  it("uses server-side airport bounds and a bounded history limit", () => {
    expect(appSource).toContain("/api/airports?lat=");
    expect(appSource).not.toContain("airportsWithinMapRadius");
    expect(airportsRoute).toContain("haversineDistanceKm");
    expect(airportsRoute).toContain("airportCache.key === cacheKey");
    expect(historyRoute).toContain("MAX_HISTORY_LIMIT = 500");
    expect(appSource).toContain("?limit=120");
  });

  it("rejects incomplete or invalid airport map queries", async () => {
    expect((await getAirports(new Request("http://localhost/api/airports?lat=50"))).status).toBe(400);
    expect((await getAirports(new Request("http://localhost/api/airports?lat=91&lon=14&radiusNm=250"))).status).toBe(400);
    expect((await getAirports(new Request("http://localhost/api/airports?lat=50&lon=14&radiusNm=24"))).status).toBe(400);
  });

  it("preserves chronological order while applying the live history limit", async () => {
    const trail = Array.from({ length: 180 }, (_, index) => ({
      lat: 50,
      lon: 14 + index / 1000,
      recordedAt: new Date(Date.parse("2026-01-01T12:00:00Z") + index * 20_000).toISOString(),
      altitude: 20_000,
      groundSpeed: 300,
      track: 90,
    }));
    const history = await getAircraftHistory("ABC123", { trail } as never, 120);
    expect(history.positions).toHaveLength(120);
    expect(history.positions[0]?.recordedAt).toBe(trail[60]?.recordedAt);
    expect(history.positions.at(-1)?.recordedAt).toBe(trail.at(-1)?.recordedAt);
  });
});
