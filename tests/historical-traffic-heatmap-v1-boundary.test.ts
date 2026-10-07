import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../app/heatmap/page.tsx", import.meta.url), "utf8");
const heatmap = readFileSync(new URL("../components/statistics-heatmap.tsx", import.meta.url), "utf8");
const server = readFileSync(new URL("../lib/server/statistics-heatmap.ts", import.meta.url), "utf8");

describe("Historical Traffic Heatmap V1 boundary", () => {
  it("promotes the existing heatmap product at /heatmap", () => {
    expect(page).toContain("<StatisticsHeatmap />");
    expect(heatmap).toContain("/api/statistics/heatmap?range=");
    expect(heatmap).not.toContain("getPrisma");
    expect(heatmap).not.toContain("/api/heatmap");
  });

  it("keeps the existing today, 7d and 30d bounded ranges", () => {
    for (const range of ["today", "7d", "30d"]) {
      expect(heatmap).toContain('"' + range + '"');
    }
  });

  it("discloses the coarse sampled-grid contract instead of inventing unsupported filters", () => {
    expect(server).toContain("const GRID_SIZE = 28");
    expect(server).toContain("const POSITION_LIMIT = 60_000");
    expect(heatmap).toContain("cellCenter");
    expect(heatmap).toContain("mostActive");
    expect(heatmap).not.toContain("minAltitude");
    expect(heatmap).not.toContain("source=LOCAL");
  });
});
