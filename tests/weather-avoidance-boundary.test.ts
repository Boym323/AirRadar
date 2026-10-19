import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Weather Avoidance Intelligence V1 boundaries", () => {
  it("reuses existing selected-aircraft situation data and adds no stream or persistence path", async () => {
    const selectedContext = await readFile("components/radar/use-radar-aircraft-context.ts", "utf8");
    const engine = await readFile("lib/weather/avoidance-intelligence.ts", "utf8");
    const aircraftState = await readFile("lib/server/aircraft-state.ts", "utf8");

    expect(selectedContext).toContain("/situation");
    expect(selectedContext).toContain("60_000");
    expect(selectedContext).not.toContain("EventSource(`/api/aircraft/${encodeURIComponent(aircraftHex)}/situation");
    expect(engine).toContain("CURRENT_30MIN_CORRIDOR_CLEAR");
    expect(engine).toContain("TRAJECTORY_DEVIATING");
    expect(aircraftState).not.toContain("weather-avoidance-intelligence");
  });

  it("keeps crew intent explicitly outside the product contract", async () => {
    const cs = await readFile("lib/i18n/cs.ts", "utf8");
    const en = await readFile("lib/i18n/en.ts", "utf8");
    const ui = await readFile("components/aircraft-radar-quick-detail.tsx", "utf8");

    expect(cs).toContain("Neurčuje úmysl posádky");
    expect(en).toContain("does not infer crew intent");
    expect(ui).toContain('data-testid="weather-avoidance-intelligence-v1"');
  });
});
