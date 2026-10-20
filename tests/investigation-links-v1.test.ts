import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildNavigationIntegrityInvestigation,
  parseNavigationIntegrityInvestigation,
} from "@/lib/investigation-links";

describe("Navigation Integrity investigation links", () => {
  it("round-trips the retained Navigation Integrity view state", () => {
    const state = parseNavigationIntegrityInvestigation("?window=30m&source=LOCAL&minAltitude=10000&maxAltitude=29999&severity=DEGRADED&confidence=HIGH&type=SOURCE_ARTIFACT&history=7d");
    expect(state).toMatchObject({ window: "30m", source: "LOCAL", minAltitude: "10000", maxAltitude: "29999", severity: "DEGRADED", confidence: "HIGH", category: "SOURCE_ARTIFACT", history: "7d" });
    expect(parseNavigationIntegrityInvestigation("?" + buildNavigationIntegrityInvestigation(state))).toEqual(state);
  });

  it("rejects malformed query parameters and inverted altitude bounds", () => {
    expect(parseNavigationIntegrityInvestigation("?window=forever&source=OTHER&minAltitude=-1&maxAltitude=999999&severity=CRITICAL&type=BOGUS")).toEqual({
      window: "15m", source: "ALL", minAltitude: "", maxAltitude: "", severity: "ALL", confidence: "ALL", category: "ALL", history: "24h",
    });
    expect(parseNavigationIntegrityInvestigation("?minAltitude=30000&maxAltitude=10000")).toMatchObject({ minAltitude: "", maxAltitude: "" });
  });

  it("keeps browser back/forward state without new server persistence", () => {
    const integrity = readFileSync(new URL("../components/navigation-integrity-center.tsx", import.meta.url), "utf8");
    const helper = readFileSync(new URL("../lib/investigation-links.ts", import.meta.url), "utf8");
    expect(integrity).toContain('addEventListener("popstate"');
    expect(integrity).toContain("window.history.pushState");
    expect(integrity).toContain("window.history.replaceState");
    expect(integrity).not.toContain("localStorage");
    expect(helper).not.toContain("fetch(");
    expect(helper).not.toContain("localStorage");
    expect(helper).not.toContain("prisma");
  });
});
