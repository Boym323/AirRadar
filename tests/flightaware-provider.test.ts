import { afterEach, describe, expect, it, vi } from "vitest";
import { FlightAwareFlightPlanProvider } from "@/lib/server/flightaware-provider";

describe("FlightAwareFlightPlanProvider cost guard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("bounds the ident lookup to one page and loads route fixes on demand", async () => {
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
      waypoints: ["VLM", "HDO"],
      source: "flightaware-aeroapi",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const identUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(identUrl.pathname).toBe("/aeroapi/flights/TEST123");
    expect(identUrl.searchParams.get("max_pages")).toBe("1");
    expect(provider.getDiagnostics()).toMatchObject({
      requests: 2,
      failures: 0,
      rateLimited: 0,
      limitPerMinute: 5,
      windowMs: 60_000,
    });
  });

  it("refuses upstream calls after the local per-minute budget is exhausted", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const callsign = new URL(String(input)).pathname.split("/").at(-1) ?? "UNKNOWN";
      return new Response(JSON.stringify({
        flights: [{
          ident: callsign,
          scheduled_out: "2026-09-11T12:00:00Z",
          scheduled_in: "2026-09-11T14:00:00Z",
          route: "DCT",
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new FlightAwareFlightPlanProvider("secret-test-key", { maxRequestsPerMinute: 2 });
    const observedAt = new Date("2026-09-11T13:00:00Z");

    await provider.getFlightPlan("ONE1", observedAt);
    await provider.getFlightPlan("TWO2", observedAt);
    await expect(provider.getFlightPlan("THREE3", observedAt)).rejects.toThrow("FlightAware local request budget exhausted");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(provider.getDiagnostics()).toMatchObject({
      requests: 2,
      failures: 0,
      rateLimited: 1,
      limitPerMinute: 2,
    });
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
