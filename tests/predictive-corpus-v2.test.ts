import { describe, expect, it } from "vitest";
import { selectStableHashSample, splitCorpus } from "@/lib/predictive-intelligence/calibration";

describe("predictive corpus V2", () => {
  it("selects the same flights independent of input/database id order", () => {
    const flights = [1, 2, 3, 4, 5, 6, 7, 8].map((flightId) => ({ flightId }));
    const expected = selectStableHashSample(flights, 4, "predictive-intelligence-v2").map((flight) => flight.flightId);
    expect(selectStableHashSample([...flights].reverse(), 4, "predictive-intelligence-v2").map((flight) => flight.flightId)).toEqual(expected);
    expect(expected).not.toEqual([1, 2, 3, 4]);
  });

  it("keeps the V2 calibration and holdout partitions disjoint", () => {
    const flights = Array.from({ length: 100 }, (_, index) => ({ flightId: index + 1 }));
    const split = splitCorpus(flights, "predictive-intelligence-v2");
    const holdout = new Set(split.holdout.map((flight) => flight.flightId));
    expect(split.calibration.filter((flight) => holdout.has(flight.flightId))).toHaveLength(0);
  });
});
