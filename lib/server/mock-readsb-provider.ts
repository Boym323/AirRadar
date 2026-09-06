import type { AircraftProvider } from "@/lib/server/provider";
import type { Aircraft, ProviderSnapshot, ReceiverPosition } from "@/lib/aircraft/types";
import { destinationPoint, haversineDistanceKm, initialBearing } from "@/lib/geo";

interface MockFlight {
  hex: string;
  callsign: string;
  registration: string;
  type: string;
  description: string;
  startBearing: number;
  radiusKm: number;
  speedKts: number;
  altitude: number;
  verticalRate: number;
  phase: number;
}

const FLIGHTS: MockFlight[] = [
  { hex: "896139", callsign: "UAE139", registration: "A6-EOG", type: "A388", description: "Airbus A380-800", startBearing: 312, radiusKm: 62, speedKts: 462, altitude: 37000, verticalRate: 0, phase: 0.1 },
  { hex: "3C65A1", callsign: "DLH8K", registration: "D-AIXQ", type: "A359", description: "Airbus A350-900", startBearing: 128, radiusKm: 41, speedKts: 418, altitude: 34000, verticalRate: -256, phase: 1.3 },
  { hex: "4CA9A4", callsign: "RYR71QH", registration: "EI-DCL", type: "B738", description: "Boeing 737-800", startBearing: 228, radiusKm: 24, speedKts: 286, altitude: 21800, verticalRate: 768, phase: 2.1 },
  { hex: "4B1812", callsign: "SWR433", registration: "HB-JDA", type: "A20N", description: "Airbus A320neo", startBearing: 46, radiusKm: 78, speedKts: 392, altitude: 31000, verticalRate: 0, phase: 3.2 },
  { hex: "4245A7", callsign: "WZZ2PL", registration: "HA-LYH", type: "A321", description: "Airbus A321", startBearing: 187, radiusKm: 33, speedKts: 335, altitude: 26800, verticalRate: -512, phase: 4.7 },
  { hex: "4D2268", callsign: "LOT381", registration: "SP-LVG", type: "B38M", description: "Boeing 737 MAX 8", startBearing: 274, radiusKm: 96, speedKts: 448, altitude: 36000, verticalRate: 0, phase: 5.4 },
];

export class MockReadsbProvider implements AircraftProvider {
  readonly name = "mock" as const;
  private readonly startedAt = Date.now();

  constructor(private readonly receiver: ReceiverPosition) {}

  async getSnapshot(): Promise<ProviderSnapshot> {
    const now = Date.now();
    const aircraft = FLIGHTS.map((flight, index) => this.createAircraft(flight, now, index));
    return {
      aircraft,
      receiver: this.receiver,
      fetchedAt: new Date(now).toISOString(),
      provider: "mock",
    };
  }

  private createAircraft(flight: MockFlight, now: number, index: number): Aircraft {
    const elapsedSeconds = (now - this.startedAt) / 1000;
    const bearing = (flight.startBearing + elapsedSeconds * (flight.speedKts / Math.max(flight.radiusKm, 8)) * 0.006) % 360;
    const radius = flight.radiusKm + Math.sin(elapsedSeconds / 38 + flight.phase) * Math.min(8, flight.radiusKm * 0.08);
    const [lon, lat] = destinationPoint(this.receiver.lat, this.receiver.lon, radius, bearing);
    const distanceKm = haversineDistanceKm(this.receiver.lat, this.receiver.lon, lat, lon);
    const callsign = flight.callsign;
    const recordedAt = new Date(now).toISOString();
    return {
      icaoHex: flight.hex,
      callsign,
      registration: flight.registration,
      aircraftType: flight.type,
      aircraftDescription: flight.description,
      lat,
      lon,
      altitude: Math.round(flight.altitude + Math.sin(elapsedSeconds / 25 + flight.phase) * 120),
      groundSpeed: Math.round(flight.speedKts + Math.sin(elapsedSeconds / 12 + flight.phase) * 4),
      track: (initialBearing(this.receiver.lat, this.receiver.lon, lat, lon) + 90) % 360,
      verticalRate: index === 2 ? Math.round(600 + Math.sin(elapsedSeconds / 9) * 220) : flight.verticalRate,
      squawk: ["1234", "4521", "2631", "1001", "6510", "2256"][index],
      rssi: -3 - (index * 1.4) - Math.abs(Math.sin(elapsedSeconds / 10 + flight.phase)),
      messages: Math.round(15800 + elapsedSeconds * (index + 1) * 1.8),
      lastSeen: recordedAt,
      source: "ADS-B",
      onGround: false,
      distanceKm,
      bearing,
      trail: [{ lat, lon, recordedAt }],
    };
  }
}
