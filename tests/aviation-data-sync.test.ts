import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

type AviationDataJob = readonly [label: string, script: string, args: readonly string[]];
// @ts-expect-error The operational sync orchestrator is intentionally a plain Node script.
const { AVIATION_DATA_JOBS } = await import("../scripts/aviation-data-sync.mjs") as { AVIATION_DATA_JOBS: readonly AviationDataJob[] };

describe("aviation data sync orchestration", () => {
  it("runs only the retained ATC importers", () => {
    expect(AVIATION_DATA_JOBS.map(([label]) => label)).toEqual(["ATC CZ", "ATC SK", "ATC AT"]);
    expect(AVIATION_DATA_JOBS.every(([, script]) => existsSync(script))).toBe(true);
    expect(AVIATION_DATA_JOBS.some(([, script]) => script.includes("procedures-sync"))).toBe(false);
  });
});
