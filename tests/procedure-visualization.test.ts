import { describe, expect, it } from "vitest";
import { createProcedureGeoJSON } from "@/lib/procedure-visualization";
import type { Procedure } from "@/lib/route-intelligence/contracts";

const procedure: Procedure = {
  id: "LKPR:SID:TACLO:", airportIcao: "LKPR", designator: "TACLO", type: "SID", transition: null,
  runwayApplicability: { kind: "ALL", runwayDesignators: [] }, discontinuities: [],
  source: { countryCode: "CZ", provider: "test", reference: "AD 2.22", effectiveDate: null, airacCycle: null, amendment: null, retrievedAt: null },
  legs: [{ sequence: 1, type: "TRACK", from: { id: "RW24", name: "RWY24", kind: "RUNWAY", coordinates: { lat: 50, lon: 14 }, sourceReference: null }, to: { id: "TACLO", name: "TACLO", kind: "FIX", coordinates: { lat: 50.1, lon: 14.2 }, sourceReference: null }, geometry: null, courseDeg: 240, sourceReference: null }],
};

describe("procedure map visualization", () => {
  it("converts ordered leg endpoints to a LineString with safe metadata", () => {
    const result = createProcedureGeoJSON([procedure], "SID");
    expect(result.features).toHaveLength(1);
    expect(result.features[0]).toMatchObject({ properties: { airport: "LKPR", designator: "TACLO", type: "SID" }, geometry: { type: "LineString", coordinates: [[14, 50], [14.2, 50.1]] } });
  });

  it("omits discontinuities and incomplete legs", () => {
    expect(createProcedureGeoJSON([{ ...procedure, legs: [{ ...procedure.legs[0], type: "DISCONTINUITY", to: null }] }], "SID").features).toHaveLength(0);
  });
});
