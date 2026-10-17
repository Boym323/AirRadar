import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { WeatherRadarArchiveService } from "@/lib/server/map-context";

const sizes = [100, 1_000, 10_000];
const runs = 5;
const root = await mkdtemp(path.join(process.cwd(), ".tmp-radar-benchmark-"));
process.env.WEATHER_RADAR_ARCHIVE_DIR = root;
process.env.MAP_CONTEXT_RETENTION_DAYS = "30";
process.env.WEATHER_RADAR_ARCHIVE_MAX_BYTES = String(32 * 1024 * 1024);

try {
  for (const count of sizes) {
    const stale = Math.floor(count / 10);
    const samples: number[] = [];
    for (let run = 0; run < runs; run += 1) {
      const runRoot = path.join(root, String(count));
      await mkdir(runRoot, { recursive: true });
      for (let index = 0; index < count; index += 1) {
        const date = new Date(Date.UTC(index < stale ? 2026 : 2026, index < stale ? 8 : 9, index < stale ? 1 : 16, 0, index));
        const id = date.toISOString().slice(0, 16).replace(/[-T:]/g, "");
        const destination = path.join(runRoot, id.slice(0, 4), id.slice(4, 6), id.slice(6, 8), `${id}.png`);
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, Buffer.from([1]));
      }
      process.env.WEATHER_RADAR_ARCHIVE_DIR = runRoot;
      const service = new WeatherRadarArchiveService();
      const started = performance.now();
      await (service as unknown as { cleanup(): Promise<void> }).cleanup();
      samples.push(performance.now() - started);
      const remaining = (await service.listAllArchivedFrames()).length;
      await rm(runRoot, { recursive: true, force: true });
      if (run === 0) console.log(JSON.stringify({ count, stale, remainingAfterOnePass: remaining }));
    }
    samples.sort((left, right) => left - right);
    const percentile = (p: number) => samples[Math.min(samples.length - 1, Math.ceil(samples.length * p) - 1)];
    console.log(JSON.stringify({ count, stale, runs, p50Ms: percentile(0.5), p95Ms: percentile(0.95), maxMs: samples.at(-1), deletedPerRun: stale }));
  }
} finally {
  await rm(root, { recursive: true, force: true });
}
