import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/aircraft/[hex]/route";

const mocks = vi.hoisted(() => ({
  getAircraftDetail: vi.fn(),
  getAircraftQuickDetail: vi.fn(),
  enrichAircraftDetailView: vi.fn(),
  getAircraft: vi.fn(),
}));

vi.mock("@/lib/server/history", () => ({
  getAircraftDetail: mocks.getAircraftDetail,
  getAircraftQuickDetail: mocks.getAircraftQuickDetail,
  HistoryDatabaseUnavailableError: class HistoryDatabaseUnavailableError extends Error {},
  normalizeAircraftHistoryRange: vi.fn(() => "30d"),
}));

vi.mock("@/lib/server/aircraft-state", () => ({
  getAircraftStateService: vi.fn(() => ({ getAircraft: mocks.getAircraft })),
}));

vi.mock("@/lib/server/aircraft-detail-enrichment", () => ({ enrichAircraftDetailView: mocks.enrichAircraftDetailView }));

const { getAircraftDetail, getAircraftQuickDetail, enrichAircraftDetailView, getAircraft } = mocks;

const liveAircraft = {
  icaoHex: "ABC123",
  callsign: "TEST1",
};

beforeEach(() => {
  vi.clearAllMocks();
  getAircraft.mockReturnValue(liveAircraft);
  getAircraftDetail.mockResolvedValue({
    aircraft: { icaoHex: "ABC123" },
    recentFlights: [{ id: 1 }],
    historySummary: { range: "30d" },
    lifetimeStats: { flightCount: 1 },
    logbook: { isNew: false },
  });
  enrichAircraftDetailView.mockResolvedValue({
    ...liveAircraft,
    enrichment: { flightPlan: { callsign: "TEST1", filedRoute: "PAID ROUTE" } },
  });
  getAircraftQuickDetail.mockResolvedValue({
    aircraft: { icaoHex: "ABC123", registration: "OK-ABC" },
    liveEnrichment: { route: { origin: "LKPR", destination: "LZIB" } },
  });
});

function request(mode: string): Request {
  return new Request(`http://localhost/api/aircraft/abc123?mode=${mode}&coverage=local`);
}

describe("aircraft detail API modes", () => {
  it("serves quick mode without full history or FlightAware enrichment", async () => {
    const response = await GET(request("quick"), { params: Promise.resolve({ hex: "abc123" }) });
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toEqual({
      aircraft: { icaoHex: "ABC123", registration: "OK-ABC" },
      liveEnrichment: { route: { origin: "LKPR", destination: "LZIB" } },
    });
    expect(getAircraftQuickDetail).toHaveBeenCalledWith("ABC123", liveAircraft);
    expect(getAircraftDetail).not.toHaveBeenCalled();
    expect(enrichAircraftDetailView).not.toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toContain("PAID ROUTE");
    expect(JSON.stringify(body)).not.toContain("recentFlights");
  });

  it("keeps full mode on the existing detail and on-demand enrichment path", async () => {
    const response = await GET(request("full"), { params: Promise.resolve({ hex: "abc123" }) });
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(getAircraftDetail).toHaveBeenCalledWith("ABC123", { historyRange: "30d" });
    expect(enrichAircraftDetailView).toHaveBeenCalledWith(liveAircraft, expect.any(Date));
    expect(JSON.stringify(body)).toContain("PAID ROUTE");
  });

  it("rejects an unknown mode before touching either data path", async () => {
    const response = await GET(request("sideways"), { params: Promise.resolve({ hex: "abc123" }) });

    expect(response.status).toBe(400);
    expect(getAircraft).not.toHaveBeenCalled();
    expect(getAircraftDetail).not.toHaveBeenCalled();
    expect(getAircraftQuickDetail).not.toHaveBeenCalled();
    expect(enrichAircraftDetailView).not.toHaveBeenCalled();
  });
});
