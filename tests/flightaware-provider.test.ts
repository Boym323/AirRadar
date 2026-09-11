import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeAircraft } from "@/lib/aircraft/normalize";
import { EnrichmentService } from "@/lib/server/enrichment-cache";
import { FlightAwareFlightPlanProvider } from "@/lib/server/flightaware-provider";

describe("FlightAwareFlightPlanProvider cost guard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("bounds the ident lookup to one page and uses its filed route without a second paid request", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const requestUrl = new URL(String(input));
      expect(requestUrl.pathname).toBe("/aeroapi/flights/TEST123");
      expect(requestUrl.searchParams.get("max_pages")).toBe("1");
      return new Response(JSON.stringify({
        flights: [{
          ident: "TEST123",
          fa_flight_id: "TEST123-20260911-test",
          scheduled_out: "2026-09-11T12:00:00Z",
          scheduled_in: "2026-09-11T14:00:00Z",
          route: "DCT VLM HDO DCT",
        }],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new FlightAwareFlightPlanProvider("secret-test-key");
    const plan = await provider.getFlightPlan(" test123 ", new Date("2026-09-11T13:00:00Z"));

    expect(plan).toMatchObject({
      callsign: "TEST123",
      filedRoute: "DCT VLM HDO DCT",
      waypoints: [],
      source: "flightaware-aeroapi",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(provider.getDiagnostics()).toMatchObject({
      requests: 1,
      failures: 0,
      rateLimited: 0,
      limitPerMinute: 5,
      limitPerHour: 30,
      limitPerDay: 100,
      windowMs: 60_000,
      hourWindowMs: 3_600_000,
      dayWindowMs: 86_400_000,
    });
  });

  it("loads route fixes only as a fallback when the ident response has no filed route", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/route")) {
        return new Response(JSON.stringify({ fixes: [{ name: "VLM" }, { name: "HDO" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({
        flights: [{
          ident: "TEST123",
          fa_flight_id: "TEST123-20260911-test",
          scheduled_out: "2026-09-11T12:00:00Z",
          scheduled_in: "2026-09-11T14:00:00Z",
        }],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new FlightAwareFlightPlanProvider("secret-test-key");
    const plan = await provider.getFlightPlan("TEST123", new Date("2026-09-11T13:00:00Z"));

    expect(plan).toMatchObject({ filedRoute: null, waypoints: ["VLM", "HDO"] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/TEST123-20260911-test/route");
  });

  it("refuses upstream calls after the local per-minute budget is exhausted", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const callsign = new URL(String(input)).pathname.split("/").at(-1) ?? "UNKNOWN";
      return new Response(JSON.stringify({
        flights: [{
          ident: callsign,
          scheduled_out: "2026-09-11T12:00:00Z",
          scheduled_in: "2026-09-11T14:00:00Z",
          route: "DCT VLM DCT",
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new FlightAwareFlightPlanProvider("secret-test-key", {
      maxRequestsPerMinute: 2,
      maxRequestsPerHour: 10,
      maxRequestsPerDay: 10,
    });
    const observedAt = new Date("2026-09-11T13:00:00Z");

    await provider.getFlightPlan("ONE1", observedAt);
    await provider.getFlightPlan("TWO2", observedAt);
    await expect(provider.getFlightPlan("THREE3", observedAt)).rejects.toThrow("FlightAware local minute request budget exhausted");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(provider.getDiagnostics()).toMatchObject({
      requests: 2,
      failures: 0,
      rateLimited: 1,
      limitPerMinute: 2,
    });
  });

  it("enforces a hard rolling daily budget in addition to the burst limit", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const callsign = new URL(String(input)).pathname.split("/").at(-1) ?? "UNKNOWN";
      return new Response(JSON.stringify({
        flights: [{
          ident: callsign,
          scheduled_out: "2026-09-11T12:00:00Z",
          scheduled_in: "2026-09-11T14:00:00Z",
          route: "DCT VLM DCT",
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new FlightAwareFlightPlanProvider("secret-test-key", {
      maxRequestsPerMinute: 10,
      maxRequestsPerHour: 10,
      maxRequestsPerDay: 2,
    });
    const observedAt = new Date("2026-09-11T13:00:00Z");

    await provider.getFlightPlan("ONE1", observedAt);
    await provider.getFlightPlan("TWO2", observedAt);
    await expect(provider.getFlightPlan("THREE3", observedAt)).rejects.toThrow("FlightAware local day request budget exhausted");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(provider.getDiagnostics()).toMatchObject({ requests: 2, rateLimited: 1, limitPerDay: 2 });
  });

  it("does not cache an incomplete plan when the fallback route request fails", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/route")) return new Response("upstream error", { status: 500 });
      return new Response(JSON.stringify({
        flights: [{
          ident: "FAILROUTE",
          fa_flight_id: "FAILROUTE-20260911-test",
          scheduled_out: "2026-09-11T12:00:00Z",
          scheduled_in: "2026-09-11T14:00:00Z",
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new FlightAwareFlightPlanProvider("secret-test-key", {
      maxRequestsPerMinute: 10,
      maxRequestsPerHour: 10,
      maxRequestsPerDay: 10,
    });
    const service = new EnrichmentService({ flightPlan: provider });
    const target = normalizeAircraft(
      { hex: "abc123", flight: "FAILROUTE", lat: 50, lon: 14 },
      { lat: 50, lon: 14, name: "Test" },
    );
    if (!target) throw new Error("test aircraft could not be normalized");
    const observedAt = new Date("2026-09-11T13:00:00Z");

    expect(await service.getFlightPlanOnDemand(target, observedAt)).toBeNull();
    expect(await service.getFlightPlanOnDemand(target, observedAt)).toBeNull();

    // Each attempt performs ident + fallback route again. If the failed
    // fallback had been positively or negatively cached, this would stay at 2.
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(provider.getDiagnostics()).toMatchObject({ requests: 4, failures: 2 });
  });

  it("tracks upstream failures without exposing the API key", async () => {
    const fetchMock = vi.fn(async () => new Response("upstream error", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new FlightAwareFlightPlanProvider("never-expose-this-key");

    await expect(provider.getFlightPlan("FAIL1", new Date("2026-09-11T13:00:00Z"))).rejects.toThrow("HTTP 500");

    const diagnostics = provider.getDiagnostics();
    expect(diagnostics).toMatchObject({ requests: 1, failures: 1, rateLimited: 0 });
    expect(JSON.stringify(diagnostics)).not.toContain("never-expose-this-key");
  });
});
