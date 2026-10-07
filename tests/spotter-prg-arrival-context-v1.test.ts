import { describe, expect, it } from "vitest";
import type { AircraftView } from "@/lib/aircraft/types";
import { buildPrgArrivalContext } from "@/lib/spotter-arrival-context";

function base(destination: string): AircraftView {
  return {
    icaoHex: "8964A1",
    callsign: "UAE139",
    registration: "A6-EVK",
    aircraftType: "A388",
    aircraftDescription: "Airbus A380-800",
    lat: 50,
    lon: 14,
    altitude: 9000,
    baroAltitude: 9000,
    geomAltitude: null,
    groundSpeed: 220,
    track: 280,
    verticalRate: -1000,
    baroRate: -1000,
    geomRate: null,
    squawk: "1000",
    category: null,
    emergency: null,
    rssi: null,
    messages: 1,
    seenSeconds: 0,
    seenPosSeconds: 0,
    lastSeen: "2026-10-07T13:00:00Z",
    source: "ADS-B",
    origin: "local",
    sourceType: null,
    onGround: false,
    distanceKm: 10,
    bearing: 270,
    targetState: {
      subtype: 1,
      selectedAltitudeFt: 3000,
      selectedAltitudeSource: "MCP/FCU",
      baroPressureHpa: 1013,
      selectedHeadingDeg: null,
      nacp: 8,
      nicBaro: 1,
      sil: 3,
      modeStatus: true,
      autopilot: true,
      vnavMode: false,
      altitudeHoldMode: false,
      approachMode: true,
      lnavMode: true,
      tcasOperational: true,
    },
    enrichment: {
      route: {
        callsign: "UAE139",
        airline: "Emirates",
        airlineIcao: "UAE",
        airlineIata: "EK",
        origin: "DXB",
        destination,
        originAirport: null,
        destinationAirport: null,
      },
      flightPlan: {
        callsign: "UAE139",
        scheduledDeparture: null,
        actualDeparture: null,
        scheduledArrival: "2026-10-07T13:10:00Z",
        estimatedArrival: "2026-10-07T13:08:00Z",
        filedRoute: null,
        waypoints: [],
        flightAware: {
          progressPercent: 96,
          operational: {
            arrivalRunway: "24",
            destinationTerminal: "1",
            destinationGate: "B4",
          },
        },
      },
    },
  };
}

describe("Spotter PRG Arrival Context V1", () => {
  it("activates only for Prague destination evidence", () => {
    expect(buildPrgArrivalContext(base("PRG"))).toMatchObject({
      destination: "PRG",
      estimatedArrival: "2026-10-07T13:08:00Z",
      runway: "24",
      terminal: "1",
      gate: "B4",
      progressPercent: 96,
      approachMode: true,
      verticalTrend: "descending",
    });
    expect(buildPrgArrivalContext(base("VIE"))).toBeNull();
  });

  it("does not invent unavailable operational fields", () => {
    const aircraft = base("LKPR");
    aircraft.enrichment!.flightPlan!.flightAware = undefined;
    expect(buildPrgArrivalContext(aircraft)).toMatchObject({
      runway: null,
      terminal: null,
      gate: null,
      progressPercent: null,
    });
  });
});
