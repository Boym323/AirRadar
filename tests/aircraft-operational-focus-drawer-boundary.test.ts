import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

describe("Rejected Operational Focus drawer", () => {
  it("does not render focus changes or access the retired selected-aircraft situation", () => {
    const context = read("components/radar/use-radar-aircraft-context.ts");
    const detail = read("components/aircraft-radar-quick-detail.tsx");
    expect(context).not.toContain("/situation");
    expect(detail).not.toContain("RadarOperationalFocusSummary");
    expect(detail).not.toContain("operationalFocusChanges");
  });

  it("preserves current ATC and Navigation Integrity rather than forecasts", () => {
    const detail = read("components/aircraft-radar-quick-detail.tsx");
    expect(detail).toContain("<AtcSection");
    expect(detail).toContain("<NavigationIntegritySection");
  });
});
