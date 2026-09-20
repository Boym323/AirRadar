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
  it.each(["MI8", "MI17", "R22", "R44", "R66", "S76", "S92", "A139", "B412", "H60"])("recognizes rotorcraft %s", aircraftType => {
    expect(classifyAircraftIcon({ ...base, aircraftType }).kind).toBe("helicopter");
    expect(classifyAircraftIcon({ ...base, aircraftType }).asset).not.toMatch(/unknown/);
  });
  it.each(["A320", "B738"])("keeps fixed-wing %s on ground as airplane", aircraftType => {
    const result = classifyAircraftIcon({ ...base, aircraftType, onGround: true });
    expect(result.kind).toBe("airplane");
    expect(result.asset).not.toMatch(/ground-square/);
  });
  it("keeps rotorcraft, glider and drone classes when on ground", () => {
    expect(classifyAircraftIcon({ ...base, aircraftType: "R44", onGround: true }).kind).toBe("helicopter");
    expect(classifyAircraftIcon({ ...base, category: "B1", onGround: true }).kind).toBe("glider");
    expect(classifyAircraftIcon({ ...base, category: "B6", onGround: true }).kind).toBe("drone");
  });
  it("does not infer ground vehicle from onGround alone", () => {
    const result = classifyAircraftIcon({ ...base, onGround: true });
    expect(result.kind).toBe("airplane");
    expect(result.reason).toBe("unknown aircraft type");
  });
  it.each(["B1", "B6", "C0", "C1", "C2", "C3"])("preserves category %s semantics", category => {
    const kind = classifyAircraftIcon({ ...base, category }).kind;
    expect(kind).toBe(category === "B1" ? "glider" : category === "B6" ? "drone" : "ground");
  });
});
