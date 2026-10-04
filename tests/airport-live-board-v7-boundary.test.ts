import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const controllerSource = readFileSync(new URL("../components/airport-operations-controller.ts", import.meta.url), "utf8");
const detailSource = readFileSync(new URL("../components/airport-detail.tsx", import.meta.url), "utf8");
const boardSource = readFileSync(new URL("../components/airport-operations-board.tsx", import.meta.url), "utf8");
const modelSource = readFileSync(new URL("../lib/airport-intelligence/arrival-sequence-v7.ts", import.meta.url), "utf8");

describe("Airport Live Board V7 boundary", () => {
  it("uses one bounded batch prediction endpoint on the existing 30-second refresh cycle", () => {
    expect(controllerSource).toContain("/api/operations/predictive?hexes=");
    expect(controllerSource).toContain(".slice(0, 6)");
    expect(controllerSource.match(/fetch\(/g)).toHaveLength(3);
    expect(controllerSource.match(/setTimeout\(/g)).toHaveLength(1);
    expect(controllerSource).not.toContain("EventSource");
    expect(detailSource).toContain("useAirportOperationsController(airport.icaoCode, predictiveHexes)");
  });

  it("copies only PUBLIC advisory fields and drops admin previews", () => {
    expect(controllerSource).toContain("etaAdvisory: item.etaAdvisory");
    expect(controllerSource).toContain("runwayAdvisory: item.runwayAdvisory");
    expect(controllerSource).not.toContain("etaAdminPreview");
    expect(controllerSource).not.toContain("runwayAdminPreview");
    expect(modelSource).toContain("prediction?.etaAdvisory");
    expect(modelSource).toContain("prediction?.runwayAdvisory");
  });

  it("requires confirmed route evidence or PUBLIC prediction destination match", () => {
    expect(modelSource).toContain("predictionMatchesAirport");
    expect(modelSource).toContain("routeConfirmed");
    expect(modelSource).toContain("if (!routeConfirmed && !predictionMatchesAirport) return []");
    expect(modelSource).toContain('journey.routeRelation !== "CONFLICT"');
  });

  it("keeps the board pure and marks the product surface as V7", () => {
    expect(boardSource).not.toContain("fetch(");
    expect(boardSource).not.toContain("new EventSource");
    expect(boardSource).toContain('data-product="airport-live-board-v7"');
    expect(boardSource).toContain('data-testid="airport-live-board-v7-arrival-sequence"');
    expect(boardSource).toContain("arrivalSequence.runway");
  });
});
