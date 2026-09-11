import { describe, expect, it, vi } from "vitest";
import type { Aircraft } from "@/lib/aircraft/types";
import { enrichAircraftDetailView } from "@/lib/server/aircraft-detail-enrichment";
import { getOnDemandEnrichmentService } from "@/lib/server/providers";

vi.mock("@/lib/server/providers", () => ({ getOnDemandEnrichmentService: vi.fn() }));

const aircraft: Aircraft = {
  icaoHex: "ABC123", callsign: "TEST1", registration: "OK-ABC", aircraftType: "A320", aircraftDescription: null,
  lat: 50, lon: 14, altitude: 10000, baroAltitude: 10000, geomAltitude: null, groundSpeed: 300, track: 90,
  verticalRate: 0, baroRate: 0, geomRate: null, squawk: null, category: null, emergency: null, rssi: -20, messages: 10,
  seenSeconds: 0, seenPosSeconds: 0, lastSeen: "2026-09-11T12:00:00.000Z", source: "ADS-B", sourceType: "adsb_icao",
  onGround: false, distanceKm: 10, bearing: 90, trail: [], enrichment: { metadata: { registration: "OK-ABC", registrationCountry: null, registrationCountryCode: null, aircraftType: "A320", icaoTypeCode: "A320", aircraftDescription: null, operator: null, manufacturer: null, source: "test", retrievedAt: "2026-09-11T12:00:00.000Z" } },
};

describe("aircraft detail on-demand enrichment", () => {
  it("adds a FlightAware plan without mutating live RAM state", async () => {
    const flightPlan = { callsign: "TEST1", scheduledDeparture: null, actualDeparture: null, scheduledArrival: null, estimatedArrival: null, filedRoute: "VOZ T709 BODAL", waypoints: ["VOZ", "BODAL"], source: "FlightAware", retrievedAt: "2026-09-11T12:00:00.000Z" };
    vi.mocked(getOnDemandEnrichmentService).mockReturnValue({ getFlightPlanOnDemand: vi.fn().mockResolvedValue(flightPlan) } as never);

    const result = await enrichAircraftDetailView(aircraft, new Date("2026-09-11T12:00:00Z"));

    expect(result?.enrichment?.flightPlan).toEqual(flightPlan);
    expect(aircraft.enrichment?.flightPlan).toBeUndefined();
  });

  it("keeps detail fail-soft when the optional provider fails", async () => {
    vi.mocked(getOnDemandEnrichmentService).mockReturnValue({ getFlightPlanOnDemand: vi.fn().mockRejectedValue(new Error("upstream")) } as never);
    await expect(enrichAircraftDetailView(aircraft)).resolves.toBe(aircraft);
  });
});
