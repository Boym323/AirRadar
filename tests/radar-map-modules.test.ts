import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseAirportDataset, parseAtcDataset, parseAtsDataset, parseJsonDataset,
} from "@/lib/radar/dataset-validation";

const read = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

describe("radar map modules", () => {
  it("always mounts the Layers menu inside the radar HUD without requiring a selection", () => {
    const source = read("components/airradar-app.tsx");
    const hudStart = source.indexOf("<RadarMapHud");
    const layers = source.indexOf("<RadarMapLayerMenu", hudStart);
    const hudEnd = source.indexOf("</RadarMapHud>", hudStart);
    expect(hudStart).toBeGreaterThan(0);
    expect(layers).toBeGreaterThan(hudStart);
    expect(hudEnd).toBeGreaterThan(layers);
    expect(source.slice(hudStart, layers)).not.toContain("selectedAircraft &&");
  });

  it("keeps a responsive wrapping HUD and a real unselected browser hit-test", () => {
    const css = read("app/globals.css");
    const start = css.indexOf("/* Layout V4:");
    const canonical = css.slice(start, css.indexOf(".map-overlay-context-row {", start));
    expect(canonical).toContain("display: flex;");
    expect(canonical).toContain("flex-wrap: wrap;");
    expect(canonical).not.toContain("grid-template-columns:");
    const gate = read("scripts/production-gates.mjs");
    expect(gate).toContain("Unselected radar Map Layers toggle is clipped or covered");
    expect(gate).toContain("document.elementFromPoint(x, y)");
  });

  it("validates optional map data and rejects malformed provider payloads", async () => {
    expect(parseAirportDataset([{ icaoCode: "LKPR", name: "Praha", latitude: 50, longitude: 14 }])).toBe(true);
    expect(parseAirportDataset([{ icaoCode: "LKPR", name: "Praha", latitude: Number.NaN, longitude: 14 }])).toBe(false);
    expect(parseAtcDataset({ sectors: [], transmitters: [], metadata: {} })).toBe(true);
    expect(parseAtcDataset({ sectors: null, transmitters: [], metadata: {} })).toBe(false);
    expect(parseAtsDataset({ available: false })).toBe(true);
    expect(parseAtsDataset({ available: "yes" })).toBe(false);
    const good = { json: async () => ({ available: true }) } as Response;
    await expect(parseJsonDataset(good, parseAtsDataset)).resolves.toEqual({ available: true });
    const invalid = { json: async () => ({ available: "yes" }) } as Response;
    await expect(parseJsonDataset(invalid, parseAtsDataset)).rejects.toThrow(SyntaxError);
  });
});
