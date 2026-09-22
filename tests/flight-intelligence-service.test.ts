import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPrisma: vi.fn(),
}));

vi.mock("@/lib/server/db", () => ({
  getPrisma: mocks.getPrisma,
}));

import { FlightIntelligenceService } from "@/lib/server/flight-intelligence";

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
});
