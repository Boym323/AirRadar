import { describe, expect, it } from "vitest";
import { buildAirportRunwayChangeEvidenceD2 } from "@/lib/airport-intelligence/runway-change-evidence-d2";
import type { AirportRunwayFlowIntelligence } from "@/lib/airport-intelligence/v3";
import type { AirportArrivalFlowIntelligence } from "@/lib/airport-intelligence/arrival-flow-v8";

function inputs(): [AirportRunwayFlowIntelligence, AirportArrivalFlowIntelligence] {
  const lane = (runway: string) => ({
    runway, share: .8, samples: 5, reportedSamples: 2, inferredSamples: 3,
    arrivals: {runway, share: .8, samples: 3},
    departures: {runway, share: .8, samples: 2},
  });
  const observed: AirportRunwayFlowIntelligence = {
    windowMinutes: 15, state: "TRANSITIONING", previous: lane("11"), current: lane("29"),
    transition: {from: "11", to: "29"}, windFavoredRunway: "29", windAlignment: "ALIGNED",
  };
  const arrival = {
    runwayAlignment: {
      state: "ALIGNED", predictedRunway: "29", predictedSamples: 3, predictedShare: .8,
      observedRunway: "29", observedSamples: 5, observedShare: .8,
    },
  } as AirportArrivalFlowIntelligence;
  return [observed, arrival];
}

describe("D2 runway evidence", () => {
  it("accepts only independently supported observed window transitions", () => {
    const [observed, arrival] = inputs();
    expect(buildAirportRunwayChangeEvidenceD2(observed, arrival)).toMatchObject({
      state: "OBSERVED_TRANSITION", reason: "OBSERVED_WINDOW_CHANGE",
      previousRunway: "11", observedRunway: "29", observedSamples: 5,
    });
  });
  it("does not claim a change for low-count or contradictory windows", () => {
    const [observed, arrival] = inputs();
    observed.current.samples = 2;
    expect(buildAirportRunwayChangeEvidenceD2(observed, arrival).state).toBe("UNKNOWN");
    observed.current.samples = 5;
    observed.transition = {from: "11", to: "11"};
    expect(buildAirportRunwayChangeEvidenceD2(observed, arrival).state).toBe("UNKNOWN");
  });
  it("keeps prediction divergence distinct from observed changes", () => {
    const [observed, arrival] = inputs();
    observed.state = "STABLE";
    observed.previous = { ...observed.current };
    observed.transition = null;
    arrival.runwayAlignment.predictedRunway = "11";
    expect(buildAirportRunwayChangeEvidenceD2(observed, arrival).state).toBe("PREDICTED_DIVERGENCE");
    arrival.runwayAlignment.predictedSamples = 1;
    expect(buildAirportRunwayChangeEvidenceD2(observed, arrival).state).toBe("OBSERVED_STABLE");
  });
  it("never uses wind as transition proof", () => {
    const [observed, arrival] = inputs();
    observed.state = "INSUFFICIENT";
    observed.transition = null;
    observed.windFavoredRunway = "11";
    expect(buildAirportRunwayChangeEvidenceD2(observed, arrival).state).toBe("UNKNOWN");
  });
});
