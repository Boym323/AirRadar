import { afterEach, describe, expect, it, vi } from "vitest";
import { AdsbDbProvider } from "@/lib/server/adsbdb-provider";
import { AircraftMetadataCatalog, parseAircraftMetadataCsv } from "@/lib/server/aircraft-metadata-catalog";
import { FlightAwareFlightPlanProvider } from "@/lib/server/flightaware-provider";
import { LocalReadsbProvider } from "@/lib/server/local-readsb-provider";
import { TAR1090_BLOCK_CACHE_MAX_BYTES, Tar1090DbProvider } from "@/lib/server/tar1090-db-provider";

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

  it("selects the observed FlightAware instance and loads its filed route by fa_flight_id", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ flights: [
        { ident: "UAE139", fa_flight_id: "UAE139-past", scheduled_out: "2026-01-01T02:00:00Z", actual_out: "2026-01-01T02:10:00Z", actual_in: "2026-01-01T06:00:00Z", route: "OLD ROUTE" },
        { ident: "UAE139", fa_flight_id: "UAE139-current", scheduled_out: "2026-01-01T08:00:00Z", actual_out: "2026-01-01T08:10:00Z", scheduled_in: "2026-01-01T16:00:00Z", estimated_in: "2026-01-01T16:20:00Z", route: "DCT L604" },
        { ident: "UAE139", fa_flight_id: "UAE139-future", scheduled_out: "2026-01-02T08:00:00Z", scheduled_in: "2026-01-02T16:00:00Z", route: "FUTURE ROUTE" },
      ] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ fixes: [{ name: "TOP" }, { name: "L604" }] })));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new FlightAwareFlightPlanProvider("secret-key");
    await expect(provider.getFlightPlan("UAE139", new Date("2026-01-01T12:00:00Z"))).resolves.toMatchObject({
      scheduledDeparture: "2026-01-01T08:00:00Z", estimatedArrival: "2026-01-01T16:20:00Z",
      filedRoute: "DCT L604", waypoints: ["TOP", "L604"],
    });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ headers: { "x-apikey": "secret-key" } });
    expect(fetchMock.mock.calls[1][0]).toBe("https://aeroapi.flightaware.com/aeroapi/flights/UAE139-current/route");
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ headers: { "x-apikey": "secret-key" } });
  });

  it("keeps the basic FlightPlan when the optional route endpoint returns HTTP 500", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ flights: [{
        ident: "UAE139", fa_flight_id: "UAE139-current", scheduled_out: "2026-01-01T08:00:00Z",
        actual_out: "2026-01-01T08:10:00Z", scheduled_in: "2026-01-01T16:00:00Z",
        estimated_in: "2026-01-01T16:20:00Z", route: "DCT L604",
      }] })))
      .mockResolvedValueOnce(new Response("upstream failure", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(new FlightAwareFlightPlanProvider("secret-key").getFlightPlan("UAE139", new Date("2026-01-01T12:00:00Z"))).resolves.toMatchObject({
      callsign: "UAE139", scheduledDeparture: "2026-01-01T08:00:00Z", actualDeparture: "2026-01-01T08:10:00Z",
      scheduledArrival: "2026-01-01T16:00:00Z", estimatedArrival: "2026-01-01T16:20:00Z",
      filedRoute: "DCT L604", waypoints: [],
    });
  });

  it("keeps the basic FlightPlan when the optional route endpoint times out", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ flights: [{
        ident: "UAE139", fa_flight_id: "UAE139-current", scheduled_out: "2026-01-01T08:00:00Z",
        scheduled_in: "2026-01-01T16:00:00Z", route: "DCT L604",
      }] })))
      .mockRejectedValueOnce(new Error("The operation was aborted"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(new FlightAwareFlightPlanProvider("secret-key").getFlightPlan("UAE139", new Date("2026-01-01T12:00:00Z"))).resolves.toMatchObject({
      filedRoute: "DCT L604", scheduledDeparture: "2026-01-01T08:00:00Z", waypoints: [],
    });
  });

  it("does not call FlightAware when the optional key is empty", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(new FlightAwareFlightPlanProvider(" ").getFlightPlan("UAE139", new Date())).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("local readsb provider", () => {
  it("reads the tar1090 data endpoints and normalizes a real readsb-shaped payload", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        now: 1767225600, messages: 123456, aircraft: [{
          hex: "3c1234", type: "adsb_icao", flight: " DLH123  ", r: "D-TEST", t: "A320",
          lat: 50.2, lon: 14.5, alt_baro: 28000, alt_geom: 28600, gs: 430, track: 91,
          baro_rate: 0, geom_rate: 64, squawk: "1000", category: "A3", rssi: -12.5,
          messages: 456, seen: 0.2, seen_pos: 0.1, mlat: [], tisb: [],
        }],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ lat: 50.05, lon: 14.4 })));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new LocalReadsbProvider("http://receiver.local/tar1090", { lat: 50, lon: 14, name: "Configured" });

    const snapshot = await provider.getSnapshot();

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "http://receiver.local/tar1090/data/aircraft.json",
      "http://receiver.local/tar1090/data/receiver.json",
    ]);
    expect(snapshot.receiver).toMatchObject({ lat: 50.05, lon: 14.4 });
    expect(snapshot.aircraft[0]).toMatchObject({
      icaoHex: "3C1234", callsign: "DLH123", lat: 50.2, lon: 14.5, baroAltitude: 28000,
      geomAltitude: 28600, groundSpeed: 430, track: 91, baroRate: 0, geomRate: 64,
      squawk: "1000", category: "A3", rssi: -12.5, messages: 456, source: "ADS-B",
      sourceType: "adsb_icao", seenSeconds: 0.2, seenPosSeconds: 0.1,
    });
  });
});

describe("tar1090 database provider", () => {
  it("discovers the hashed database folder and resolves metadata by ICAO hex", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('<script>let databaseFolder = "db-test";</script>'))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        BAACB: ["TC-JVK", "B738", "00", "BOEING 737-800"],
      })));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new Tar1090DbProvider("http://receiver.local/tar1090");
    await expect(provider.getMetadata("4baacb")).resolves.toMatchObject({
      registration: "TC-JVK",
      aircraftType: "B738",
      icaoTypeCode: "B738",
      aircraftDescription: "BOEING 737-800",
      flags: "00",
      source: "tar1090-db",
    });
    await expect(provider.getMetadata("4BAACB")).resolves.toMatchObject({ icaoTypeCode: "B738" });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "http://receiver.local/tar1090/",
      "http://receiver.local/tar1090/db-test/4.js",
    ]);
  });

  it("follows nested database blocks and returns null for an unknown address", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('let databaseFolder = "db-test";'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ children: ["4B"] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ children: ["4BA"] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ children: ["4BAA"] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ children: ["4BAAC"] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ children: ["4BAACB"] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ "": ["TC-JVK", "B738", "00", "BOEING 737-800"] })));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new Tar1090DbProvider("http://receiver.local/tar1090/");
    await expect(provider.getMetadata("4BAACB")).resolves.toMatchObject({ icaoTypeCode: "B738" });
    await expect(provider.getMetadata("4BAACC")).resolves.toBeNull();
  });

  it("degrades to a metadata miss when the tar1090 page is unavailable", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("offline", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(new Tar1090DbProvider("http://receiver.local/tar1090").getMetadata("4BAACB")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("aircraft metadata catalog", () => {
  it("parses the readsb semicolon catalog and normalizes hex keys", () => {
    const records = parseAircraftMetadataCsv(
      "4baacb;TC-JVK;B738;00;BOEING 737-800;;;\n4BAACC;;;10;Unknown\\; aircraft;;;;",
      "https://example.test/aircraft.csv.gz",
      "etag-1",
    );

    expect(records).toEqual([
      {
        icaoHex: "4BAACB", registration: "TC-JVK", icaoTypeCode: "B738",
        aircraftDescription: "BOEING 737-800", operator: null, flags: "00", year: null,
        source: "tar1090-db", sourceReference: "https://example.test/aircraft.csv.gz", datasetVersion: "etag-1",
      },
      {
        icaoHex: "4BAACC", registration: null, icaoTypeCode: null,
        aircraftDescription: "Unknown; aircraft", operator: null, flags: "10", year: null,
        source: "tar1090-db", sourceReference: "https://example.test/aircraft.csv.gz", datasetVersion: "etag-1",
      },
    ]);
  });

  it("falls back to the local tar1090 database when PostgreSQL is not configured", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('let databaseFolder = "db-test";'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ BAACB: ["TC-JVK", "B738", "00", "BOEING 737-800"] })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(new AircraftMetadataCatalog("http://receiver.local/tar1090").getMetadata("4BAACB")).resolves.toMatchObject({
      registration: "TC-JVK", icaoTypeCode: "B738", aircraftDescription: "BOEING 737-800",
    });
  });

  it("keeps the local tar1090 block cache bounded and coalesced", async () => {
    const fetchMock = vi.fn().mockImplementation((input: string) => new Response(
      input.endsWith("/") ? 'let databaseFolder = "db-test";' : "{}",
    ));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new Tar1090DbProvider("http://receiver.local/tar1090");
    await expect(provider.getMetadata("4BAACB")).resolves.toBeNull();
    await expect(provider.getMetadata("4BAACB")).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(provider.getDiagnostics()).toMatchObject({
      blockCacheSize: 1,
      blockCacheLimit: 4_096,
      blockCacheBytesLimit: 64 * 1024 * 1024,
    });
    expect(provider.getDiagnostics().blockCacheBytes).toBeGreaterThan(0);
  });

  it("enforces a byte bound when many large tar1090 blocks are requested", async () => {
    const filler = "x".repeat(2 * 1024 * 1024);
    const fetchMock = vi.fn().mockImplementation((input: string) => {
      if (input.endsWith("/")) return new Response('let databaseFolder = "db-test";');
      const blockKey = input.match(/\/([^/]+)\.js$/)?.[1] ?? "";
      const payload = blockKey.length === 6
        ? { "": ["OK-TEST", "A320", "00", "Airbus A320"], filler: `${filler}${blockKey}` }
        : { children: [..."0123456789ABCDEF"].map((suffix) => `${blockKey}${suffix}`), filler: `${filler}${blockKey}` };
      return new Response(JSON.stringify(payload));
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new Tar1090DbProvider("http://receiver.local/tar1090");
    for (let index = 0; index < 40; index += 1) {
      await expect(provider.getMetadata(index.toString(16).padStart(6, "0"))).resolves.toMatchObject({ registration: "OK-TEST" });
    }

    const diagnostics = provider.getDiagnostics();
    expect(diagnostics.blockCacheBytes).toBeLessThanOrEqual(TAR1090_BLOCK_CACHE_MAX_BYTES);
    expect(diagnostics.blockCacheSize).toBeLessThan(45);
  });
});
