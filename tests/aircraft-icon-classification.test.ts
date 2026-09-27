import { describe, expect, it } from "vitest";
import { aircraftIconNeedsInitialMetadata, aircraftPresentationKindForType, classifyAircraftIcon } from "@/lib/aircraft/icon-classification";
import { aircraftIconSizeForPresentation } from "@/lib/aircraft/icon-size";

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
  it.each([
    ["BCS3", "a220"],
    ["A320", "a320"],
    ["A333", "a330"],
    ["A359", "a350"],
    ["A388", "a380"],
    ["B712", "b717"],
    ["B722", "b727"],
    ["B738", "b737"],
    ["B748", "b747"],
    ["B752", "b757"],
    ["B763", "b767"],
    ["B77W", "b777"],
    ["B789", "b787"],
  ] as const)("classifies %s into presentation kind %s", (type, expected) => {
    expect(aircraftPresentationKindForType(type)).toBe(expected);
  });

  it("scales silhouette size by aircraft visual mass without changing hit targets", () => {
    expect(aircraftIconSizeForPresentation("ground")).toBe(14);
    expect(aircraftIconSizeForPresentation("general-aviation")).toBe(18);
    expect(aircraftIconSizeForPresentation("a320")).toBe(20);
    expect(aircraftIconSizeForPresentation("a330")).toBe(22);
    expect(aircraftIconSizeForPresentation("a380")).toBe(24);
    expect(aircraftIconSizeForPresentation("a380")).toBeGreaterThan(aircraftIconSizeForPresentation("a320"));
  });

  it.each([
    ["a220", 20], ["a320", 20], ["a330", 22], ["a350", 22], ["a380", 24],
    ["b717", 19], ["b727", 20], ["b737", 20], ["b747", 22], ["b757", 20],
    ["b767", 22], ["b777", 22], ["b787", 22], ["regional", 19], ["turboprop", 19],
    ["business-jet", 19], ["general-aviation", 18], ["helicopter", 18], ["glider", 21],
    ["drone", 16], ["ground", 14],
  ] as const)("keeps HTML and WebGL visual size parity for %s", (kind, expected) => {
    expect(aircraftIconSizeForPresentation(kind)).toBe(expected);
  });

  it("keeps a live observed type ahead of later enrichment metadata", () => {
    const result = classifyAircraftIcon({
      ...base,
      aircraftType: "B738",
      enrichment: {
        metadata: {
          registration: null,
          registrationCountry: null,
          registrationCountryCode: null,
          aircraftType: "A320",
          icaoTypeCode: "A320",
          aircraftDescription: "Airbus A320",
        },
      },
    });
    expect(result.asset).toBe("/aircraft-icons-tar1090/B738.svg");
    expect(result.presentationKind).toBe("b737");
  });

  it("requests initial metadata only when the first icon identity is unresolved", () => {
    expect(aircraftIconNeedsInitialMetadata(base)).toBe(true);
    expect(aircraftIconNeedsInitialMetadata({ ...base, aircraftType: "A320" })).toBe(false);
    expect(aircraftIconNeedsInitialMetadata({ ...base, category: "A7" })).toBe(false);
    expect(aircraftIconNeedsInitialMetadata({ ...base, category: "C1" })).toBe(false);
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
