import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { AviationWeatherProvider, normalizeSigmetGeoJson } from "@/lib/server/aviation-weather-provider";

const radarSource = readFileSync(new URL("../components/airradar-app.tsx", import.meta.url), "utf8");

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
    expect(result[0].source).toBe("isigmet");
  });

  it("maps the official AirSIGMET altitude fields without double conversion", () => {
    const current = feature("air-current", { base: undefined, top: undefined, altitudeLo1: 18000, altitudeHi1: 35000, rawSigmet: undefined, rawAirSigmet: "CONVECTIVE SIGMET" });
    const result = normalizeSigmetGeoJson(geoJson([current]), Date.parse("2026-09-09T12:00:00Z"), "2026-09-09T12:00:00.000Z", "airsigmet");
    expect(result[0]).toMatchObject({ source: "airsigmet", lowerFt: 18_000, upperFt: 35_000 });
  });

  it("keeps missing advisory altitude nullable", () => {
    const current = feature("no-altitude", { base: undefined, top: undefined, altitudeLo1: undefined, altitudeHi1: undefined });
    const result = normalizeSigmetGeoJson(geoJson([current]), Date.parse("2026-09-09T12:00:00Z"), undefined, "airsigmet");
    expect(result[0]).toMatchObject({ lowerFt: null, upperFt: null });
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
    expect(result.features[0].properties.source).toBe("isigmet");
    expect(provider.getDiagnostics().sigmet).toMatchObject({
      overallStatus: "online",
      international: { status: "fresh", featureCount: 1, stale: false },
      airsigmet: { status: "fresh", featureCount: 0, stale: false },
    });
  });

  it("retains stale International SIGMETs when AirSIGMET refreshes successfully", async () => {
    let now = Date.parse("2026-09-09T12:00:00Z");
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(geoJson([feature("A"), feature("B")])))
      .mockResolvedValueOnce(response(geoJson([feature("C"), feature("D")])))
      .mockRejectedValueOnce(new Error("isigmet timeout"))
      .mockResolvedValueOnce(response(geoJson([feature("E"), feature("F")])))
      .mockRejectedValue(new Error("unexpected extra request"));
    const provider = new AviationWeatherProvider({ fetcher, now: () => now, sigmetTtlMs: 10, staleIfErrorMs: 100 });
    await provider.getSigmets();
    now += 11;
    const result = await provider.getSigmets();
    expect(result.features.map((item) => item.id)).toEqual(["A", "B", "E", "F"]);
    expect(result.stale).toBe(true);
    expect(provider.getDiagnostics().sigmet).toMatchObject({
      overallStatus: "degraded",
      international: { status: "stale", featureCount: 2, stale: true },
      airsigmet: { status: "fresh", featureCount: 2, stale: false },
    });
  });

  it("retains stale AirSIGMETs when International SIGMET refreshes successfully", async () => {
    let now = Date.parse("2026-09-09T12:00:00Z");
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(geoJson([feature("A"), feature("B")])))
      .mockResolvedValueOnce(response(geoJson([feature("C"), feature("D")])))
      .mockResolvedValueOnce(response(geoJson([feature("E"), feature("F")])))
      .mockRejectedValueOnce(new Error("airsigmet timeout"));
    const provider = new AviationWeatherProvider({ fetcher, now: () => now, sigmetTtlMs: 10, staleIfErrorMs: 100 });
    await provider.getSigmets();
    now += 11;
    const result = await provider.getSigmets();
    expect(result.features.map((item) => item.id)).toEqual(["E", "F", "C", "D"]);
    expect(provider.getDiagnostics().sigmet).toMatchObject({
      overallStatus: "degraded",
      international: { status: "fresh", featureCount: 2, stale: false },
      airsigmet: { status: "stale", featureCount: 2, stale: true },
    });
  });

  it("retains both stale datasets during a total failure while their advisories remain valid", async () => {
    let now = Date.parse("2026-09-09T12:00:00Z");
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(geoJson([feature("international")])))
      .mockResolvedValueOnce(response(geoJson([feature("domestic")])))
      .mockRejectedValue(new Error("upstream down"));
    const provider = new AviationWeatherProvider({ fetcher, now: () => now, sigmetTtlMs: 10, staleIfErrorMs: 100 });
    await provider.getSigmets();
    now += 11;
    const result = await provider.getSigmets();
    expect(result.features.map((item) => item.id)).toEqual(["international", "domestic"]);
    expect(result.stale).toBe(true);
    expect(provider.getDiagnostics().sigmet.overallStatus).toBe("degraded");
  });

  it("does not revive a time-expired advisory from technically stale cache", async () => {
    let now = Date.parse("2026-09-09T12:05:00Z");
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(geoJson([feature("expired-later", { validTimeTo: "2026-09-09T12:10:00Z" })])))
      .mockResolvedValueOnce(response(geoJson([])))
      .mockRejectedValue(new Error("upstream down"));
    const provider = new AviationWeatherProvider({ fetcher, now: () => now, sigmetTtlMs: 10, staleIfErrorMs: 60 * 60_000 });
    await provider.getSigmets();
    now = Date.parse("2026-09-09T12:15:00Z");
    const result = await provider.getSigmets();
    expect(result.features).toEqual([]);
    expect(result.stale).toBe(true);
    expect(provider.getDiagnostics().sigmet.international).toMatchObject({ status: "stale", featureCount: 0, stale: true });
  });

  it("treats an empty successful dataset as current and clears its previous features", async () => {
    let now = Date.parse("2026-09-09T12:00:00Z");
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(geoJson([feature("old-international")])))
      .mockResolvedValueOnce(response(geoJson([feature("old-domestic")])))
      .mockResolvedValueOnce(response(geoJson([])))
      .mockResolvedValueOnce(response(geoJson([])));
    const provider = new AviationWeatherProvider({ fetcher, now: () => now, sigmetTtlMs: 10, staleIfErrorMs: 100 });
    await provider.getSigmets();
    now += 11;
    const result = await provider.getSigmets();
    expect(result.features).toEqual([]);
    expect(result.stale).toBe(false);
    expect(provider.getDiagnostics().sigmet).toMatchObject({ overallStatus: "online", international: { status: "fresh", featureCount: 0 }, airsigmet: { status: "fresh", featureCount: 0 } });
  });

  it("recovers both dataset states after a partial refresh failure", async () => {
    let now = Date.parse("2026-09-09T12:00:00Z");
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(geoJson([feature("old-international")])))
      .mockResolvedValueOnce(response(geoJson([feature("old-domestic")])))
      .mockRejectedValueOnce(new Error("isigmet timeout"))
      .mockResolvedValueOnce(response(geoJson([feature("fresh-domestic")])))
      .mockResolvedValueOnce(response(geoJson([feature("fresh-international")])))
      .mockResolvedValueOnce(response(geoJson([feature("fresh-domestic-2")])))
      .mockRejectedValue(new Error("unexpected extra request"));
    const provider = new AviationWeatherProvider({ fetcher, now: () => now, sigmetTtlMs: 10, staleIfErrorMs: 100 });
    await provider.getSigmets();
    now += 11;
    await provider.getSigmets();
    now += 11;
    const recovered = await provider.getSigmets();
    expect(recovered.features.map((item) => item.id)).toEqual(["fresh-international", "fresh-domestic-2"]);
    expect(recovered.stale).toBe(false);
    expect(provider.getDiagnostics().sigmet).toMatchObject({
      overallStatus: "online",
      international: { status: "fresh", consecutiveFailures: 0 },
      airsigmet: { status: "fresh", consecutiveFailures: 0 },
    });
  });

  it("keeps same IDs separate across distinct AWC product namespaces", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(geoJson([feature("same-id")])))
      .mockResolvedValueOnce(response(geoJson([feature("same-id", { altitudeLo1: 18000, altitudeHi1: 30000 })])));
    const result = await new AviationWeatherProvider({ fetcher, now: () => Date.parse("2026-09-09T12:00:00Z") }).getSigmets();
    expect(result.features).toHaveLength(2);
    expect(result.features.map((item) => item.properties.source)).toEqual(["isigmet", "airsigmet"]);
    expect(result.features.map((item) => item.id)).toEqual(["isigmet:same-id", "airsigmet:same-id"]);
  });

  it("keeps the last good SIGMET polygons on a client refresh error and clears only on valid empty success", () => {
    expect(radarSource).toContain("// A transient client/API failure must not erase the last good layer.");
    expect(radarSource).toContain("generation !== sigmetGenerationRef.current");
    expect(radarSource).toContain("data.type === \"FeatureCollection\" && Array.isArray(data.features)");
    expect(radarSource).not.toContain("if (active) setSigmetData(EMPTY_SIGMET_DATA);");
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
