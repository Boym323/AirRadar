import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EnrichmentService } from "@/lib/server/enrichment-cache";
import { FlightAwareFlightPlanProvider } from "@/lib/server/flightaware-provider";
import { GET } from "@/app/api/aircraft/[hex]/route";

const mocks = vi.hoisted(() => ({
  getAircraftDetail: vi.fn(),
  getAircraftQuickDetail: vi.fn(),
  getAircraft: vi.fn(),
  getOnDemandEnrichmentService: vi.fn(),
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

vi.mock("@/lib/server/providers", () => ({ getOnDemandEnrichmentService: mocks.getOnDemandEnrichmentService }));

const { getAircraftDetail, getAircraftQuickDetail, getAircraft, getOnDemandEnrichmentService } = mocks;

let flightAwareProvider: FlightAwareFlightPlanProvider;
let flightAwareFetch: ReturnType<typeof vi.fn>;

const liveAircraft = {
  icaoHex: "ABC123",
  callsign: "TEST1",
};

beforeEach(() => {
  vi.clearAllMocks();
  const ledgerPath = join(mkdtempSync(join(tmpdir(), "airradar-quick-detail-")), "flightaware-usage.json");
  flightAwareFetch = vi.fn(async () => new Response(JSON.stringify({
    flights: [{
      ident: "TEST1",
      scheduled_out: "2026-01-01T00:00:00Z",
      scheduled_in: "2026-01-01T01:00:00Z",
      route: "DCT TEST",
    }],
  }), { status: 200, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", flightAwareFetch);
  flightAwareProvider = new FlightAwareFlightPlanProvider("test-key", { ledgerPath });
  getOnDemandEnrichmentService.mockReturnValue(new EnrichmentService({ flightPlan: flightAwareProvider }));
  getAircraft.mockReturnValue(liveAircraft);
  getAircraftDetail.mockResolvedValue({
    aircraft: { icaoHex: "ABC123" },
    recentFlights: [{ id: 1 }],
    historySummary: { range: "30d" },
    lifetimeStats: { flightCount: 1 },
    logbook: { isNew: false },
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
    expect(getOnDemandEnrichmentService).not.toHaveBeenCalled();
    expect(flightAwareFetch).not.toHaveBeenCalled();
    expect(flightAwareProvider.getDiagnostics()).toMatchObject({ requests: 0, estimatedCostTodayUsd: 0, estimatedCostMonthUsd: 0 });
    expect(JSON.stringify(body)).not.toContain("flightPlan");
    expect(JSON.stringify(body)).not.toContain("recentFlights");
  });

  it("keeps full mode on the existing detail and on-demand enrichment path", async () => {
    const response = await GET(request("full"), { params: Promise.resolve({ hex: "abc123" }) });
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(getAircraftDetail).toHaveBeenCalledWith("ABC123", { historyRange: "30d" });
    expect(getOnDemandEnrichmentService).toHaveBeenCalledTimes(1);
    expect(flightAwareFetch).toHaveBeenCalledTimes(1);
    expect(flightAwareProvider.getDiagnostics()).toMatchObject({ requests: 1, estimatedCostTodayUsd: 0.005 });
    expect(JSON.stringify(body)).toContain("DCT TEST");
  });

  it("rejects an unknown mode before touching either data path", async () => {
    const response = await GET(request("sideways"), { params: Promise.resolve({ hex: "abc123" }) });

    expect(response.status).toBe(400);
    expect(getAircraft).not.toHaveBeenCalled();
    expect(getAircraftDetail).not.toHaveBeenCalled();
    expect(getAircraftQuickDetail).not.toHaveBeenCalled();
    expect(getOnDemandEnrichmentService).not.toHaveBeenCalled();
  });
});
