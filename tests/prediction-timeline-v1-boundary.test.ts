import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const componentSource = readFileSync(
  new URL("../components/aircraft-operational-twin.tsx", import.meta.url),
  "utf8",
);
const serverSource = readFileSync(
  new URL("../lib/server/operational-twin.ts", import.meta.url),
  "utf8",
);
const eventSource = readFileSync(
  new URL("../lib/operational-twin/events.ts", import.meta.url),
  "utf8",
);
const csSource = readFileSync(new URL("../lib/i18n/cs.ts", import.meta.url), "utf8");

describe("Prediction Timeline V1 boundary", () => {
  it("reuses the existing Operational Twin request and adds no parallel fetch", () => {
    expect(componentSource).toContain('fetch(`/api/aircraft/${encodeURIComponent(icaoHex)}/situation`');
    expect(componentSource.match(/\/situation/g)?.length).toBe(1);
    expect(componentSource).toContain('data-testid="prediction-timeline-v1"');
  });

  it("renders NOW plus canonical future event semantics", () => {
    expect(componentSource).toContain('data-now="true"');
    expect(componentSource).toContain("data.aircraft.observedAt");
    expect(componentSource).toContain('data-event-type={event.type}');
    expect(componentSource).toContain("event.offsetMinutes");
    expect(componentSource).toContain("event.provenance");
    expect(componentSource).toContain("event.confidence");
    expect(componentSource).toContain("event.sourceReference");
    for (const type of [
      "WAYPOINT",
      "ATC_SECTOR_ENTRY",
      "SIGMET_INTERSECTION",
      "ARRIVAL_ETA",
      "RUNWAY_EXPECTATION",
      "TRAJECTORY_STATE",
    ]) {
      expect(eventSource).toContain(`type: "${type}"`);
    }
  });

  it("keeps public ETA, runway and trajectory readiness-gated on the server", () => {
    expect(serverSource).toContain("enforcePredictiveReadiness");
    expect(serverSource).toContain("buildPublicEtaAdvisory(state, effectivePolicy");
    expect(serverSource).toContain("buildPublicRunwayAdvisory(state, effectivePolicy");
    expect(serverSource).toContain("buildPublicTrajectoryAdvisory(state, effectivePolicy");
    expect(componentSource).toContain('data.limitations.includes("PUBLIC_PREDICTION_UNAVAILABLE")');
    expect(csSource).toContain("jen po splnění kontroly připravenosti");
  });

  it("preserves source, provenance and confidence instead of inventing new prediction evidence", () => {
    expect(componentSource).toContain("t.operationalTwin.provenance[event.provenance]");
    expect(componentSource).toContain("t.operationalTwin.confidence[event.confidence]");
    expect(componentSource).toContain("t.operationalTwin.predictionTimelineSource");
    expect(componentSource).not.toContain("getPredictiveState");
  });
});
