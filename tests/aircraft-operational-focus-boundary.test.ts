import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const focusSource = readFileSync(new URL("../lib/operational-twin/aircraft-operational-focus.ts", import.meta.url), "utf8");
const serverSource = readFileSync(new URL("../lib/server/operational-twin.ts", import.meta.url), "utf8");

describe("Aircraft Operational Focus V1 boundary", () => {
  it("is a pure bounded projection over already-computed situation evidence", () => {
    expect(focusSource).not.toContain("fetch(");
    expect(focusSource).not.toContain("getPrisma");
    expect(focusSource).not.toContain("process.env");
    expect(focusSource).not.toContain("setInterval");
    expect(focusSource).not.toContain("setTimeout");
    expect(focusSource).toContain("AIRCRAFT_OPERATIONAL_FOCUS_MAX_ITEMS = 8");
  });

  it("is assembled inside the existing Operational Digital Twin request", () => {
    expect(serverSource).toContain("buildAircraftOperationalFocus");
    expect(serverSource).toContain("operationalFocus");
    expect(serverSource).toContain("weatherCorridor");
    expect(serverSource).toContain("navigationIntegrityCorridor");
  });
});
