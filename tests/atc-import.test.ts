import { describe, expect, it } from "vitest";
import {
  AtcImportValidationError,
  planAtcImport,
  validateAtcImportDocument,
} from "@/lib/atc/import-format";

const validDocument = {
  schemaVersion: 1,
  source: {
    name: "Test authority publication",
    reference: "https://example.invalid/test-atc-publication",
    effectiveDate: "2026-09-01",
    lastVerifiedAt: "2026-09-01T12:00:00Z",
  },
  sectors: [{
    id: "TEST-APP",
    name: "Test Approach",
    service: "APP",
    polygons: [[[14, 50], [15, 50], [15, 51], [14, 51]]],
    lowerAltitude: "SFC",
    upperAltitude: "FL245",
    primaryFrequencyMhz: 118.005,
    alternateFrequencies: [{ frequencyMhz: 119.175, label: "Alternate" }],
    validFrom: null as string | null,
    validTo: null as string | null,
  }],
  transmitters: [{ id: "TEST-TX", name: "Test transmitter", latitude: 50.1, longitude: 14.4, frequencyMhz: 118.005 }],
};

describe("ATC import format", () => {
  it("normalizes altitude semantics and preserves aviation frequency precision", () => {
    const result = validateAtcImportDocument(validDocument);
    expect(result.sectors[0]).toMatchObject({ lowerAltitudeFt: 0, upperAltitudeFt: 24500, primaryFrequencyMhz: 118.005, sourceReference: validDocument.source.reference });
    expect(result.sectors[0].alternateFrequencies[0].frequencyMhz).toBe(119.175);
    expect(result.sectors[0].validFrom).toBe("2026-09-01T00:00:00.000Z");
  });

  it("retains AGL/flight-level references", () => {
    const document = structuredClone(validDocument) as typeof validDocument;
    document.sectors[0].lowerAltitude = "1000 AGL";
    document.sectors[0].upperAltitude = "FL125";
    const result = validateAtcImportDocument(document);
    expect(result.sectors[0]).toMatchObject({ lowerAltitudeFt: 1000, lowerAltitudeReference: "AGL", upperAltitudeFt: 12500, upperAltitudeReference: "FL" });
  });

  it("rejects UHF alternates", () => {
    const document = structuredClone(validDocument) as typeof validDocument;
    document.sectors[0].alternateFrequencies = [{ frequencyMhz: 378.75, label: "Reserve" }];
    expect(() => validateAtcImportDocument(document)).toThrow(/between 118\.000 and 136\.975 MHz/);
  });

  it("rejects navigation frequencies below ATC VHF and accepts the upper channel limit", () => {
    const navigation = structuredClone(validDocument) as typeof validDocument;
    navigation.sectors[0].primaryFrequencyMhz = 117.975;
    expect(() => validateAtcImportDocument(navigation)).toThrow(/between 118\.000 and 136\.975 MHz/);

    const upperLimit = structuredClone(validDocument) as typeof validDocument;
    upperLimit.sectors[0].primaryFrequencyMhz = 136.975;
    expect(validateAtcImportDocument(upperLimit).sectors[0].primaryFrequencyMhz).toBe(136.975);
  });

  it("rejects invalid coordinates, frequencies, polygons and ranges before writing", () => {
    const invalid = structuredClone(validDocument) as typeof validDocument;
    invalid.sectors[0].polygons = [[[181, 50], [15, 50]]];
    invalid.sectors[0].primaryFrequencyMhz = 99.9999;
    invalid.sectors[0].validFrom = "2026-10-01";
    invalid.sectors[0].validTo = "2026-09-01";
    expect(() => validateAtcImportDocument(invalid)).toThrow(AtcImportValidationError);
    expect(() => validateAtcImportDocument(invalid)).toThrow(/longitude|frequency|three coordinates|validFrom/);
  });

  it("rejects duplicate stable keys", () => {
    const duplicate = structuredClone(validDocument) as typeof validDocument;
    duplicate.sectors.push({ ...duplicate.sectors[0] });
    expect(() => validateAtcImportDocument(duplicate)).toThrow(/duplicate stable id TEST-APP/);
  });

  it("reports added then unchanged rows on an idempotent second import", () => {
    const dataset = validateAtcImportDocument(validDocument);
    const existing = {
      sectors: [{
        id: "TEST-APP",
        name: "Test Approach",
        polygonJson: JSON.stringify(dataset.sectors[0].polygons),
        lowerAltitudeFt: 0,
        upperAltitudeFt: 24500,
        lowerAltitudeReference: "SFC",
        upperAltitudeReference: "FL",
        atcCallsign: null,
        service: "APP",
        primaryFrequencyMhz: 118.005,
        alternateFrequenciesJson: JSON.stringify(dataset.sectors[0].alternateFrequencies),
        country: null,
        source: dataset.source.name,
        sourceReference: dataset.source.reference,
        validFrom: dataset.sectors[0].validFrom,
        validTo: null,
        lastVerifiedAt: dataset.source.lastVerifiedAt,
      }],
      transmitters: [],
    };
    const firstPlan = planAtcImport(dataset, { sectors: [], transmitters: [] });
    const secondPlan = planAtcImport(dataset, existing);
    expect(firstPlan.sectors.added).toEqual(["TEST-APP"]);
    expect(secondPlan.sectors.unchanged).toEqual(["TEST-APP"]);
    expect(secondPlan.sectors.updated).toEqual([]);
  });

  it("reports missing rows from the same source as obsolete without touching another source", () => {
    const dataset = validateAtcImportDocument({ ...validDocument, sectors: [], transmitters: [] });
    const plan = planAtcImport(dataset, {
      sectors: [
        { id: "OLD", name: "Old", polygonJson: "[]", lowerAltitudeFt: null, upperAltitudeFt: null, atcCallsign: null, service: null, primaryFrequencyMhz: null, alternateFrequenciesJson: null, country: null, source: dataset.source.name, sourceReference: dataset.source.reference, validFrom: null, validTo: null, lastVerifiedAt: dataset.source.lastVerifiedAt },
        { id: "OTHER", name: "Other", polygonJson: "[]", lowerAltitudeFt: null, upperAltitudeFt: null, atcCallsign: null, service: null, primaryFrequencyMhz: null, alternateFrequenciesJson: null, country: null, source: "Other source", sourceReference: "other://source", validFrom: null, validTo: null, lastVerifiedAt: dataset.source.lastVerifiedAt },
      ],
      transmitters: [],
    });
    expect(plan.sectors.obsolete).toEqual(["OLD"]);
  });
});
