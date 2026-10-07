import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../app/airspace/sectors/[id]/page.tsx", import.meta.url), "utf8");
const detail = readFileSync(new URL("../components/atc-sector-detail.tsx", import.meta.url), "utf8");
const historyApi = readFileSync(new URL("../app/api/atc/sectors/[id]/history/route.ts", import.meta.url), "utf8");
const transitionApi = readFileSync(new URL("../app/api/atc/sectors/transitions/route.ts", import.meta.url), "utf8");

describe("ATC Sector Detail V1 boundary", () => {
  it("owns a dedicated sector route and reuses existing traffic APIs", () => {
    expect(page).toContain("<AtcSectorDetail sectorId=");
    expect(detail).toContain("/traffic");
    expect(detail).toContain("/history?");
    expect(detail).toContain("/api/atc/sectors/transitions?window=15m");
  });

  it("keeps history and rendered datasets bounded", () => {
    expect(detail).toContain('HISTORY_RANGES: HistoryHours[] = [1, 6, 24]');
    expect(detail).toContain("bucket=5m");
    expect(detail).toContain("MAX_HISTORY_POINTS = 48");
    expect(detail).toContain("MAX_TRANSITIONS = 16");
    expect(historyApi).toContain('["1m", "5m", "15m", "1h"]');
    expect(transitionApi).toContain("1m, 5m or 15m");
  });

  it("adds no direct history persistence access in the UI", () => {
    expect(detail).not.toContain("getPrisma");
    expect(detail).not.toContain("db.orm");
    expect(detail).not.toContain("/api/history/flights");
    expect(detail).toContain("traffic.source");
  });
});
