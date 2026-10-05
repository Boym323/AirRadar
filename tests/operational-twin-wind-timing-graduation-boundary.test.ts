import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const eventOutcomeSource = readFileSync(new URL("../lib/operational-twin/event-outcome.ts", import.meta.url), "utf8");
const corridorSource = readFileSync(new URL("../lib/operational-twin/corridor.ts", import.meta.url), "utf8");
const situationSource = readFileSync(new URL("../lib/server/operational-twin.ts", import.meta.url), "utf8");
const systemStatusSource = readFileSync(new URL("../lib/server/system-status.ts", import.meta.url), "utf8");
const systemPageSource = readFileSync(new URL("../components/system-status-page.tsx", import.meta.url), "utf8");

describe("Digital Twin wind timing graduation V1 boundary", () => {
  it("uses the existing Event Outcome V2 truth lane instead of starting another observer", () => {
    expect(eventOutcomeSource).toContain("windTimingGraduation");
    expect(eventOutcomeSource).toContain("recordWindTimingObserved");
    expect(eventOutcomeSource).toContain("EVENT_OUTCOME_V2_LOCAL_WAYPOINT_TRUTH");
    expect(eventOutcomeSource).not.toContain("setInterval");
    expect(eventOutcomeSource).not.toContain("setTimeout");
    expect(eventOutcomeSource).not.toContain("getPrisma");
    expect(eventOutcomeSource).not.toContain("FlightPosition");
  });

  it("keeps stale wind shadow outside graduation evidence", () => {
    expect(eventOutcomeSource).toContain('shadow.status !== "AVAILABLE"');
  });

  it("never auto-promotes the shadow model or mutates canonical corridor timing", () => {
    expect(eventOutcomeSource).toContain("autoPromotion: false");
    expect(eventOutcomeSource).toContain("canonicalTimingRemainsActive: true");
    expect(corridorSource).not.toContain("windTimingGraduation");
    expect(corridorSource).not.toContain("manualPromotionEligible");
    expect(situationSource).not.toContain("manualPromotionEligible");
  });

  it("surfaces the paired graduation evidence through existing system diagnostics", () => {
    expect(systemStatusSource).toContain("operationalTwinEventOutcome: serviceDiagnostics.operationalTwinEventOutcome");
    expect(systemPageSource).toContain('data-testid="wind-timing-graduation"');
    expect(systemPageSource).toContain("canonicalMeanAbsoluteTimingErrorSeconds");
    expect(systemPageSource).toContain("shadowMeanAbsoluteTimingErrorSeconds");
    expect(systemPageSource).toContain("shadowWinRate");
  });
});
