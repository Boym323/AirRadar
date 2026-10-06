import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../app/airspace/page.tsx", import.meta.url), "utf8");
const explorer = readFileSync(new URL("../components/atc-airspace-explorer.tsx", import.meta.url), "utf8");

describe("ATC & Airspace Explorer V1 boundary", () => {
  it("owns /airspace as a thin UI over existing public boundaries", () => {
    expect(page).toContain("<AtcAirspaceExplorer />");
    for (const endpoint of [
      "/api/airspace/activity",
      "/api/atc/sectors/traffic",
      "/api/atc/sectors/transitions",
      "/api/atc/sectors/",
    ]) {
      expect(explorer).toContain(endpoint);
    }
    expect(explorer).not.toContain("getPrisma");
    expect(explorer).not.toContain("/api/airspace/explorer");
  });

  it("keeps planned allocation explicitly separate from confirmed activation", () => {
    expect(explorer).toContain("plannedNow");
    expect(explorer).toContain("historicalActual");
    expect(explorer).toContain("Planned allocation is not confirmed real-time activation.");
  });

  it("uses bounded transition and history windows", () => {
    expect(explorer).toContain("([1, 5, 15] as const)");
    expect(explorer).toContain("60 * 60_000");
    expect(explorer).toContain("bucket=5m");
  });
});
