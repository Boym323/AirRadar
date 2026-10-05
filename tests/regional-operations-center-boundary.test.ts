import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const componentSource = readFileSync(
  new URL("../components/radar/radar-operations-center.tsx", import.meta.url),
  "utf8",
);
const routeSource = readFileSync(
  new URL("../app/api/operations/situation/route.ts", import.meta.url),
  "utf8",
);
const airradarAppSource = readFileSync(
  new URL("../components/airradar-app.tsx", import.meta.url),
  "utf8",
);
const regionalUiSource = readFileSync(
  new URL("../lib/operational-twin/regional-attention-ui.ts", import.meta.url),
  "utf8",
);

describe("Regional Operations Center V1 boundary", () => {
  it("polls the existing bounded regional situation endpoint only while the panel is open", () => {
    expect(componentSource).toContain('fetchJson<RegionalOperationsResponse>("/api/operations/situation"');
    expect(componentSource).toContain("REGIONAL_REFRESH_INTERVAL_MS = 30_000");
    expect(componentSource).not.toContain('new EventSource("/api/operations/situation');
  });

  it("keeps regional intelligence on one existing local snapshot", () => {
    expect(routeSource.match(/getSnapshot\(/g)).toHaveLength(1);
    expect(routeSource).toContain('coverage: "local"');
    expect(routeSource).toContain("includeTrails: false");
    expect(routeSource).toContain("buildRegionalSituationGraph");
    expect(routeSource).toContain("buildOperationalAttention");
  });

  it("keeps the UI contextual rather than safety-warning language", () => {
    expect(componentSource).toContain('data-testid="regional-operations-center"');
    expect(componentSource).toContain('item.level === "ATTENTION"');
    expect(componentSource).not.toMatch(/collision warning|separation alert/i);
  });

  it("focuses affected aircraft through the existing radar query contract", () => {
    expect(componentSource).toContain('/?operations=1&aircraft=');
  });

  it("graduation-gates map highlighting without changing safety semantics", () => {
    expect(routeSource).toContain("getRegionalAttentionGraduationReport");
    expect(routeSource).toContain("graduated: graduation.decision === \"PASS\" && graduation.manualPromotionEligible");
    expect(componentSource).toContain("regionalAttentionHorizonForOffset");
    expect(componentSource).toContain("operationsRegionalMapLocked");
    expect(componentSource).not.toContain("item.evidence.map");
    expect(regionalUiSource).toContain("contextOnly: true");
    expect(airradarAppSource).toContain("REGIONAL_ATTENTION_MAP_FOCUS_EVENT");
    expect(airradarAppSource).toContain("REGIONAL_ATTENTION_MAP_LINE_LAYER_ID");
    expect(airradarAppSource).toContain("createRegionalAttentionMapFocusGeoJSON");
    expect(airradarAppSource).not.toMatch(/collision alert|separation alert/i);
  });

});
