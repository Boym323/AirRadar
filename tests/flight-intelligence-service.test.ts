import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPrisma: vi.fn(),
}));

vi.mock("@/lib/server/db", () => ({
  getPrisma: mocks.getPrisma,
}));

import { FlightIntelligenceService } from "@/lib/server/flight-intelligence";
import type { Aircraft } from "@/lib/aircraft/types";
import type { FlightIntelligenceEvent } from "@/lib/intelligence/types";

function aircraft(overrides: Partial<Aircraft> = {}): Aircraft {
  return { icaoHex: "ABC123", callsign: "TEST01", registration: null, aircraftType: null, aircraftDescription: null, lat: 50.1, lon: 14.3, altitude: 4_000, baroAltitude: 4_000, geomAltitude: 4_000, groundSpeed: 180, track: 90, verticalRate: 0, baroRate: 0, geomRate: 0, squawk: null, category: null, emergency: null, rssi: null, messages: null, seenSeconds: 0, seenPosSeconds: 0, lastSeen: "2026-09-22T08:00:00.000Z", source: "ADS-B", origin: "local", sourceType: null, onGround: false, distanceKm: 10, bearing: 90, trail: [], ...overrides };
}

describe("FlightIntelligenceService database reads", () => {
  beforeEach(() => {
    mocks.getPrisma.mockReset();
  });

  it("loads flight callsign and registration relations for persisted events", async () => {
    const include = vi.fn();
    const query = {
      where: vi.fn(),
      orderBy: vi.fn(),
      include,
      limit: vi.fn(),
      all: vi.fn().mockResolvedValue([{
        id: 7,
        eventKey: "ABC123:LANDING:1",
        type: "LANDING",
        icaoHex: "ABC123",
        flightId: 42,
        occurredAt: "2026-09-22T08:00:00.000Z",
        detectedAt: "2026-09-22T08:00:01.000Z",
        latitude: 50.1,
        longitude: 14.3,
        altitude: 1000,
        confidence: 0.9,
        airportIcao: "LKPR",
        runway: "24",
        sectorId: null,
        evidenceJson: "[\"stable approach\"]",
        aircraft: { registration: "OK-ABC" },
        flight: { callsign: "CSA123", registration: "OK-FLT" },
      }]),
    };
    query.where.mockReturnValue(query);
    query.orderBy.mockReturnValue(query);
    query.include.mockReturnValue(query);
    query.limit.mockReturnValue(query);

    mocks.getPrisma.mockReturnValue({
      orm: {
        public: {
          Airport: { all: vi.fn().mockResolvedValue([]) },
          FlightEvent: query,
        },
      },
    });

    const service = new FlightIntelligenceService();
    const result = await service.query({ aircraft: "abc123" });

    expect(include).toHaveBeenCalledTimes(2);
    expect(include.mock.calls.map((call) => call[0])).toEqual(["aircraft", "flight"]);
    expect(result[0]).toMatchObject({
      callsign: "CSA123",
      registration: "OK-FLT",
      icaoHex: "ABC123",
    });
  });

  it("merges not-yet-persisted in-memory events into database-backed queries", async () => {
    const query = {
      where: vi.fn(),
      orderBy: vi.fn(),
      include: vi.fn(),
      limit: vi.fn(),
      all: vi.fn().mockResolvedValue([]),
    };
    query.where.mockReturnValue(query);
    query.orderBy.mockReturnValue(query);
    query.include.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    mocks.getPrisma.mockReturnValue({
      orm: {
        public: {
          Airport: { all: vi.fn().mockResolvedValue([]) },
          FlightEvent: query,
        },
      },
    });

    const service = new FlightIntelligenceService();
    const pending = {
      id: "pending-1",
      eventKey: "ABC123:GO_AROUND:pending",
      lifecycleKey: "ABC123:1",
      type: "GO_AROUND",
      phase: "CLIMB",
      icaoHex: "ABC123",
      flightId: null,
      callsign: "TEST01",
      registration: null,
      occurredAt: "2026-09-22T08:02:00.000Z",
      detectedAt: "2026-09-22T08:02:01.000Z",
      latitude: 50.1,
      longitude: 14.3,
      altitude: 4_000,
      confidence: 0.9,
      confidenceLevel: "high",
      airportIcao: "LKPR",
      runway: null,
      runwayContext: null,
      sectorId: null,
      evidence: ["test"],
    } satisfies FlightIntelligenceEvent;
    (service as unknown as { events: FlightIntelligenceEvent[] }).events.unshift(pending);

    const result = await service.query({ aircraft: "abc123", limit: 12 });

    expect(result).toHaveLength(1);
    expect(result[0]?.eventKey).toBe(pending.eventKey);
  });

  it("links persistence to the Flight covering the event time and keeps memory filtering usable", async () => {
    const create = vi.fn().mockResolvedValue({ id: 9 });
    const flightQuery = {
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
      all: vi.fn().mockResolvedValue([{ id: 42, startTime: "2026-09-22T07:59:00.000Z", lastSeenAt: "2026-09-22T08:05:00.000Z", endTime: null }]),
    };
    flightQuery.where.mockReturnValue(flightQuery);
    flightQuery.orderBy.mockReturnValue(flightQuery);
    flightQuery.limit.mockReturnValue(flightQuery);
    mocks.getPrisma.mockReturnValue({
      orm: {
        public: {
          Airport: { all: vi.fn().mockResolvedValue([]) },
          Flight: flightQuery,
          FlightEvent: { create },
        },
      },
    });
    const service = new FlightIntelligenceService();
    const atc = { sectorId: "PRAHA-TMA" } as Aircraft["atc"];
    service.observe(undefined, aircraft({ atc, lastSeen: "2026-09-22T08:00:00.000Z" }));
    service.observe(undefined, aircraft({ atc, lastSeen: "2026-09-22T08:01:00.000Z" }), Date.parse("2026-09-22T08:01:00.000Z"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ flightId: 42 }) }));
    mocks.getPrisma.mockReturnValue(null);
    expect(service.getRecent({ flightId: 42 })).toHaveLength(1);
    expect(service.getRecent({ flightId: 41 })).toHaveLength(0);
  });
});
