import { describe, expect, it } from "vitest";
import { isOgnDuplicateOfAircraft } from "@/lib/ogn/deduplication";
import type { AircraftView } from "@/lib/aircraft/types";
import type { OgnTargetView } from "@/lib/ogn/types";

const aircraft: AircraftView = {
  icaoHex: "4BB87A", callsign: "DFLIP", registration: null, aircraftType: "C208", aircraftDescription: null,
  lat: 49.8, lon: 18.25, altitude: 875, baroAltitude: 875, geomAltitude: null, groundSpeed: 80, track: 180,
  verticalRate: 0, baroRate: 0, geomRate: null, squawk: "7000", category: "A1", emergency: null, rssi: null,
  messages: 1, seenSeconds: 0, seenPosSeconds: 0, lastSeen: "2026-01-01T00:00:00.000Z", source: "ADS-B",
  origin: "local", sourceType: "adsb_icao", onGround: false, distanceKm: 1, bearing: 0, trail: [],
};

const target: OgnTargetView = {
  id: "ogn-1", publicId: "ogn-1", address: null, addressType: "unknown", senderCallsign: null, trackingSource: "ogn", latitude: 49.8005,
  longitude: 18.2505, altitudeFt: 900, groundSpeedKt: 80, trackDeg: 180, verticalRateFpm: 0, turnRateDegPerSec: 0,
  flightLevel: null, observedAt: "2026-01-01T00:00:00.000Z", receivedAt: "2026-01-01T00:00:00.000Z",
  aircraftType: "powered_aircraft", registration: null, competitionNumber: null, model: null, identityVisible: false,
  stealth: false, noTracking: false, lastReceiver: null, distanceKm: 1, bearing: 0, stale: false,
};

describe("OGN/ADS-B visual deduplication", () => {
  it("hides a co-located OGN target with matching altitude", () => {
    expect(isOgnDuplicateOfAircraft(target, aircraft)).toBe(true);
  });

  it("keeps a nearby aircraft when altitude does not match", () => {
    expect(isOgnDuplicateOfAircraft({ ...target, altitudeFt: 2_000 }, aircraft)).toBe(false);
  });

  it("uses a published ICAO identity when available", () => {
    expect(isOgnDuplicateOfAircraft({ ...target, address: "4bb87a", addressType: "icao", latitude: 0, longitude: 0, altitudeFt: null }, aircraft)).toBe(true);
  });
});
