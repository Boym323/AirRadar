import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");
const revised = JSON.parse(read("docs/audits/SELECTED-FEATURE-REVISED-2026-10-21.json")) as {
  newlyRemovedIds: string[]; keepIds: string[]; removeIds: string[];
};

describe("revised selected-feature retirement", () => {
  it("records all nine new REMOVE choices without changing the original baseline", () => {
    expect(new Set(revised.newlyRemovedIds)).toEqual(new Set(["R16","S08","S05","W07","U06","U07","O14","S07","W04"]));
    expect(revised.keepIds).toHaveLength(79);
    expect(revised.removeIds).toHaveLength(99);
    expect(revised.newlyRemovedIds.every(id => revised.removeIds.includes(id) && !revised.keepIds.includes(id))).toBe(true);
  });

  it("retains weather radar but no Echo Top product and no retired standalone APIs", () => {
    const radar = read("lib/server/weather-radar/types.ts");
    expect(radar).toContain('"MAX_Z_MASKED"');
    expect(radar).toContain('"PSEUDOCAPPI_2KM"');
    expect(radar).not.toMatch(/ECHO_?TOP|EchoTop|echoTop/);
    for (const path of ["app/api/weather/pirep/route.ts","app/api/statistics/heatmap/route.ts","app/api/statistics/traffic-profile/route.ts","lib/server/pirep-provider.ts","components/radar/radar-presentation-controls.tsx","lib/investigation-links.ts","scripts/code-metrics.mjs",".github/workflows/repository-metadata.yml"])
      expect(existsSync(new URL(path, root)), path).toBe(false);
    expect(existsSync(new URL("app/api/logbook/summary/route.ts", root))).toBe(true);
    expect(read("app/api/logbook/summary/route.ts")).toContain("getLogbookSummary");
  });

  it("preserves required receiver coverage and installation surfaces", () => {
    expect(existsSync(new URL("lib/server/receiver-coverage-analytics.ts", root))).toBe(true);
    expect(existsSync(new URL("scripts/features-registry.mjs", root))).toBe(true);
    expect(existsSync(new URL("components/pwa-register.tsx", root))).toBe(true);
    expect(read("components/receiver-coverage-page.tsx")).not.toContain('data-testid="receiver-explorer-records"');
  });
});
