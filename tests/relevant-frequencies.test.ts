import { describe, expect, it } from "vitest";
import type { AtcFrequencySummary } from "@/lib/atc/types";
import { displayedRelevantAtcFrequencies, MAX_DISPLAYED_RELEVANT_ATC_FREQUENCIES, relevantAtcFrequencyKey } from "@/lib/atc/relevant-frequencies";

function summary(frequencyMhz: number): AtcFrequencySummary {
  return {
    frequencyMhz,
    service: "ACC",
    callsign: "PRAHA RADAR",
    airspaceType: null,
    sector: "Praha",
    aircraftCount: 1,
    confidence: { level: "high", positionInside: 1, positionBoundary: 0, altitudeMatched: 1, altitudeUnknown: 0 },
    source: "AIP ČR",
    aircraftLabels: ["TEST123"],
    additionalAircraftCount: 0,
  };
}

describe("relevant ATC frequency UI helpers", () => {
  it("limits the collapsed UI to five entries and preserves order", () => {
    const values = Array.from({ length: 7 }, (_, index) => summary(118 + index / 10));
    expect(displayedRelevantAtcFrequencies(values)).toHaveLength(MAX_DISPLAYED_RELEVANT_ATC_FREQUENCIES);
    expect(displayedRelevantAtcFrequencies(values).map((item) => item.frequencyMhz)).toEqual(values.slice(0, 5).map((item) => item.frequencyMhz));
    expect(displayedRelevantAtcFrequencies(values, true)).toHaveLength(7);
  });

  it("builds a stable logical identity from frequency and ATC service identity", () => {
    expect(relevantAtcFrequencyKey(summary(127.35))).toBe("127.350|PRAHA RADAR|ACC");
  });
});
