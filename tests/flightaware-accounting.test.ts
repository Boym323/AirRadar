import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FlightAwareFlightPlanProvider } from "@/lib/server/flightaware-provider";
import { FlightAwareUsageLedger } from "@/lib/server/flightaware-usage";

function path(): string { return join(mkdtempSync(join(tmpdir(), "airradar-fa-")), "usage.json"); }
function response(route = false): Response { return new Response(JSON.stringify(route ? { fixes: [{ name: "ABC" }] } : { flights: [{ ident: "TEST1", fa_flight_id: "id", scheduled_out: "2026-01-01T00:00:00Z", scheduled_in: "2026-01-01T01:00:00Z", route: "DCT ABC" }] }), { status: 200 }); }

describe("FlightAware persistent accounting", () => {
  it("preserves events across recreation and serializes rapid appends", async () => {
    const file = path(); const ledger = new FlightAwareUsageLedger(file);
    await Promise.all(Array.from({ length: 25 }, (_, i) => Promise.resolve().then(() => ledger.append({ timestamp: new Date(1700000000000 + i).toISOString(), endpointClass: "flight", requestCount: 1, resultSetsEstimated: 1, estimatedCostUsd: 0.005, success: true, httpStatusCategory: "2xx" }))));
    await ledger.flush(); const recreated = new FlightAwareUsageLedger(file);
    expect(JSON.parse(readFileSync(file, "utf8"))).toHaveLength(25);
    expect(recreated.sum(0)).toBeCloseTo(0.125);
  });

  it.each(["{broken", "", "{\"timestamp\":"])("fails closed for corrupted ledger (%s)", (content) => {
    const file = path(); writeFileSync(file, content);
    expect(new FlightAwareUsageLedger(file).isHealthy()).toBe(false);
  });

  it("allows one of two different concurrent flights at an exact monthly budget", async () => {
    const file = path(); let calls = 0; vi.stubGlobal("fetch", vi.fn(async () => { calls += 1; return response(); }));
    const provider = new FlightAwareFlightPlanProvider("secret-marker", { ledgerPath: file, maxCostUsdPerMonth: 0.005 });
    const results = await Promise.allSettled([provider.getFlightPlan("TEST1", new Date("2026-01-01T00:30:00Z")), provider.getFlightPlan("TEST2", new Date("2026-01-01T00:30:00Z"))]);
    expect(calls).toBe(1); expect(results.filter((r) => r.status === "fulfilled" && r.value).length).toBe(1); expect(provider.getReservationCostForTest()).toBe(0); vi.unstubAllGlobals();
  });
});
