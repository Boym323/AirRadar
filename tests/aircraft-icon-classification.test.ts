import { describe, expect, it } from "vitest";
import { classifyAircraftIcon } from "@/lib/aircraft/icon-classification";

const base = { aircraftType: null, aircraftDescription: null, enrichment: undefined, category: null, onGround: false };

describe("canonical aircraft icon classification", () => {
  it("classifies Mi-17 metadata as helicopter without callsign", () => {
    const result = classifyAircraftIcon({ ...base, enrichment: { metadata: { registration: null, registrationCountry: null, registrationCountryCode: null, aircraftType: "Mi-17", icaoTypeCode: "MI8", aircraftDescription: "MIL Mi-8/17" } } });
    expect(result.kind).toBe("helicopter");
    expect(result.asset).toMatch(/category-A7|MI24/);
  });
  it("gives trusted A7 priority over an airplane-looking type", () => {
    expect(classifyAircraftIcon({ ...base, category: "A7", aircraftType: "A320" }).kind).toBe("helicopter");
  });
  it.each(["B1", "B6", "C0", "C1", "C2", "C3"])("preserves category %s semantics", category => {
    const kind = classifyAircraftIcon({ ...base, category }).kind;
    expect(kind).toBe(category === "B1" ? "glider" : category === "B6" ? "drone" : "ground");
  });
});
