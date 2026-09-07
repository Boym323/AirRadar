import { describe, expect, it } from "vitest";
import { compareAtcSectorIds, determineAtcDatasetStatus } from "@/lib/atc/status";

function status(databaseEffectiveDate: string | null, expected: string[], stored: string[]) {
  return determineAtcDatasetStatus({
    databaseAvailable: true,
    databaseEffectiveDate,
    currentEffectiveDate: "2026-09-03",
    comparison: compareAtcSectorIds(expected, stored),
  });
}

describe("ATC dataset status", () => {
  it("is current only when the effective date and valid sector ID set match", () => {
    expect(status("2026-09-03", ["ACC-A", "TMA-B"], ["TMA-B", "ACC-A"])).toBe("current");
  });

  it("reports a missing sector as incomplete even when the effective date matches", () => {
    expect(status("2026-09-03", ["ACC-A", "TMA-B"], ["ACC-A"])).toBe("incomplete");
  });

  it("reports an extra sector as incomplete even when the effective date matches", () => {
    expect(status("2026-09-03", ["ACC-A"], ["ACC-A", "OLD"])).toBe("incomplete");
  });

  it("reports a changed effective date as an available update", () => {
    expect(status("2026-08-20", ["ACC-A"], ["ACC-A"])).toBe("update available");
  });

  it("reports an empty database as not imported", () => {
    expect(status(null, ["ACC-A"], [])).toBe("not imported");
  });

  it("keeps comparison deterministic and ignores duplicate IDs", () => {
    expect(compareAtcSectorIds([" TMA-B", "ACC-A", "ACC-A"], ["OLD", "TMA-B", "TMA-B"])).toEqual({
      expectedIds: ["ACC-A", "TMA-B"],
      storedIds: ["OLD", "TMA-B"],
      matchingIds: ["TMA-B"],
      missingIds: ["ACC-A"],
      extraIds: ["OLD"],
    });
  });

  it("does not use transmitter availability as sector completeness", () => {
    expect(status("2026-09-03", ["ACC-A"], ["ACC-A"])).toBe("current");
  });

  it("reports an unavailable database without changing comparison semantics", () => {
    const comparison = compareAtcSectorIds(["ACC-A"], ["ACC-A"]);
    expect(determineAtcDatasetStatus({
      databaseAvailable: false,
      databaseEffectiveDate: "2026-09-03",
      currentEffectiveDate: "2026-09-03",
      comparison,
    })).toBe("unavailable");
  });
});
