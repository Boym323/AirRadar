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
      "scripts/changelog.mjs",
      "tests/changelog-v2.test.mjs",
      "tests/changelog-release-history.test.ts",
      "lib/radar/presets.ts",
      "components/radar/radar-preset-menu.tsx",
      "components/radar/radar-preset-menu.module.css",
      "app/api/statistics/heatmap/route.ts",
      "app/api/statistics/traffic-profile/route.ts",
      "app/api/recap/daily/route.ts",
      "app/api/recap/weekly/route.ts",
      "app/api/reception-records/route.ts",
      "lib/server/reception-records.ts",
      "tests/reception-records.test.ts",
      "app/api/weather/pirep/route.ts",
    ]) expect(existsSync(new URL(path, root)), path).toBe(false);
    const radar = readFileSync(new URL("components/airradar-app.tsx", root), "utf8");
    expect(radar).not.toContain("RadarPresetMenu");
    expect(radar).not.toContain("createRadarPreset");
    const logbook = readFileSync(new URL("lib/server/logbook-summary.ts", root), "utf8");
    expect(logbook).not.toContain("todayReceptionRecord");
    expect(logbook).not.toContain("getReceptionRecords");
    const statistics = readFileSync(new URL("lib/server/statistics.ts", root), "utf8");
    expect(statistics).not.toContain("maxDistanceIcaoHex");
    expect(statistics).not.toContain("maxDistanceRegistration");
    const en = readFileSync(new URL("lib/i18n/en.ts", root), "utf8");
    const cs = readFileSync(new URL("lib/i18n/cs.ts", root), "utf8");
    for (const locale of [en, cs]) {
      expect(locale).not.toContain("  recap: {");
      expect(locale).not.toContain("    pirepTitle:");
      expect(locale).not.toContain("    receptionRecordsLegacyNote:");
    }
    for (const path of [
      "app/api/statistics/route.ts",
      "app/api/weather/radar/frames/route.ts",
      "app/api/weather/sigmet/route.ts",
      "components/airradar-app.tsx",
    ]) expect(existsSync(new URL(path, root)), path).toBe(true);
  });
});
