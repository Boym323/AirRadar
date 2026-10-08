import { describe, expect, it } from "vitest";
import { buildAirportContextD4 } from "@/lib/airport-intelligence/airport-context-d4";
import type { AirportRunwayChangeEvidenceD2 } from "@/lib/airport-intelligence/runway-change-evidence-d2";
import type { AirportArrivalFlowIntelligence } from "@/lib/airport-intelligence/arrival-flow-v8";
import type { ApproachEvidenceD3 } from "@/lib/airport-intelligence/approach-evidence-d3";

const runway = {
  state: "OBSERVED_TRANSITION", windAlignment: "DIFFERENT",
} as AirportRunwayChangeEvidenceD2;
const arrival = {compression: {state: "HIGH"}} as AirportArrivalFlowIntelligence;
const approach = {counts: {goAround: 1, holding: 0}, complete: false} as ApproachEvidenceD3;

describe("D4 airport context", () => {
  it("keeps observations, PUBLIC predictions and wind context separate", () => {
    expect(buildAirportContextD4({runway, arrival, approach, windAvailable: true})).toMatchObject({
      signals: [
        "RUNWAY_TRANSITION_OBSERVED", "WIND_DIFFERS",
        "HOLDING_OR_GO_AROUND_OBSERVED", "ARRIVAL_COMPRESSION_PREDICTED",
        "PARTIAL_RECEIVER_HISTORY",
      ],
      source: {atc: "NOT_CORRELATED", prediction: "PUBLIC_ONLY"},
      limitation: "NO_ATC_CLEARANCE_EVIDENCE",
    });
  });
  it("does not claim available wind or correlated ATC when sources are missing", () => {
    const got = buildAirportContextD4({
      runway: {...runway, state: "UNKNOWN", windAlignment: "UNKNOWN"},
      arrival: {...arrival, compression: {...arrival.compression, state: "UNKNOWN"}},
      approach: {...approach, counts: {...approach.counts, goAround: 0}, complete: true},
      windAvailable: false,
    });
    expect(got.signals).toEqual(["WIND_UNAVAILABLE"]);
    expect(got.source.atc).toBe("NOT_CORRELATED");
    expect(got.source.wind).toBe("UNAVAILABLE");
  });
});
