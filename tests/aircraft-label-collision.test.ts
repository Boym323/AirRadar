import { describe, expect, it } from "vitest";
import {
  aircraftLabelPlacements,
  aircraftLabelPriorityRank,
  layoutAircraftLabels,
  screenRectsIntersect,
} from "@/lib/radar/aircraft-label-collision";

describe("aircraft label collision policy", () => {
  it("orders selected, emergency, watchlist, and normal labels explicitly", () => {
    expect(aircraftLabelPriorityRank("selected")).toBeLessThan(aircraftLabelPriorityRank("emergency"));
    expect(aircraftLabelPriorityRank("emergency")).toBeLessThan(aircraftLabelPriorityRank("watchlisted"));
    expect(aircraftLabelPriorityRank("watchlisted")).toBeLessThan(aircraftLabelPriorityRank("normal"));
    expect(aircraftLabelPlacements("selected")).toEqual(["right", "left", "top", "bottom"]);
    expect(aircraftLabelPlacements("normal")).toEqual(["bottom", "right", "left", "top"]);
  });

  it("places higher priority labels first and hides a colliding normal label", () => {
    const result = layoutAircraftLabels([
      { id: "normal", point: { x: 100, y: 100 }, width: 40, height: 14, priority: "normal", placements: ["right"] },
      { id: "selected", point: { x: 100, y: 100 }, width: 40, height: 14, priority: "selected", forceVisible: true, placements: ["right"] },
    ]);
    expect(result.placements.has("selected")).toBe(true);
    expect(result.hidden.has("normal")).toBe(true);
  });

  it("never hides selected or emergency labels when every candidate is occupied", () => {
    const occupied = [{ x: 0, y: 0, width: 500, height: 500 }];
    const result = layoutAircraftLabels([
      { id: "selected", point: { x: 100, y: 100 }, width: 40, height: 14, priority: "selected" },
      { id: "emergency", point: { x: 200, y: 200 }, width: 40, height: 14, priority: "emergency" },
    ], occupied);
    expect(result.hidden.has("selected")).toBe(false);
    expect(result.hidden.has("emergency")).toBe(false);
    expect(result.placements.has("selected")).toBe(true);
    expect(result.placements.has("emergency")).toBe(true);
  });

  it("detects collisions across spatial grid boundaries", () => {
    const result = layoutAircraftLabels([
      { id: "first", point: { x: 70, y: 80 }, width: 30, height: 14, priority: "watchlisted", placements: ["right"] },
      { id: "second", point: { x: 72, y: 80 }, width: 30, height: 14, priority: "normal", placements: ["right"] },
    ]);
    expect(result.placements.has("first")).toBe(true);
    expect(result.hidden.has("second")).toBe(true);
  });

  it("keeps dense non-overlapping label placement bounded and complete", () => {
    const items = Array.from({ length: 250 }, (_, index) => ({
      id: `aircraft-${String(index).padStart(3, "0")}`,
      point: { x: (index % 25) * 140, y: Math.floor(index / 25) * 90 },
      width: 42,
      height: 14,
      priority: "normal" as const,
      placements: ["right"] as const,
    }));
    const result = layoutAircraftLabels(items);
    expect(result.hidden.size).toBe(0);
    expect(result.placements.size).toBe(250);
  });

  it("keeps rectangle intersection deterministic", () => {
    expect(screenRectsIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 9, y: 9, width: 10, height: 10 })).toBe(true);
    expect(screenRectsIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 10, height: 10 })).toBe(false);
  });
});
