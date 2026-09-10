import { describe, expect, it, vi } from "vitest";
import { AviationWeatherProvider, normalizeSigmetGeoJson } from "@/lib/server/aviation-weather-provider";

const polygon = [[
  [14, 49], [15, 49], [15, 50], [14, 49],
]];

function feature(id: string, overrides: Record<string, unknown> = {}) {
  return {
    type: "Feature",
    id,
    properties: {
      icaoId: "LKAA",
      firId: "LKAA",
      firName: "Prague FIR",
      seriesId: "A1",
      hazard: "SEV TURB",
      qualifier: "OBS",
      validTimeFrom: "2026-09-09T11:00:00Z",
      validTimeTo: "2026-09-09T13:00:00Z",
      base: "FL100",
      top: "FL300",
      rawSigmet: "SIGMET A1 SEV TURB",
      ...overrides,
    },
    geometry: { type: "Polygon", coordinates: polygon },
  };
}

function geoJson(features: unknown[]) {
  return { type: "FeatureCollection", features };
}

function response(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/geo+json", ...headers } });
}

describe("Aviation Weather SIGMET normalization", () => {
  it("keeps current Polygon and MultiPolygon features and converts flight levels", () => {
    const current = feature("current");
    const multi = { ...feature("multi"), geometry: { type: "MultiPolygon", coordinates: [polygon] } };
    const result = normalizeSigmetGeoJson(geoJson([current, multi]), Date.parse("2026-09-09T12:00:00Z"), "2026-09-09T12:00:00.000Z");
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: "current", lowerFt: 10_000, upperFt: 30_000, hazard: "SEV TURB" });
    expect(result[0].geometry.type).toBe("Polygon");
  });

  it("filters expired, future, malformed and open-ring features", () => {
    const now = Date.parse("2026-09-09T12:00:00Z");
    const expired = feature("expired", { validTimeFrom: "2026-09-09T08:00:00Z", validTimeTo: "2026-09-09T09:00:00Z" });
    const future = feature("future", { validTimeFrom: "2026-09-09T13:00:00Z" });
    const open = { ...feature("open"), geometry: { type: "Polygon", coordinates: [[[14, 49], [15, 49], [15, 50]]] } };
    expect(normalizeSigmetGeoJson(geoJson([expired, future, open]), now)).toEqual([]);
  });

  it("coalesces the worldwide and CONUS datasets and tolerates 204 for one dataset", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(geoJson([feature("worldwide")]), 200))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const provider = new AviationWeatherProvider({ fetcher, now: () => Date.parse("2026-09-09T12:00:00Z") });
    const result = await provider.getSigmets();
    expect(result.features).toHaveLength(1);
    expect(result.features[0].properties.rawText).toBe("SIGMET A1 SEV TURB");
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "https://aviationweather.gov/api/data/isigmet?format=geojson",
      "https://aviationweather.gov/api/data/airsigmet?format=geojson",
    ]);
  });

  it("serves a stale SIGMET snapshot after a failed refresh", async () => {
    let now = Date.parse("2026-09-09T12:00:00Z");
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(geoJson([feature("cached")]), 200))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockRejectedValue(new Error("upstream down"));
    const provider = new AviationWeatherProvider({ fetcher, now: () => now, sigmetTtlMs: 10, staleIfErrorMs: 100 });
    await provider.getSigmets();
    now += 11;
    const stale = await provider.getSigmets();
    expect(stale.stale).toBe(true);
    expect(stale.features[0].id).toBe("cached");
  });

  it("records Retry-After and blocks new upstream calls during the backoff", async () => {
    let now = Date.parse("2026-09-09T12:00:00Z");
    const fetcher = vi.fn().mockResolvedValue(new Response("limited", { status: 429, headers: { "Retry-After": "30" } }));
    const provider = new AviationWeatherProvider({ fetcher, now: () => now });
    await expect(provider.getSigmets()).rejects.toThrow();
    expect(provider.getDiagnostics()).toMatchObject({ status: "rate_limited", retryAfterMs: 30_000 });
    const calls = fetcher.mock.calls.length;
    now += 1_000;
    await expect(provider.getSigmets()).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(calls);
  });
});
