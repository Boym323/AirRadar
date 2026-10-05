import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const outcomeSource = readFileSync(new URL("../lib/operational-twin/event-outcome.ts", import.meta.url), "utf8");
const stateSource = readFileSync(new URL("../lib/server/aircraft-state.ts", import.meta.url), "utf8");
const situationSource = readFileSync(new URL("../lib/server/operational-twin.ts", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../app/api/admin/operational-twin/event-outcome/route.ts", import.meta.url), "utf8");
const corridorSource = readFileSync(new URL("../lib/operational-twin/corridor.ts", import.meta.url), "utf8");
const historySource = readFileSync(new URL("../lib/server/history.ts", import.meta.url), "utf8");

describe("Operational Digital Twin Event Outcome Validation V2 boundary", () => {
  it("keeps validation bounded, process-local and free of new I/O loops", () => {
    expect(outcomeSource).toContain("OPERATIONAL_TWIN_EVENT_OUTCOME_WINDOW_MINUTES = 24 * 60");
    expect(outcomeSource).toContain("MAX_PENDING = 6_000");
    expect(outcomeSource).not.toContain("getPrisma");
    expect(outcomeSource).not.toContain("FlightPosition");
    expect(outcomeSource).not.toContain("fetch(");
    expect(outcomeSource).not.toContain("EventSource");
    expect(outcomeSource).not.toContain("setInterval");
    expect(outcomeSource).not.toContain("setTimeout");
  });

  it("captures from the already-built situation and already-loaded ATC/SIGMET context", () => {
    expect(situationSource).toContain("captureOperationalTwinEventOutcome(situation");
    expect(situationSource).toContain("atcDataset: preparedDataset");
    expect(situationSource).toContain("sigmets");
    expect(situationSource).not.toContain("OperationalTwinEventOutcomeValidator");
  });

  it("uses only LOCAL receiver state and existing Flight Intelligence events as truth", () => {
    expect(stateSource).toContain("operationalTwinEventOutcome.observeLocal(this.localAircraft, now)");
    expect(stateSource).toContain("operationalTwinEventOutcome.observeIntelligence(events, snapshotAt)");
    expect(outcomeSource).toContain('truthSources: ["LOCAL_RECEIVER", "FLIGHT_INTELLIGENCE"]');
    expect(outcomeSource).not.toContain("networkAircraft");
  });

  it("does not modify the Digital Twin corridor implementation", () => {
    expect(corridorSource).not.toContain("event-outcome");
    expect(corridorSource).not.toContain("EventOutcome");
  });

  it("never feeds event validation into canonical state or history persistence", () => {
    expect(historySource).not.toContain("operationalTwinEventOutcome");
    expect(stateSource).not.toContain("this.aircraft.set(operationalTwinEventOutcome");
    expect(stateSource).not.toContain("recordAircraftSnapshot(this.operationalTwinEventOutcome");
  });

  it("keeps inspection admin-only, no-store, and explicitly avoids recall claims", () => {
    expect(routeSource).toContain("isWatchlistSessionValid(request)");
    expect(routeSource).toContain('"Cache-Control": "no-store"');
    expect(outcomeSource).toContain("recallMeasured: false");
  });
});
