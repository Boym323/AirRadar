import { describe, expect, it, vi } from "vitest";
import { normalizePirepPayload, normalizePirepQuery, PirepProvider } from "@/lib/server/pirep-provider";

describe("PIREP/AIREP provider", () => {
  it("normalizes decoded PIREP and AIREP observations conservatively", () => {
    const result = normalizePirepPayload([
      {
        id: "p1",
        reportType: "UUA",
        obsTime: "2026-10-04T18:00:00Z",
        lat: 50.1,
        lon: 14.2,
        fltLvl: 120,
        acType: "B738",
        temp: -12,
        wdir: 270,
        wspd: 45,
        turbInten: "MOD",
        turbType: "CAT",
        iceInten: "LGT",
        iceType: "RIME",
        rawOb: "UUA TEST /TB MOD CAT /IC LGT RIME",
      },
      {
        reportId: "a1",
        reportType: "AIREP",
        reportTime: "2026-10-04T17:55:00Z",
        latitude: 49.9,
        longitude: 15.0,
        altitude: 35000,
        aircraftRef: "A320",
        temperature: -48,
      },
      { reportType: "PIREP", obsTime: "bad", lat: 99, lon: 14 },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: "p1",
      reportType: "PIREP",
      urgent: true,
      altitudeFt: 12000,
      aircraftType: "B738",
      temperatureC: -12,
      windDirectionDeg: 270,
      windSpeedKt: 45,
      turbulence: { intensity: "MOD", type: "CAT" },
      icing: { intensity: "LGT", type: "RIME" },
    });
    expect(result[1]).toMatchObject({
      id: "a1",
      reportType: "AIREP",
      urgent: false,
      altitudeFt: 35000,
      aircraftType: "A320",
    });
  });

  it("bounds the public query contract", () => {
    expect(normalizePirepQuery({ latitude: 50, longitude: 14, radiusNm: 100, hours: 6, altitudeFt: 33000 })).toMatchObject({
      latitude: 50,
      longitude: 14,
      radiusNm: 100,
      hours: 6,
      altitudeFt: 33000,
    });
    expect(normalizePirepQuery({ latitude: 91, longitude: 14, radiusNm: 100, hours: 6 })).toBeNull();
    expect(normalizePirepQuery({ latitude: 50, longitude: 14, radiusNm: 301, hours: 6 })).toBeNull();
    expect(normalizePirepQuery({ latitude: 50, longitude: 14, radiusNm: 100, hours: 25 })).toBeNull();
  });

  it("uses a bounded AWC bbox query and reuses the five-minute cache", async () => {
    let now = Date.parse("2026-10-04T18:00:00Z");
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/api/data/pirep");
      expect(url.searchParams.get("format")).toBe("json");
      expect(url.searchParams.get("age")).toBe("6");
      expect(url.searchParams.get("level")).toBe("30000");
      const bbox = url.searchParams.get("bbox")?.split(",").map(Number) ?? [];
      expect(bbox).toHaveLength(4);
      expect(bbox[0]).toBeLessThan(50);
      expect(bbox[2]).toBeGreaterThan(50);
      return new Response(JSON.stringify([{
        id: "one",
        reportType: "PIREP",
        obsTime: "2026-10-04T17:50:00Z",
        lat: 50.2,
        lon: 14.4,
        altitude: 30000,
        turbInten: "LGT",
      }]), { status: 200, headers: { "Content-Type": "application/json" } });
    });

    const provider = new PirepProvider({
      fetcher: fetcher as typeof fetch,
      now: () => now,
      baseUrl: "https://aviationweather.gov",
      timeoutMs: 1000,
      ttlMs: 300_000,
      staleMs: 900_000,
    });
    const query = { latitude: 50, longitude: 14, radiusNm: 100, hours: 6, altitudeFt: 30000 };
    const first = await provider.getPireps(query);
    expect(first.cacheSource).toBe("live");
    expect(first.reports).toHaveLength(1);

    now += 60_000;
    const second = await provider.getPireps(query);
    expect(second.cacheSource).toBe("memory-cache");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("serves a bounded stale snapshot when the upstream refresh fails", async () => {
    let now = 0;
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockRejectedValueOnce(new Error("network"));
    const provider = new PirepProvider({
      fetcher: fetcher as typeof fetch,
      now: () => now,
      baseUrl: "https://aviationweather.gov",
      ttlMs: 1000,
      staleMs: 5000,
      timeoutMs: 1000,
    });
    const query = { latitude: 50, longitude: 14, radiusNm: 100, hours: 6 };
    await provider.getPireps(query);
    now = 2000;
    const stale = await provider.getPireps(query);
    expect(stale.stale).toBe(true);
    expect(stale.cacheSource).toBe("stale-cache");
  });
});
