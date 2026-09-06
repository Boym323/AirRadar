import { afterEach, describe, expect, it, vi } from "vitest";
import { AdsbDbProvider } from "@/lib/server/adsbdb-provider";
import { FlightAwareFlightPlanProvider } from "@/lib/server/flightaware-provider";

afterEach(() => vi.unstubAllGlobals());

describe("optional enrichment providers", () => {
  it("normalizes ADSBDB metadata and route airport records", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ response: { aircraft: {
        registration: "A6-EVL", type: "A380-861", icao_type: "A388", manufacturer: "Airbus",
        registered_owner: "Emirates", registered_owner_country_name: "United Arab Emirates", registered_owner_country_iso_name: "AE",
      } } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ response: { flightroute: {
        callsign: "UAE139", airline: { name: "Emirates", icao: "UAE", iata: "EK" },
        origin: { icao_code: "OMDB", iata_code: "DXB", name: "Dubai International", municipality: "Dubai", latitude: 25.25, longitude: 55.36 },
        destination: { icao_code: "LKPR", iata_code: "PRG", name: "Václav Havel Airport Prague", municipality: "Prague", latitude: 50.1, longitude: 14.26 },
      } } })));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new AdsbDbProvider("https://example.test/v0");
    await expect(provider.getMetadata("896139")).resolves.toMatchObject({ registration: "A6-EVL", icaoTypeCode: "A388", registrationCountryCode: "AE" });
    await expect(provider.getRoute("uae139", new Date("2026-01-01T00:00:00Z"))).resolves.toMatchObject({
      airline: "Emirates", origin: "OMDB", destination: "LKPR", originAirport: { iataCode: "DXB" },
    });
  });

  it("keeps the FlightAware key in a server-side request and maps plan fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ flights: [{ ident: "UAE139", scheduled_out: "2026-01-01T08:00:00Z", actual_out: null, scheduled_in: "2026-01-01T16:00:00Z", estimated_in: "2026-01-01T16:20:00Z", filed_route: "DCT L604", waypoints: ["TOP"], }] })));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new FlightAwareFlightPlanProvider("secret-key");
    await expect(provider.getFlightPlan("UAE139", new Date("2026-01-01T00:00:00Z"))).resolves.toMatchObject({ scheduledDeparture: "2026-01-01T08:00:00Z", estimatedArrival: "2026-01-01T16:20:00Z", waypoints: ["TOP"] });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ headers: { "x-apikey": "secret-key" } });
  });
});
