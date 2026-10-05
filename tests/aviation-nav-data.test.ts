import { describe, expect, it, vi } from "vitest";
import { AviationNavDataProvider, normalizeAviationNavPayload, normalizeAviationNavQuery } from "@/lib/server/aviation-nav-data-provider";
import { createAviationNavGeoJSON } from "@/lib/navigation-data/map";
import { routeReferencePointIds } from "@/lib/navigation-data/route-reference";

describe("Aviation Nav Data V1", () => {
  it("normalizes documented AWC NAVAID and FIX fields", () => {
    expect(normalizeAviationNavPayload("NAVAID", [{
      id: "MCI", type: "VORTAC", name: "Kansas City", state: "MO", country: "US",
      lat: 39.2853, lon: -94.7371, elev: 310, freq: 113.25, mag_dec: "05E",
    }])).toEqual([expect.objectContaining({
      id: "MCI", kind: "NAVAID", type: "VORTAC", name: "Kansas City",
      latitude: 39.2853, longitude: -94.7371, elevationFt: 310,
      frequencyMhz: 113.25, magneticDeclination: "05E", country: "US",
      source: "Aviation Weather Center",
    })]);

    expect(normalizeAviationNavPayload("FIX", [{
      id: "BARBQ", type: "I", lat: 39.0811, lon: -94.7681,
    }])).toEqual([expect.objectContaining({
      id: "BARBQ", kind: "FIX", type: "I", latitude: 39.0811, longitude: -94.7681,
    })]);
  });

  it("rejects unbounded queries", () => {
    expect(normalizeAviationNavQuery({ latitude: 50, longitude: 14, radiusNm: 120, kinds: ["NAVAID", "FIX"] })).not.toBeNull();
    expect(normalizeAviationNavQuery({ latitude: 50, longitude: 14, radiusNm: 251, kinds: ["NAVAID"] })).toBeNull();
    expect(normalizeAviationNavQuery({ latitude: 91, longitude: 14, radiusNm: 120, kinds: ["FIX"] })).toBeNull();
    expect(normalizeAviationNavQuery({ latitude: 50, longitude: 14, radiusNm: 120, kinds: [] })).toBeNull();
  });

  it("uses documented bbox/json parameters and reuses the long-lived cache", async () => {
    let now = Date.parse("2026-10-04T20:00:00Z");
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      expect(["/api/data/navaid", "/api/data/fix"]).toContain(url.pathname);
      expect(url.searchParams.get("format")).toBe("json");
      expect(url.searchParams.get("bbox")?.split(",")).toHaveLength(4);
      if (url.pathname.endsWith("/navaid")) return new Response(JSON.stringify([{ id: "BNO", type: "VOR", name: "Brno", country: "CZ", lat: 49.15, lon: 16.69, freq: 114.45 }]), { status: 200 });
      return new Response(JSON.stringify([{ id: "ODNEM", type: "I", lat: 49.4, lon: 17.1 }]), { status: 200 });
    });
    const provider = new AviationNavDataProvider({
      fetcher: fetcher as typeof fetch,
      now: () => now,
      baseUrl: "https://aviationweather.gov",
      ttlMs: 6 * 60 * 60_000,
      staleMs: 7 * 24 * 60 * 60_000,
      timeoutMs: 1000,
    });
    const query = { latitude: 49.2, longitude: 17.7, radiusNm: 120, kinds: ["NAVAID", "FIX"] as const };
    const first = await provider.getData({ ...query, kinds: [...query.kinds] });
    expect(first.cacheSource).toBe("live");
    expect(first.points.map((point) => point.id)).toEqual(["ODNEM", "BNO"]);
    now += 60_000;
    const cached = await provider.getData({ ...query, kinds: [...query.kinds] });
    expect(cached.cacheSource).toBe("memory-cache");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("looks up exact nav identifiers with documented ids/json params and caches the result", async () => {
    let now = Date.parse("2026-10-04T20:00:00Z");
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("ids")).toBe("BNO");
      expect(url.searchParams.get("format")).toBe("json");
      if (url.pathname.endsWith("/navaid")) return new Response(JSON.stringify([{ id: "BNO", type: "VOR", name: "Brno", country: "CZ", lat: 49.15, lon: 16.69, freq: 114.45 }]), { status: 200 });
      return new Response(JSON.stringify([]), { status: 200 });
    });
    const provider = new AviationNavDataProvider({
      fetcher: fetcher as typeof fetch,
      now: () => now,
      baseUrl: "https://aviationweather.gov",
      ttlMs: 6 * 60 * 60_000,
      timeoutMs: 1000,
    });
    await expect(provider.searchIdentifiers(["bno"])).resolves.toEqual([
      expect.objectContaining({ id: "BNO", kind: "NAVAID" }),
    ]);
    now += 60_000;
    await provider.searchIdentifiers(["BNO"]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("cross-references filed route waypoint tokens without changing route authority", () => {
    const points = [
      { id: "BNO", kind: "NAVAID" as const, type: "VOR", name: "Brno", latitude: 49.15, longitude: 16.69, elevationFt: 778, frequencyMhz: 114.45, magneticDeclination: null, state: null, country: "CZ", source: "Aviation Weather Center" as const },
      { id: "ODNEM", kind: "FIX" as const, type: "I", name: null, latitude: 49.4, longitude: 17.1, elevationFt: null, frequencyMhz: null, magneticDeclination: null, state: null, country: "CZ", source: "Aviation Weather Center" as const },
    ];
    const matched = routeReferencePointIds({
      callsign: "TEST1",
      scheduledDeparture: null,
      actualDeparture: null,
      scheduledArrival: null,
      estimatedArrival: null,
      filedRoute: "BNO DCT ODNEM",
      waypoints: [],
    }, points);
    expect([...matched].sort()).toEqual(["BNO", "ODNEM"]);
    const geojson = createAviationNavGeoJSON(points, matched);
    expect(geojson.features.map((feature) => feature.properties.routeMatched)).toEqual([true, true]);
  });

  it("projects NAVAID/FIX data into a point-only map source", () => {
    const geojson = createAviationNavGeoJSON([
      { id: "BNO", kind: "NAVAID", type: "VOR", name: "Brno", latitude: 49.15, longitude: 16.69, elevationFt: 778, frequencyMhz: 114.45, magneticDeclination: null, state: null, country: "CZ", source: "Aviation Weather Center" },
    ]);
    expect(geojson.features[0]).toMatchObject({
      geometry: { type: "Point", coordinates: [16.69, 49.15] },
      properties: { id: "BNO", kind: "NAVAID", label: "BNO", source: "Aviation Weather Center" },
    });
  });
});
