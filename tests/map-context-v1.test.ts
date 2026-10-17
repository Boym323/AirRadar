import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, rm, stat, symlink, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { AviationWeatherProvider } from "@/lib/server/aviation-weather-provider";
import { WeatherRadarArchiveService } from "@/lib/server/map-context";
import { parseWeatherRadarCatalog, parseWeatherRadarFilename, WeatherRadarProvider } from "@/lib/server/weather-radar/provider";
import { buildWindGrid, isWindLevel, WindAloftProvider } from "@/lib/server/wind-aloft";

const NOW = Date.parse("2026-09-18T12:00:00.000Z");

describe("Map Context V1 providers", () => {
  it("strictly parses and bounds CHMI radar catalog filenames", () => {
    expect(parseWeatherRadarFilename("pacz2gmaps3.z_max3d.20260918.1155.0.png", NOW)?.id).toBe("202609181155");
    expect(parseWeatherRadarFilename("pacz2gmaps3.z_max3d.20261318.1155.0.png", NOW)).toBeNull();
    expect(parseWeatherRadarFilename("pacz2gmaps3.z_max3d.20260918.1205.0.jpg", NOW)).toBeNull();
    const html = [
      '<a href="pacz2gmaps3.z_max3d.20260918.1100.0.png">old</a>',
      '<a href="pacz2gmaps3.z_max3d.20260918.1155.0.png">latest</a>',
      '<a href="other.txt">other</a>',
    ].join("\n");
    expect(parseWeatherRadarCatalog(html, NOW).map((frame) => frame.id)).toEqual(["202609181100", "202609181155"]);
  });

  it("validates CHMI PNG content and coalesces frame requests", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(png, { headers: { "content-type": "image/png" } }));
    const provider = new WeatherRadarProvider(fetcher, () => NOW);
    const [first, second] = await Promise.all([provider.getFrame("202609181155"), provider.getFrame("202609181155")]);
    expect(first.length).toBe(9);
    expect(second).toBe(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(provider.getFrame("https://example.com/frame.png")).rejects.toThrow();
  });

  it("keeps a fresh radar provider on-demand until its first request and recovers after a refresh failure", async () => {
    let now = NOW;
    const html = '<a href="pacz2gmaps3.z_max3d.20260918.1155.0.png">latest</a>';
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(html))
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(new Response(html));
    const provider = new WeatherRadarProvider(fetcher, () => now);
    expect(provider.getDiagnostics()).toMatchObject({ status: "disabled", operationalState: "on_demand", reasonCode: "NOT_INITIALIZED", hasAttempted: false, inFlight: false, consecutiveFailures: 0 });
    await provider.getFrames();
    now += 61_000;
    await provider.getFrames();
    expect(provider.getDiagnostics()).toMatchObject({ status: "degraded", hasAttempted: true, consecutiveFailures: 1 });
    now += 61_000;
    await provider.getFrames();
    expect(provider.getDiagnostics()).toMatchObject({ status: "online", consecutiveFailures: 0 });
  });

  it("uses one AWC batch request for map METAR and preserves stale semantics", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify([{
      icaoId: "LKPR", reportTime: "2026-09-18T11:50:00Z", fltCat: "VFR", wdir: 260, wspd: 12, wgst: 21, visib: "10+", temp: 18, dewp: 11, altim: 1015, lat: 50.1, lon: 14.26, clouds: [{ cover: "SCT", base: 3500 }], rawOb: "LKPR 181150Z 26012G21KT 9999 SCT035 18/11 Q1015",
    }])));
    const provider = new AviationWeatherProvider({ fetcher, now: () => NOW, metarTtlMs: 300_000 });
    const result = await provider.getMetarMap([{ stationId: "LKPR", lat: 50.1, lon: 14.26 }, { stationId: "LKPR", lat: 50.1, lon: 14.26 }]);
    expect(result.observations).toMatchObject([{ stationId: "LKPR", flightCategory: "VFR", windDirection: 260, windSpeed: 12, windGust: 21, ceiling: 3500, stale: false }]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("ids=LKPR");
  });

  it("bounds the ICON-EU grid and keeps meteorological FROM direction", async () => {
    expect(isWindLevel(300)).toBe(true);
    expect(isWindLevel(250)).toBe(false);
    expect(buildWindGrid().length).toBeLessThanOrEqual(100);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify([{
      latitude: 50, longitude: 14, model_run: "2026-09-18T09:00:00Z", hourly: {
        time: ["2026-09-18T12:00", "2026-09-18T13:00"], wind_speed_300hPa: [82, 84], wind_direction_300hPa: [270, 275],
      },
    }])));
    const provider = new WindAloftProvider(fetcher, () => NOW);
    expect(provider.diagnostics()).toMatchObject({ status: "offline", operationalState: "on_demand", reasonCode: "NOT_INITIALIZED", hasAttempted: false, inFlight: false, consecutiveFailures: 0 });
    const result = await provider.getWind(300, "2026-09-18T12:00:00Z");
    expect(result).toMatchObject({ model: "ICON-EU", levelHpa: 300, validAt: "2026-09-18T12:00", modelRun: "2026-09-18T09:00:00Z" });
    expect(result.points[0]).toMatchObject({ speedKt: 82, directionDeg: 270 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("distinguishes a failed first wind load from stale-if-error and recovery", async () => {
    let now = NOW;
    const payload = JSON.stringify([{ latitude: 50, longitude: 14, model_run: "2026-09-18T09:00:00Z", hourly: { time: ["2026-09-18T12:00"], wind_speed_300hPa: [82], wind_direction_300hPa: [270] } }]);
    const fetcher = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(new Response(payload))
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce(new Response(payload));
    const provider = new WindAloftProvider(fetcher, () => now);
    await expect(provider.getWind(300)).rejects.toThrow();
    expect(provider.diagnostics()).toMatchObject({ status: "offline", hasAttempted: true, consecutiveFailures: 1 });
    await provider.getWind(300);
    now += 31 * 60_000;
    await provider.getWind(300);
    expect(provider.diagnostics()).toMatchObject({ status: "degraded", consecutiveFailures: 1, validTimes: 1 });
    await provider.getWind(300);
    expect(provider.diagnostics()).toMatchObject({ status: "online", consecutiveFailures: 0 });
  });

  describe("weather radar archive retention", () => {
    const originalArchiveDir = process.env.WEATHER_RADAR_ARCHIVE_DIR;
    const originalRetentionDays = process.env.MAP_CONTEXT_RETENTION_DAYS;
    const originalMaxBytes = process.env.WEATHER_RADAR_ARCHIVE_MAX_BYTES;
    let archiveDir: string;

    async function putFrame(id: string, bytes: number | Uint8Array): Promise<string> {
      const destination = path.join(archiveDir, id.slice(0, 4), id.slice(4, 6), id.slice(6, 8), `${id}.png`);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, typeof bytes === "number" ? Buffer.alloc(bytes, 0x01) : bytes);
      return destination;
    }

    async function cleanupService(service: WeatherRadarArchiveService): Promise<void> {
      await (service as unknown as { cleanup(): Promise<void> }).cleanup();
    }

    beforeEach(async () => {
      archiveDir = await mkdtemp(path.join(process.cwd(), ".tmp-radar-archive-"));
      vi.stubEnv("WEATHER_RADAR_ARCHIVE_DIR", archiveDir);
      vi.stubEnv("MAP_CONTEXT_RETENTION_DAYS", "30");
      vi.stubEnv("WEATHER_RADAR_ARCHIVE_MAX_BYTES", String(32 * 1024 * 1024));
    });

    afterEach(async () => {
      if (originalArchiveDir === undefined) delete process.env.WEATHER_RADAR_ARCHIVE_DIR;
      else process.env.WEATHER_RADAR_ARCHIVE_DIR = originalArchiveDir;
      if (originalRetentionDays === undefined) delete process.env.MAP_CONTEXT_RETENTION_DAYS;
      else process.env.MAP_CONTEXT_RETENTION_DAYS = originalRetentionDays;
      if (originalMaxBytes === undefined) delete process.env.WEATHER_RADAR_ARCHIVE_MAX_BYTES;
      else process.env.WEATHER_RADAR_ARCHIVE_MAX_BYTES = originalMaxBytes;
      vi.unstubAllEnvs();
      await rm(archiveDir, { recursive: true, force: true });
    });

    it("keeps public listing bounded while cleanup sees and removes expired frames", async () => {
      await putFrame("202609011200", 4);
      await putFrame("202610161200", 4);
      const service = new WeatherRadarArchiveService();
      expect((await service.listFrames()).map((frame) => frame.id)).toEqual(["202610161200"]);
      expect((await service.listAllArchivedFrames()).map((frame) => frame.id)).toEqual(["202609011200", "202610161200"]);
      await cleanupService(service);
      await expect(stat(path.join(archiveDir, "2026/09/01/202609011200.png"))).rejects.toThrow();
      expect((await service.listFrames()).map((frame) => frame.id)).toEqual(["202610161200"]);
    });

    it("removes oldest valid frames first when the archive quota is exceeded", async () => {
      await putFrame("202610161100", 17 * 1024 * 1024);
      await putFrame("202610161200", 17 * 1024 * 1024);
      await putFrame("202610161300", 1);
      await cleanupService(new WeatherRadarArchiveService());
      await expect(stat(path.join(archiveDir, "2026/10/16/202610161100.png"))).rejects.toThrow();
      await expect(stat(path.join(archiveDir, "2026/10/16/202610161200.png"))).resolves.toBeTruthy();
      await expect(stat(path.join(archiveDir, "2026/10/16/202610161300.png"))).resolves.toBeTruthy();
    });

    it("does not touch invalid names, symlinks, temporary downloads, or a raced-away file", async () => {
      const valid = await putFrame("202610161200", 4);
      const dayDir = path.dirname(valid);
      await writeFile(path.join(dayDir, "not-a-frame.png"), Buffer.alloc(4));
      await writeFile(path.join(dayDir, "202610161201.png.tmp"), Buffer.alloc(4));
      const outside = path.join(archiveDir, "outside.png");
      await writeFile(outside, Buffer.alloc(4));
      await symlink(outside, path.join(dayDir, "202610161202.png"));
      await unlink(valid);
      await expect(cleanupService(new WeatherRadarArchiveService())).resolves.toBeUndefined();
      await expect(stat(path.join(dayDir, "not-a-frame.png"))).resolves.toBeTruthy();
      await expect(stat(path.join(dayDir, "202610161201.png.tmp"))).resolves.toBeTruthy();
      await expect(stat(outside)).resolves.toBeTruthy();
    });

    it("reports capacity over the complete valid inventory, including expired frames", async () => {
      await putFrame("202609011200", 7);
      await putFrame("202610161200", 11);
      const diagnostics = await new WeatherRadarArchiveService().diagnostics();
      expect(diagnostics.frames).toBe(1);
      expect(diagnostics.diskBytes).toBe(18);
    });
  });
  it("returns the readFile Buffer without an additional frame-sized copy", async () => {
    const archiveDir = await mkdtemp(path.join(process.cwd(), ".tmp-radar-frame-"));
    const id = "202610161200";
    const framePath = path.join(archiveDir, "2026/10/16", `${id}.png`);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    await mkdir(path.dirname(framePath), { recursive: true });
    await writeFile(framePath, png);
    vi.stubEnv("WEATHER_RADAR_ARCHIVE_DIR", archiveDir);
    try {
      const frame = await new WeatherRadarArchiveService().getFrame(id);
      expect(frame).not.toBeNull();
      expect(Buffer.isBuffer(frame)).toBe(true);
      expect(frame).toEqual(await readFile(framePath));
    } finally {
      vi.unstubAllEnvs();
      await rm(archiveDir, { recursive: true, force: true });
    }
  });
});
