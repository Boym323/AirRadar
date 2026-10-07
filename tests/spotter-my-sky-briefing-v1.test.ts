import { describe, expect, it } from "vitest";
import type { AircraftView } from "@/lib/aircraft/types";
import { buildSpotterBriefing, type SpotterBriefingCandidate } from "@/lib/spotter-briefing";

function aircraft(icaoHex: string, type = "A320"): AircraftView {
  return {
    icaoHex,
    callsign: icaoHex,
    registration: null,
    aircraftType: type,
    aircraftDescription: null,
    lat: 50,
    lon: 14,
    altitude: 10_000,
    baroAltitude: 10_000,
    geomAltitude: null,
    groundSpeed: 220,
    track: 90,
    verticalRate: 0,
    baroRate: 0,
    geomRate: null,
    squawk: "1000",
    category: null,
    emergency: null,
    rssi: null,
    messages: 1,
    seenSeconds: 0,
    seenPosSeconds: 0,
    lastSeen: "2026-10-07T14:00:00Z",
    source: "ADS-B",
    origin: "local",
    sourceType: null,
    onGround: false,
    distanceKm: 10,
    bearing: 90,
  };
}

function candidate(
  id: string,
  photoScore: number,
  interestScore: number,
  seconds: number,
  iconic = false,
): SpotterBriefingCandidate {
  return {
    aircraft: aircraft(id, iconic ? "A388" : "A320"),
    closestApproach: {
      secondsUntilClosest: seconds,
      currentHorizontalDistanceKm: 10,
      closestHorizontalDistanceKm: 2,
      closestSlantDistanceKm: 4,
      elevationAtClosestDeg: 45,
      phase: "approaching",
    },
    interest: {
      score: interestScore,
      reasons: iconic ? [{ code: "iconic_type", points: 30 }] : [],
    },
    photoOpportunity: {
      score: photoScore,
      reasons: [],
    },
  };
}

describe("My Sky Briefing V1", () => {
  it("summarizes a strong spotting window", () => {
    const briefing = buildSpotterBriefing([
      candidate("A38001", 92, 80, 240, true),
      candidate("B77W01", 76, 45, 480),
      candidate("A32001", 55, 20, 720),
    ]);
    expect(briefing.condition).toBe("EXCELLENT");
    expect(briefing.totalPasses).toBe(3);
    expect(briefing.interestingPasses).toBe(2);
    expect(briefing.iconicPasses).toBe(1);
    expect(briefing.highOpportunityPasses).toBe(2);
    expect(briefing.bestPhotoScore).toBe(92);
    expect(briefing.top[0].aircraft.icaoHex).toBe("A38001");
  });

  it("excludes passes outside the requested horizon", () => {
    const briefing = buildSpotterBriefing([
      candidate("SOON01", 70, 40, 300),
      candidate("LATE01", 99, 80, 3700, true),
    ], 60);
    expect(briefing.totalPasses).toBe(1);
    expect(briefing.top[0].aircraft.icaoHex).toBe("SOON01");
  });

  it("reports an empty window without fabricating conditions", () => {
    const briefing = buildSpotterBriefing([]);
    expect(briefing.condition).toBe("EMPTY");
    expect(briefing.bestPhotoScore).toBeNull();
    expect(briefing.top).toEqual([]);
  });
});
