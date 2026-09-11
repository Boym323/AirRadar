import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CZ_EAIP_ENR32_URL,
  CzAtsRouteParseError,
  parseCzEaipEnr32Routes,
  validateCzAtsRouteDocument,
} from "@/lib/ats/cz-eaip-routes";

const fixture = readFileSync(new URL("./fixtures/cz-eaip-enr32.html", import.meta.url), "utf8");
const publicationFixture = readFileSync(new URL("./fixtures/cz-gen02.html", import.meta.url), "utf8");

describe("Czech eAIP ENR 3.2 ATS route parser", () => {
  it("parses route geometry and published segment metadata", () => {
    const document = parseCzEaipEnr32Routes(fixture, {
      publicationHtml: publicationFixture,
      lastVerifiedAt: "2026-09-10T20:00:00.000Z",
    });
    const route = document.routes.find((candidate) => candidate.designator === "L156");
    expect(route).toBeDefined();
    expect(route?.segments).toHaveLength(1);
    expect(route?.segments[0]).toMatchObject({
      sourceId: "1734",
      fromName: "UPLAV",
      toName: "OGDAS",
      navigationSpecification: "RNAV 5",
      magTrackForwardDeg: 33,
      magTrackReverseDeg: 213,
      distanceNm: 28.8,
      upperLimit: "FL95",
      lowerLimit: "4000 FT AMSL",
      cruisingLevelForward: "ODD",
      cruisingLevelReverse: "EVEN",
      availabilityClass: null,
      availabilityStatus: "UNKNOWN",
    });
    expect(route?.segments[0].geometricDistanceNm).toBeCloseTo(28.715, 2);
    expect(document.source.reference).toBe(CZ_EAIP_ENR32_URL);
    expect(document.source.effectiveDate).toBe("2026-09-03");
  });

  it("keeps navaids as stable route points", () => {
    const document = parseCzEaipEnr32Routes(fixture);
    const route = document.routes.find((candidate) => candidate.designator === "L726");
    expect(route?.points.find((point) => point.name === "BNO")).toMatchObject({
      id: "NAV:1294",
      kind: "NAVAID",
    });
    expect(route?.segments[0]).toMatchObject({ fromName: "UPLAV", toName: "BNO", distanceNm: 34.5 });
  });

  it("preserves airway discontinuations instead of inventing a connecting segment", () => {
    const document = parseCzEaipEnr32Routes(fixture);
    const route = document.routes.find((candidate) => candidate.designator === "P733");
    expect(route?.segments.map((segment) => `${segment.fromName}->${segment.toName}`)).toEqual([
      "AGNAV->LOMKI",
      "ARTUP->TOMTI",
    ]);
    expect(route?.discontinuities).toEqual([{ afterPointId: "DP:4359", beforePointId: "DP:4284" }]);
    expect(route?.points.find((point) => point.name === "TOMTI")).toMatchObject({
      foreignMaintainer: "PL",
      remarks: "For continuation see AIP POLAND",
    });
  });

  it("identifies decimal-formatted distance cells by their eAIP annotation", () => {
    const document = parseCzEaipEnr32Routes(fixture);
    const route = document.routes.find((candidate) => candidate.designator === "T709");
    expect(route?.segments[0]).toMatchObject({
      sourceId: "1800",
      fromName: "VOZ",
      toName: "USUPA",
      distanceNm: 10,
      cruisingLevelForward: "ODD",
      cruisingLevelReverse: "EVEN",
    });
    expect(route?.segments[0].geometricDistanceNm).toBeCloseTo(9.928, 2);
    expect(route?.points.find((point) => point.name === "USUPA")).toMatchObject({
      id: "DP:4444",
      kind: "DESIGNATED_POINT",
    });
  });

  it("parses CDR metadata but keeps runtime availability unknown", () => {
    const document = parseCzEaipEnr32Routes(fixture);
    const route = document.routes.find((candidate) => candidate.designator === "T709");
    const cdrSegment = route?.segments.find((segment) => segment.sourceId === "1757");
    expect(cdrSegment).toMatchObject({
      fromName: "BODAL",
      toName: "TIBLA",
      availabilityClass: "CDR1",
      availabilityStatus: "UNKNOWN",
    });
    expect(cdrSegment?.remarks).toContain("PERM ALTN route");
    expect(document.routes.map((candidate) => candidate.designator)).toEqual(["L156", "L726", "P733", "T709"]);
    expect(document.counts).toMatchObject({ routes: 4, segments: 7, cdrSegments: 1, discontinuities: 1 });
  });

  it("ignores structured route references embedded in a segment remark", () => {
    const document = parseCzEaipEnr32Routes(fixture);
    expect(document.routes.filter((candidate) => candidate.designator === "L156")).toHaveLength(1);
    expect(document.routes.filter((candidate) => candidate.designator === "L726")).toHaveLength(1);
  });

  it("rejects an effective-date mismatch with the publication record", () => {
    const mismatchedPublication = publicationFixture.replace("3 SEP 2026", "4 SEP 2026");
    expect(() => parseCzEaipEnr32Routes(fixture, { publicationHtml: mismatchedPublication })).toThrow(CzAtsRouteParseError);
  });

  it("rejects malformed persisted documents", () => {
    expect(() => validateCzAtsRouteDocument({
      schemaVersion: 1,
      source: { reference: CZ_EAIP_ENR32_URL, effectiveDate: "2026-09-03", lastVerifiedAt: "invalid" },
      routes: [],
      counts: {},
    })).toThrow(CzAtsRouteParseError);
  });
});
