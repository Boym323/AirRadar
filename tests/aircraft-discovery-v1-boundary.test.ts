import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../components/aircraft-discovery.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/discover/page.tsx", import.meta.url), "utf8");
const logbookApi = readFileSync(new URL("../app/api/logbook/summary/route.ts", import.meta.url), "utf8");
const logbookServer = readFileSync(new URL("../lib/server/logbook-summary.ts", import.meta.url), "utf8");

describe("Aircraft Discovery V1 boundary", () => {
  it("owns /discover as a thin product layer over Logbook Summary", () => {
    expect(route).toContain("<AircraftDiscovery />");
    expect(page).toContain('fetch("/api/logbook/summary"');
    expect(page).not.toContain("getPrisma");
    expect(page).not.toContain("/api/history/");
  });

  it("reuses bounded existing logbook evidence", () => {
    expect(logbookApi).toContain("getLogbookSummary");
    expect(logbookServer).toContain(".slice(0, 8)");
    expect(logbookServer).toContain("todayReceptionRecord");
    expect(logbookServer).toContain("lifetimeReceptionRecord");
  });

  it("offers discovery filters and watchlist handoff without new persistence", () => {
    expect(page).toContain('"all" | "live" | "new" | "rare" | "returning"');
    expect(page).toContain('pathname: "/watchlist"');
    expect(page).toContain("icaoHex: item.icaoHex");
    expect(page).not.toContain("localStorage");
  });
});
