import { describe, expect, it } from "vitest";
import { toOgnTrafficPresentation, trafficSourcePresentation } from "@/lib/radar/traffic-presentation";
import type { OgnTargetView } from "@/lib/ogn/types";
import type { AircraftView } from "@/lib/aircraft/types";

function target(overrides: Partial<OgnTargetView> = {}): OgnTargetView {
  return {
    id: "ogn-public-1", publicId: "ogn-public-1", address: null, addressType: "flarm", senderCallsign: null,
    trackingSource: "flarm", latitude: 50, longitude: 14, altitudeFt: 4250, groundSpeedKt: 62, trackDeg: 218,
    verticalRateFpm: -340, turnRateDegPerSec: null, flightLevel: null, observedAt: "2026-10-03T10:00:00Z",
    receivedAt: "2026-10-03T10:00:00Z", aircraftType: "glider", registration: null, competitionNumber: null,
    model: null, identityVisible: false, stealth: false, noTracking: false, lastReceiver: null,
    distanceKm: 12, bearing: 100, stale: false, ...overrides,
  };
}

describe("traffic presentation", () => {
  it.each([
    ["local ADS-B", { seenLocal: true, seenNetwork: false, positionOrigin: "local", positionSource: "ADS-B" }, "LOCAL · ADS-B"],
    ["local MLAT", { seenLocal: true, seenNetwork: false, positionOrigin: "local", positionSource: "MLAT" }, "LOCAL · MLAT"],
    ["network ADSB.LOL", { seenLocal: false, seenNetwork: true, positionOrigin: "adsblol", positionSource: "ADS-B" }, "ADSB.LOL"],
    ["network ADSBHUB", { seenLocal: false, seenNetwork: true, positionOrigin: "adsbhub", positionSource: "ADS-B" }, "ADSBHUB"],
  ])("formats %s source labels", (_name, provenance, expected) => {
    const aircraft = { provenance } as AircraftView;
    expect(trafficSourcePresentation(aircraft).detailLabel).toBe(expected);
  });

  it("maps OGN aircraft families to canonical icon kinds", () => {
    expect(toOgnTrafficPresentation(target()).iconKind).toBe("glider");
    expect(toOgnTrafficPresentation(target({ aircraftType: "helicopter" })).iconKind).toBe("helicopter");
    expect(toOgnTrafficPresentation(target({ aircraftType: "uav" })).iconKind).toBe("drone");
    expect(toOgnTrafficPresentation(target({ aircraftType: "powered_aircraft" })).iconKind).toBe("airplane");
  });

  it("does not expose anonymous OGN identity in presentation", () => {
    const presentation = toOgnTrafficPresentation(target({ address: null, senderCallsign: null, registration: null, competitionNumber: null }));
    expect(presentation.primaryLabel).toBe("GLIDER");
    expect(presentation).not.toHaveProperty("address");
    expect(presentation).not.toHaveProperty("senderCallsign");
  });

  it("uses canonical source labels", () => {
    expect(trafficSourcePresentation(target()).detailLabel).toBe("OGN · FLARM");
    expect(trafficSourcePresentation(target({ trackingSource: "fanet" })).detailLabel).toBe("OGN · FANET");
  });
});
