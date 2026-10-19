import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const hook = readFileSync(new URL("../components/radar/use-radar-aircraft-context.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../components/airradar-app.tsx", import.meta.url), "utf8");

describe("selected aircraft context hook", () => {
  it("keeps selected-aircraft context requests and their polling in one owner", () => {
    for (const endpoint of ["/context`,", "/route-weather`,", "/situation`,", "/api/intelligence/events?"]) {
      expect(hook).toContain(endpoint);
    }
    expect(hook).toContain("30_000");
    expect(hook).toContain("120_000");
    expect(hook).toContain("60_000");
    expect(hook).toContain("controller?.abort()");
    expect(app).toContain("useRadarAircraftContext({ aircraftHex: contextAircraftHex, hasPosition: contextHasPosition })");
    expect(app).not.toContain("/route-weather`");
  });
});
