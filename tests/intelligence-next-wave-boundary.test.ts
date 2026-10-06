import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const quickDetail = readFileSync(new URL("../components/aircraft-radar-quick-detail.tsx", import.meta.url), "utf8");
const focusSummary = readFileSync(new URL("../components/radar/radar-operational-focus-summary.tsx", import.meta.url), "utf8");
const focusChange = readFileSync(new URL("../lib/operational-twin/operational-focus-change.ts", import.meta.url), "utf8");
const operationsRoute = readFileSync(new URL("../app/api/operations/situation/route.ts", import.meta.url), "utf8");
const regionalQueue = readFileSync(new URL("../lib/operational-twin/regional-focus-queue.ts", import.meta.url), "utf8");
const operationsCenter = readFileSync(new URL("../components/radar/radar-operations-center.tsx", import.meta.url), "utf8");
const calibrationRoute = readFileSync(new URL("../app/api/admin/operational-twin/calibration/route.ts", import.meta.url), "utf8");
const calibrationCenter = readFileSync(new URL("../components/digital-twin-calibration-center.tsx", import.meta.url), "utf8");
const focusOutcome = readFileSync(new URL("../lib/operational-twin/operational-focus-outcome.ts", import.meta.url), "utf8");
const twinServer = readFileSync(new URL("../lib/server/operational-twin.ts", import.meta.url), "utf8");
const trajectoryShadow = readFileSync(new URL("../lib/operational-twin/trajectory-quality-shadow.ts", import.meta.url), "utf8");
const terminalOutlook = readFileSync(new URL("../lib/airport-intelligence/terminal-outlook-v1.ts", import.meta.url), "utf8");
const airportBoard = readFileSync(new URL("../components/airport-operations-board.tsx", import.meta.url), "utf8");

describe("Intelligence next-wave V1 boundaries", () => {
  it("derives focus changes only from already-loaded same-aircraft snapshots", () => {
    expect(quickDetail).toContain("previousOperationalFocusRef");
    expect(quickDetail).toContain("diffAircraftOperationalFocus(previous.focus, operationalFocus)");
    expect(focusSummary).toContain('data-testid="aircraft-operational-focus-changes"');
    expect(focusChange).not.toContain("fetch(");
  });

  it("builds regional focus queue from the existing attention read-model without provider fan-out", () => {
    expect(operationsRoute).toContain("buildRegionalFocusQueue(attention)");
    expect(operationsRoute).toContain("focusQueue");
    expect(operationsCenter).toContain('data-testid="regional-focus-queue"');
    expect(regionalQueue).toContain("NO_AIRCRAFT_FOCUS_PROVIDER_FANOUT");
    expect(regionalQueue).not.toContain("fetch(");
  });

  it("derives focus validation only from independent event outcome truth", () => {
    expect(calibrationRoute).toContain("buildOperationalFocusOutcomeReport(event)");
    expect(calibrationCenter).toContain('data-testid="calibration-operational-focus-outcome"');
    expect(focusOutcome).toContain("eventOutcome.byType.SIGMET_INTERSECTION");
    expect(focusOutcome).toContain("NO_FOCUS_SELF_VALIDATION");
    expect(focusOutcome).not.toContain("fetch(");
  });

  it("keeps trajectory quality as a shadow over canonical corridor", () => {
    expect(twinServer).toContain("buildOperationalTwinTrajectoryQualityShadow(state, corridor)");
    expect(trajectoryShadow).toContain("canonicalRemainsActive: true");
    expect(trajectoryShadow).toContain('"SHADOW_ONLY"');
    expect(trajectoryShadow).toContain('"SAME_HORIZONTAL_GEOMETRY_V1"');
    expect(trajectoryShadow).not.toContain("fetch(");
  });

  it("builds Terminal Outlook from existing airport read-models without another request", () => {
    expect(airportBoard).toContain("buildAirportTerminalOutlook");
    expect(airportBoard).toContain('data-testid="airport-terminal-outlook-v1"');
    expect(terminalOutlook).toContain("arrivalFlow:");
    expect(terminalOutlook).toContain("flowPressure:");
    expect(terminalOutlook).toContain("runwayFlow:");
    expect(terminalOutlook).not.toContain("fetch(");
  });
});
