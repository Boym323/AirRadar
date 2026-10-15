import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readRoutesetRefusalCooldown, saveRoutesetRefusalCooldown, clearRoutesetRefusalCooldown,
} from "@/lib/server/routeset-refusal-persistence";
import { AdsbLolRouteProvider, getAdsbLolRoutesetRuntimeDiagnostics } from "@/lib/server/adsblol-route-provider";

const roots: string[] = [];
function stateFile() {
  const root = mkdtempSync(join(tmpdir(), "airradar-routeset-refusal-"));
  roots.push(root);
  const file = join(root, "routeset-state.json");
  vi.stubEnv("AIRRADAR_ROUTESET_REFUSAL_STATE_FILE", file);
  return file;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("ADSB.lol 403 refusal cooldown persists across deployments", () => {
  it("writes only the bounded timestamp, loads it and clears on successful response", () => {
    const file = stateFile();
    const until = new Date(Date.now() + 60 * 60_000).toISOString();
    expect(saveRoutesetRefusalCooldown(until)).toBe(true);
    expect(readRoutesetRefusalCooldown()).toBe(until);
    const stored = readFileSync(file, "utf8");
    expect(JSON.parse(stored)).toEqual({ version: 1, blockedUntilAt: until });
    expect(stored).not.toMatch(/callsign|token|plane|cookie/i);
    clearRoutesetRefusalCooldown();
    expect(readRoutesetRefusalCooldown()).toBeNull();
  });

  it("fails open on corrupt, expired and overlong states", () => {
    const file = stateFile();
    expect(readRoutesetRefusalCooldown()).toBeNull();
    writeFileSync(file, "{broken");
    expect(readRoutesetRefusalCooldown()).toBeNull();
    writeFileSync(file, JSON.stringify({ version: 1, blockedUntilAt: new Date(Date.now() - 1000).toISOString() }));
    expect(readRoutesetRefusalCooldown()).toBeNull();
    writeFileSync(file, "x".repeat(1024));
    expect(readRoutesetRefusalCooldown()).toBeNull();
    expect(saveRoutesetRefusalCooldown(new Date(Date.now() + 7 * 60 * 60_000).toISOString())).toBe(false);
  });

  it("refuses symlinked cooldown files and does not follow unrelated paths", () => {
    const file = stateFile();
    const actual = join(file + ".actual");
    const until = new Date(Date.now() + 60 * 60_000).toISOString();
    writeFileSync(actual, JSON.stringify({ version: 1, blockedUntilAt: until }));
    symlinkSync(actual, file);
    expect(readRoutesetRefusalCooldown()).toBeNull();
    expect(JSON.parse(readFileSync(actual, "utf8")).blockedUntilAt).toBe(until);
  });

  it("does not request an HTTP-forbidden provider again after in-process state resets", async () => {
    stateFile();
    const until = new Date(Date.now() + 60 * 60_000).toISOString();
    expect(saveRoutesetRefusalCooldown(until)).toBe(true);
    const registry = globalThis as typeof globalThis & { airRadarRoutesetRuntime?: unknown };
    const previous = registry.airRadarRoutesetRuntime;
    const fetchMock = vi.fn();
    try {
      delete registry.airRadarRoutesetRuntime;
      vi.stubGlobal("fetch", fetchMock);
      const provider = new AdsbLolRouteProvider();
      await expect(provider.getRoute("UAE139", new Date(), { lat: 49.2, lon: 17.7 })).rejects.toThrow("retry suspended");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(getAdsbLolRoutesetRuntimeDiagnostics().blockedUntilAt).toBe(until);
    } finally {
      registry.airRadarRoutesetRuntime = previous;
    }
  });
});
