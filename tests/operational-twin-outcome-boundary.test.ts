import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const outcomeSource = readFileSync(new URL("../lib/operational-twin/outcome.ts", import.meta.url), "utf8");
const stateSource = readFileSync(new URL("../lib/server/aircraft-state.ts", import.meta.url), "utf8");
const situationSource = readFileSync(new URL("../lib/server/operational-twin.ts", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../app/api/admin/operational-twin/outcome/route.ts", import.meta.url), "utf8");
const historySource = readFileSync(new URL("../lib/server/history.ts", import.meta.url), "utf8");
const systemStatusSource = readFileSync(new URL("../lib/server/system-status.ts", import.meta.url), "utf8");
const systemPageSource = readFileSync(new URL("../components/system-status-page.tsx", import.meta.url), "utf8");

describe("Operational Digital Twin Outcome Validation V1 boundary", () => {
  it("uses bounded request-driven in-memory prospective validation", () => {
    expect(outcomeSource).toContain("OPERATIONAL_TWIN_OUTCOME_HORIZONS_MINUTES = [5, 15, 30]");
    expect(outcomeSource).toContain("OPERATIONAL_TWIN_OUTCOME_WINDOW_MINUTES = 24 * 60");
    expect(outcomeSource).toContain("MAX_PENDING = 5_000");
    expect(outcomeSource).not.toContain("getPrisma");
    expect(outcomeSource).not.toContain("FlightPosition");
    expect(outcomeSource).not.toContain("fetch(");
    expect(outcomeSource).not.toContain("EventSource");
    expect(outcomeSource).not.toContain("setInterval");
    expect(outcomeSource).not.toContain("setTimeout");
  });

  it("captures only after the existing situation has already been built", () => {
    expect(situationSource).toContain("const situation = buildOperationalTwinSituation");
    expect(situationSource).toContain("service.captureOperationalTwinOutcome(situation)");
    expect(situationSource).not.toContain("OperationalTwinOutcomeValidator");
  });

  it("resolves only against live LOCAL receiver state and never network truth", () => {
    expect(stateSource).toContain("this.operationalTwinOutcome.observeTruth(this.localAircraft, now)");
    expect(outcomeSource).toContain('truthSource: "LOCAL_RECEIVER"');
    expect(outcomeSource).not.toContain("network");
    expect(outcomeSource).not.toContain("mergeAircraft");
  });

  it("never feeds outcome validation into canonical state or history persistence", () => {
    expect(historySource).not.toContain("operationalTwinOutcome");
    expect(stateSource).not.toContain("recordAircraftSnapshot(this.operationalTwinOutcome");
    expect(stateSource).not.toContain("this.aircraft.set(operationalTwinOutcome");
  });

  it("surfaces the bounded report only through admin diagnostics", () => {
    expect(systemStatusSource).toContain("operationalTwinOutcome: serviceDiagnostics.operationalTwinOutcome");
    expect(systemPageSource).toContain('data-testid="operational-twin-outcome-validation"');
    expect(systemPageSource).toContain("uncertaintyCoverage");
    expect(systemPageSource).toContain("meanErrorToUncertaintyRatio");
  });

  it("keeps outcome inspection admin-only and no-store", () => {
    expect(routeSource).toContain("isWatchlistSessionValid(request)");
    expect(routeSource).toContain('"Cache-Control": "no-store"');
  });
});
