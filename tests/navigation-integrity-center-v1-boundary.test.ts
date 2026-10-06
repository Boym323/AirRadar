import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../app/navigation-integrity/page.tsx", import.meta.url), "utf8");
const center = readFileSync(new URL("../components/navigation-integrity-center.tsx", import.meta.url), "utf8");

describe("Navigation Integrity Center V1 boundary", () => {
  it("owns /navigation-integrity as a thin UI over existing integrity APIs", () => {
    expect(page).toContain("<NavigationIntegrityCenter />");
    expect(center).toContain("/api/navigation-integrity/current");
    expect(center).toContain("/api/navigation-integrity/history");
    expect(center).not.toContain("getPrisma");
    expect(center).not.toContain("/api/navigation-integrity/center");
  });

  it("uses the existing bounded current filters", () => {
    for (const window of ["5m", "15m", "30m", "60m"]) {
      expect(center).toContain('"' + window + '"');
    }
    expect(center).toContain('params.set("source", source)');
    expect(center).toContain('params.set("minAltitude", minAltitude)');
    expect(center).toContain('params.set("maxAltitude", maxAltitude)');
  });

  it("keeps history bounded to the existing 30 day API contract", () => {
    expect(center).toContain('"24h"');
    expect(center).toContain('"7d"');
    expect(center).toContain('"30d"');
    expect(center).toContain("auditCategories");
    expect(center).toContain("200");
  });
});
