import { describe, expect, it } from "vitest";
import { aircraftIconNeedsInitialMetadata, aircraftPresentationKindForType, classifyAircraftIcon } from "@/lib/aircraft/icon-classification";
import { aircraftIconSizeAtZoom, aircraftIconSizeForPresentation, aircraftIconZoomScale } from "@/lib/aircraft/icon-size";

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
    expect(aircraftIconSizeForPresentation("ground")).toBe(13);
    expect(aircraftIconSizeForPresentation("general-aviation")).toBe(17);
    expect(aircraftIconSizeForPresentation("a320")).toBe(18);
    expect(aircraftIconSizeForPresentation("a330")).toBe(20);
    expect(aircraftIconSizeForPresentation("a380")).toBe(22);
    expect(aircraftIconSizeForPresentation("a380")).toBeGreaterThan(aircraftIconSizeForPresentation("a320"));
  });

  it.each([
    ["a220", 18], ["a320", 18], ["a330", 20], ["a350", 20], ["a380", 22],
    ["b717", 18], ["b727", 18], ["b737", 18], ["b747", 20], ["b757", 18],
    ["b767", 20], ["b777", 20], ["b787", 20], ["regional", 18], ["turboprop", 18],
    ["business-jet", 18], ["general-aviation", 17], ["helicopter", 17], ["glider", 19],
    ["drone", 15], ["ground", 13],
  ] as const)("keeps HTML and WebGL visual size parity for %s", (kind, expected) => {
    expect(aircraftIconSizeForPresentation(kind)).toBe(expected);
  });

  it("uses a restrained continuous zoom scale without changing the hit target", () => {
    expect(aircraftIconZoomScale(5)).toBe(0.9);
    expect(aircraftIconZoomScale(6)).toBe(0.9);
    expect(aircraftIconZoomScale(7.5)).toBeCloseTo(0.95, 5);
    expect(aircraftIconZoomScale(9)).toBe(1);
    expect(aircraftIconZoomScale(12)).toBe(1);
    expect(aircraftIconSizeAtZoom(18, 6)).toBe(16.2);
    expect(aircraftIconSizeAtZoom(18, 7.5)).toBe(17.1);
    expect(aircraftIconSizeAtZoom(18, 9)).toBe(18);
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
