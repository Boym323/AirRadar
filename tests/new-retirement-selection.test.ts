import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../", import.meta.url);
const decisions = JSON.parse(readFileSync(new URL("docs/audits/ADDITIONAL-RETIREMENTS-2026-10-21.json", root), "utf8")) as {
  removedFromKeep: string[];
  revisedTotals: { keep: number; remove: number };
};

describe("additional user-authorized removals (PR #1096)", () => {
  it("records all nine new REMOVE selections without rewriting original inventory", () => {
    expect(decisions.removedFromKeep).toEqual(["R16", "S08", "S05", "W07", "U06", "U07", "O14", "S07", "W04"]);
    expect(decisions.revisedTotals).toEqual({ keep: 79, remove: 99 });
    const original = JSON.parse(readFileSync(new URL("docs/audits/SELECTED-FEATURE-MATRIX-2026-10-19.json", root), "utf8")) as { keepIds: string[]; removeIds: string[] };
    expect(original.keepIds).toHaveLength(88);
    expect(original.removeIds).toHaveLength(90);
    expect(decisions.removedFromKeep.every((id) => original.keepIds.includes(id))).toBe(true);
  });

  it("prevents obsolete historical heatmap, recap and pilot report endpoints from returning", () => {
    for (const path of [
      "lib/i18n/statistics-heatmap.ts",
      "app/api/statistics/heatmap/route.ts",
      "app/api/statistics/traffic-profile/route.ts",
      "app/api/recap/daily/route.ts",
      "app/api/recap/weekly/route.ts",
      "app/api/weather/pirep/route.ts",
    ]) expect(existsSync(new URL(path, root)), path).toBe(false);
    for (const path of [
      "app/api/statistics/route.ts",
      "app/api/weather/radar/frames/route.ts",
      "app/api/weather/sigmet/route.ts",
      "components/airradar-app.tsx",
    ]) expect(existsSync(new URL(path, root)), path).toBe(true);
  });
});
