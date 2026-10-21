import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { AircraftProvider as LegacyAircraftProvider } from "@/lib/server/provider";
import type { AircraftProvider as PublicAircraftProvider } from "@/lib/ports/aircraft-provider";
import type { HistoryResponse as LegacyHistoryResponse, AircraftQuickDetailResponse as LegacyQuickDetail } from "@/lib/server/history";
import type { HistoryResponse, AircraftQuickDetailResponse } from "@/lib/contracts/history";
import { WEATHER_RADAR_BOUNDS as legacyBounds } from "@/lib/server/weather-radar/types";
import { WEATHER_RADAR_BOUNDS as publicBounds } from "@/lib/contracts/weather-radar";

const script = fileURLToPath(new URL("../scripts/v2-architecture-graph.mjs", import.meta.url));
const temporaryDirectories: string[] = [];

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), "airradar-v2-boundary-"));
  temporaryDirectories.push(root);
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  return root;
}

function scan(files: Record<string, string>, options: string[] = []) {
  const root = fixture(files);
  const response = spawnSync(process.execPath, [script, "--root=" + root, "--json", ...options], {
    cwd: path.dirname(script),
    encoding: "utf8",
    timeout: 15_000,
  });
  expect(response.error).toBeUndefined();
  return { status: response.status, report: JSON.parse(response.stdout), stderr: response.stderr };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("V2-01 compatibility contracts", () => {
  it("reuses the exact CHMI public bounds object", () => {
    expect(legacyBounds).toBe(publicBounds);
    expect(Object.keys(publicBounds).sort()).toEqual(["east", "north", "south", "west"]);
  });

  it("preserves the legacy DTO/port type contracts", () => {
    const history: HistoryResponse = { source: "memory", flight: null, positions: [] };
    const oldHistory: LegacyHistoryResponse = history;
    const quick: AircraftQuickDetailResponse = { aircraft: null };
    const oldQuick: LegacyQuickDetail = quick;
    const port: PublicAircraftProvider = { name: "fixture", getSnapshot: async () => { throw new Error("fixture-only"); } };
    const legacyPort: LegacyAircraftProvider = port;
    expect(oldHistory).toEqual(history);
    expect(oldQuick).toEqual(quick);
    expect(legacyPort.name).toBe("fixture");
  });
});

describe("V2-01 dependency graph gate", () => {
  it("accepts layered imports and excludes type-only client dependencies from the runtime graph", () => {
    const result = scan({
      "lib/contracts/public.ts": "export interface PublicDto { id: string }",
      "lib/ports/receiver.ts": 'import type { PublicDto } from "../contracts/public"; export interface Receiver { get(): Promise<PublicDto> }',
      "lib/server/impl.ts": 'import type { Receiver } from "../ports/receiver"; export const value = 1;',
      "components/radar.tsx": '"use client"; import type { Receiver } from "../lib/ports/receiver"; export const Radar = () => null;',
    }, ["--check", "--strict"]);
    expect(result.status).toBe(0);
    expect(result.report.metrics.newLayerViolations).toBe(0);
    expect(result.report.metrics.serverModulesInClientRuntimeGraph).toBe(0);
    expect(result.report.metrics.cycles).toBe(0);
  });

  it("rejects ports importing concrete server implementations", () => {
    const result = scan({
      "lib/ports/receiver.ts": 'import type { Internal } from "../server/impl"; export type Exposed = Internal;',
      "lib/server/impl.ts": "export type Internal = { x: string };",
    }, ["--check"]);
    expect(result.status).toBe(1);
    expect(result.report.forbiddenContracts).toHaveLength(1);
  });

  it("rejects server-to-client runtime imports", () => {
    const result = scan({
      "components/radar.tsx": '"use client"; export const Radar = () => null;',
      "lib/server/impl.ts": 'import { Radar } from "../../components/radar"; export { Radar };',
    }, ["--check"]);
    expect(result.status).toBe(1);
    expect(result.report.serverToClient).toHaveLength(1);
  });

  it("detects protected runtime cycles", () => {
    const result = scan({
      "lib/contracts/a.ts": 'import { b } from "./b"; export const a = b;',
      "lib/contracts/b.ts": 'import { a } from "./a"; export const b = a;',
    }, ["--check"]);
    expect(result.status).toBe(1);
    expect(result.report.metrics.cycles).toBe(1);
  });

  it("finds a browser-reachable server module without mistaking type imports for runtime", () => {
    const result = scan({
      "components/radar.tsx": '"use client"; import { value } from "../lib/server/impl"; export const x = value;',
      "lib/server/impl.ts": "export const value = 1;",
    }, ["--strict"]);
    expect(result.status).toBe(1);
    expect(result.report.serverInClientGraph).toContain("lib/server/impl.ts");
  });
});
