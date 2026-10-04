import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const controllerSource = readFileSync(new URL("../components/airport-operations-controller.ts", import.meta.url), "utf8");
const boardSource = readFileSync(new URL("../components/airport-operations-board.tsx", import.meta.url), "utf8");
const detailSource = readFileSync(new URL("../components/airport-detail.tsx", import.meta.url), "utf8");
const modelSource = readFileSync(new URL("../lib/airport-intelligence/arrival-sequence-v7.ts", import.meta.url), "utf8");

describe("Airport Live Board V7 boundary", () => {
  it("uses one bounded batch prediction endpoint and no extra SSE stream", () => {
    expect(controllerSource).toContain("/api/operations/predictive?hexes=");
    expect(controllerSource).toContain(".slice(0, 6)");
    expect(controllerSource).toContain("predictiveKey");
    expect(controllerSource).not.toContain("EventSource");
    expect(detailSource).toContain("useAirportOperationsController(airport.icaoCode, predictiveHexes)");
  });

  it("copies only PUBLIC advisory fields and drops admin previews", () => {
    expect(controllerSource).toContain("etaAdvisory: item.etaAdvisory");
    expect(controllerSource).toContain("runwayAdvisory: item.runwayAdvisory");
    expect(controllerSource).not.toContain("etaAdminPreview");
    expect(controllerSource).not.toContain("runwayAdminPreview");
  });

  it("requires prediction destination to match the board airport", () => {
    expect(modelSource).toContain("predictedDestination");
    expect(modelSource).toContain("predictedDestination !== airport");
    expect(modelSource).toContain('journey.routeRelation === "CONFLICT"');
  });

  it("marks the product surface as V7", () => {
    expect(boardSource).toContain('data-product="airport-live-board-v7"');
    expect(boardSource).toContain('data-testid="airport-live-board-v7-arrival-sequence"');
  });
});
