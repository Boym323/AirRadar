import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../app/procedures/page.tsx", import.meta.url), "utf8");
const explorer = readFileSync(new URL("../components/procedure-explorer.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../app/api/procedures/route.ts", import.meta.url), "utf8");

describe("Procedure Explorer V1 boundary", () => {
  it("owns a dedicated procedure page and reuses the existing procedure API", () => {
    expect(page).toContain("<ProcedureExplorer />");
    expect(explorer).toContain("/api/procedures?");
    expect(explorer).not.toContain("/api/procedures/explorer");
  });

  it("keeps server and UI result sets bounded", () => {
    expect(api).toContain("MAX_RESULTS = 200");
    expect(explorer).toContain("MAX_RENDERED_PROCEDURES = 60");
    expect(explorer).toContain("MAX_RENDERED_LEGS = 24");
  });

  it("preserves published procedure semantics without flight-history scans", () => {
    expect(explorer).toContain("runwayApplicability");
    expect(explorer).toContain("procedure.source");
    expect(explorer).toContain("navPoint=");
    expect(explorer).not.toContain("FlightPosition");
  });
});
