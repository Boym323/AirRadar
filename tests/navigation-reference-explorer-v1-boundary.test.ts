import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../app/navigation/page.tsx", import.meta.url), "utf8");
const explorer = readFileSync(new URL("../components/navigation-reference-explorer.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../app/api/navigation/data/route.ts", import.meta.url), "utf8");
const atsApi = readFileSync(new URL("../app/api/ats/routes/route.ts", import.meta.url), "utf8");

describe("Navigation Reference Explorer V1 boundary", () => {
  it("owns a dedicated navigation page and reuses existing APIs", () => {
    expect(page).toContain("<NavigationReferenceExplorer />");
    expect(explorer).toContain("/api/navigation/data?ids=");
    expect(explorer).toContain("/api/ats/routes");
    expect(explorer).not.toContain("/api/navigation/reference");
  });

  it("keeps all navigation lookups bounded", () => {
    expect(explorer).toContain("radiusNm=25");
    expect(explorer).toContain("MAX_NEARBY = 12");
    expect(explorer).toContain("MAX_ROUTES = 24");
    expect(api).toContain("parsed.slice(0, 24)");
  });

  it("deep-links to the canonical radar navPoint focus without new persistence", () => {
    expect(explorer).toContain("query: { navPoint: focus }");
    expect(explorer).toContain('point.source');
    expect(explorer).not.toContain("FlightPosition");
    expect(atsApi).toContain("Cache-Control");
  });
});
