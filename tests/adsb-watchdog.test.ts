import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error The operational watchdog is intentionally a plain Node script.
import { runWatchdog } from "../scripts/adsb-watchdog.mjs";

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
  delete (globalThis as { fetch?: unknown }).fetch;
  delete process.env.AIRRADAR_ADSB_WATCHDOG_STATUS_URL;
  delete process.env.AIRRADAR_ADSB_WATCHDOG_STATE_FILE;
});

async function watchdogStateFile() {
  const root = await mkdtemp(path.join(os.tmpdir(), "airradar-adsb-watchdog-"));
  roots.push(root);
  return path.join(root, "last-restart");
}

describe("ADSB watchdog", () => {
  it("uses the lightweight health response and restarts only after both timestamps are stale", async () => {
    let requestedUrl = "";
    globalThis.fetch = (async (url: string | URL) => {
      requestedUrl = String(url);
      return new Response(JSON.stringify({ adsbLol: {
        enabled: true,
        status: "degraded",
        lastSuccessAt: new Date(0).toISOString(),
        lastAttemptAt: new Date(0).toISOString(),
      } }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const stateFile = await watchdogStateFile();
    let restarts = 0;
    const result = await runWatchdog({ now: 10 * 60_000, stateFile, statusUrl: "http://example.test/api/health?watchdog=1", restart: () => { restarts += 1; } });
    expect(requestedUrl).toContain("/api/health?watchdog=1");
    expect(result.action).toBe("restart");
    expect(restarts).toBe(1);
    expect(Number(await readFile(stateFile, "utf8"))).toBe(10 * 60_000);
  });

  it("does not restart when attempts are still recent despite a failed last success", async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ adsbLol: {
      enabled: true,
      status: "degraded",
      lastSuccessAt: new Date(0).toISOString(),
      lastAttemptAt: new Date(9 * 60_000).toISOString(),
    } }), { status: 200 })) as typeof fetch;
    const stateFile = await watchdogStateFile();
    let restarts = 0;
    const result = await runWatchdog({ now: 10 * 60_000, stateFile, statusUrl: "http://example.test/api/health?watchdog=1", restart: () => { restarts += 1; } });
    expect(result.action).toBe("none");
    expect(restarts).toBe(0);
  });
});
