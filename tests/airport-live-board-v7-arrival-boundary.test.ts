import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const controllerSource = readFileSync(new URL("../components/airport-operations-controller.ts", import.meta.url), "utf8");
const detailSource = readFileSync(new URL("../components/airport-detail.tsx", import.meta.url), "utf8");
const boardSource = readFileSync(new URL("../components/airport-operations-board.tsx", import.meta.url), "utf8");
const modelSource = readFileSync(new URL("../lib/airport-intelligence/arrival-sequence-v7.ts", import.meta.url), "utf8");

describe("Airport Live Board V7 arrival sequence boundary", () => {
  it("uses one bounded batch prediction request on the existing airport refresh cycle", () => {
    expect(controllerSource).toContain("/api/operations/predictive?hexes=");
    expect(controllerSource).toContain(".slice(0, 6)");
    expect(controllerSource.match(/fetch\(/g)).toHaveLength(3);
    expect(controllerSource.match(/setTimeout\(/g)).toHaveLength(1);
    expect(controllerSource).not.toContain("EventSource");
    expect(detailSource).toContain("useAirportOperationsController(airport.icaoCode, predictiveHexes)");
  });

  it("copies only PUBLIC advisory fields and never admin previews", () => {
    expect(controllerSource).toContain("etaAdvisory: item.etaAdvisory");
    expect(controllerSource).toContain("runwayAdvisory: item.runwayAdvisory");
    expect(controllerSource).not.toContain("etaAdminPreview");
    expect(controllerSource).not.toContain("runwayAdminPreview");
    expect(modelSource).toContain("prediction?.etaAdvisory");
    expect(modelSource).toContain("prediction?.runwayAdvisory");
  });

  it("keeps route and destination gating conservative", () => {
    expect(modelSource).toContain("routeConfirmed");
    expect(modelSource).toContain("predictedDestination");
    expect(modelSource).toContain("if (!routeConfirmed && (!airport || predictedDestination !== airport)) return []");
    expect(modelSource).toContain('routeRelation === "CONFLICT"');
  });

  it("keeps the board free of direct requests and preserves runway-stability V7", () => {
    expect(boardSource).not.toContain("fetch(");
    expect(boardSource).not.toContain("new EventSource");
    expect(boardSource).toContain('data-testid="airport-live-board-v7-runway-flow"');
    expect(boardSource).toContain('data-testid="airport-live-board-v7-arrival-sequence"');
    expect(boardSource).toContain("buildAirportRunwayFlowIntelligence");
    expect(boardSource).toContain("buildAirportArrivalSequence");
  });
});
