import { describe, expect, it } from "vitest";
import { aircraftDurableValues, changedAircraftValues } from "@/lib/server/aircraft-update-policy";

function item(overrides: Record<string, unknown> = {}) {
  const metadata = (overrides.enrichment as { metadata?: Record<string, unknown> } | undefined)?.metadata;
  return {
    icaoHex: "ABCDEF",
    registration: "OK-ABC",
    aircraftType: "A320",
    ...overrides,
    enrichment: { metadata: {
      registration: "OK-ABC",
      registrationCountry: "Czechia",
      registrationCountryCode: "cz",
      icaoTypeCode: "A320",
      manufacturer: "Airbus",
      aircraftDescription: "A320-200",
      operator: "Test Air",
      ...metadata,
    } },
  } as never;
}

describe("Aircraft durable update planning", () => {
  it("skips an unchanged Aircraft", () => {
    const values = aircraftDurableValues(item());
    expect(changedAircraftValues(values, values)).toEqual({});
  });

  it.each([
    ["registration", { registration: "OK-NEW" }],
    ["aircraft type", { aircraftType: "B738" }],
    ["manufacturer", { enrichment: { metadata: { manufacturer: "Boeing" } } }],
    ["model", { enrichment: { metadata: { aircraftDescription: "737-800" } } }],
    ["operator", { enrichment: { metadata: { operator: "Other Air" } } }],
  ])("persists one %s change", (_name, overrides) => {
    const current = aircraftDurableValues(item());
    const next = aircraftDurableValues(item(overrides));
    expect(Object.keys(changedAircraftValues(current, next))).toHaveLength(1);
  });

  it("persists null to known enrichment", () => {
    const current = aircraftDurableValues(item({ registration: null, aircraftType: null, enrichment: { metadata: { registration: null, icaoTypeCode: null } } }));
    const next = aircraftDurableValues(item());
    expect(changedAircraftValues(current, next)).toMatchObject({ registration: "OK-ABC", aircraftType: "A320" });
  });

  it("normalizes equivalent durable values and avoids false changes", () => {
    const current = aircraftDurableValues(item());
    const equivalent = aircraftDurableValues(item({
      registration: " ok-abc ",
      aircraftType: " a320 ",
      enrichment: { metadata: { registrationCountryCode: " CZ " } },
    }));
    expect(changedAircraftValues(current, equivalent)).toEqual({});
  });

  it("retains metadata through source fallback without A-null-A flapping", () => {
    const withLiveRegistration = aircraftDurableValues(item());
    const fallbackRegistration = aircraftDurableValues(item({ registration: null }));
    expect(fallbackRegistration.registration).toBe(withLiveRegistration.registration);
    expect(changedAircraftValues(withLiveRegistration, fallbackRegistration)).toEqual({});
  });

  it("uses enrichment fallback when a live field is blank", () => {
    const values = aircraftDurableValues(item({ registration: "  ", aircraftType: "  " }));
    expect(values.registration).toBe("OK-ABC");
    expect(values.aircraftType).toBe("A320");
  });

  it("creates a complete durable value set for a new Aircraft", () => {
    expect(aircraftDurableValues(item())).toEqual({
      registration: "OK-ABC",
      registrationCountry: "Czechia",
      registrationCountryCode: "CZ",
      aircraftType: "A320",
      manufacturer: "Airbus",
      model: "A320-200",
      operator: "Test Air",
    });
  });
});
