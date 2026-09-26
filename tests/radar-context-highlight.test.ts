import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("radar ATC/ATS context highlight wiring", () => {
  const source = readFileSync(new URL("../components/airradar-app.tsx", import.meta.url), "utf8");

  it("binds the selected primary airspace and medium/high ATS route to the map highlight filters", () => {
    expect(source).toContain('map.setFilter("atc-sectors-context-highlight", ["==", ["get", "id"], airspaceId])');
    expect(source).toContain('map.setFilter("ats-route-context-highlight", ["==", ["get", "segmentId"], segmentId])');
    expect(source).toContain('route.confidence === "high" || route.confidence === "medium"');
    expect(source).toContain('selectedAtcContext.primaryAirspace?.id ?? "__context-none__"');
  });

  it("hides both highlights when their selected context is unavailable", () => {
    expect(source).toContain('showAtc && airspaceId !== "__context-none__" ? "visible" : "none"');
    expect(source).toContain('showAtsRoutes && segmentId !== "__context-none__" ? "visible" : "none"');
  });
});
