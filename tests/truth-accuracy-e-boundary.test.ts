import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const file = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const readiness = file("lib/server/predictive-readiness.ts");
const report = file("lib/predictive-intelligence/truth-accuracy-e.ts");
const flightApi = file("app/api/admin/flights/[id]/evidence/route.ts");
const flightView = file("components/flight-evidence-e5.tsx");
const flightDetail = file("components/flight-detail.tsx");
const system = file("components/system-status-page.tsx");

describe("Stage E quality and privacy invariants", () => {
  it("reuses already cached bounded readiness cohort without new query", () => {
    expect(readiness).toContain("buildTruthAccuracyReport(trendSamples, { sourceAvailable: true, complete })");
    expect(readiness).toContain("truthAccuracy: buildTruthAccuracyReport([], { sourceAvailable: false, complete: false })");
    expect(report).not.toMatch(/getPrisma\s*\(|fetch\s*\(|setInterval\s*\(/);
    expect(report).toContain('"NO_AUTOMATIC_GRADUATION"');
    expect(system).toContain('data-testid="truth-accuracy-e"');
  });
  it("keeps historic SHADOW prediction audit strictly administrator-only", () => {
    expect(flightApi).toContain("isWatchlistSessionValid(request)");
    expect(flightApi).toContain('status: 401');
    expect(flightApi).toContain('Cache-Control": "private, no-store"');
    expect(flightApi).toContain(".limit(65)");
    expect(flightApi).toContain(".limit(33)");
    expect(flightApi).not.toContain("setInterval");
    expect(flightView).toContain("onClick={() => { void load(); }}");
    expect(flightView).toContain("credentials: \"same-origin\"");
    expect(flightDetail).toContain("<FlightEvidenceE5Panel flightId={flight.id} />");
  });
  it("does not alter readiness/public promotion or live aircraft ingest", () => {
    expect(report).not.toMatch(/process\.env|PUBLIC_ACTIVE|graduationMode|\.write\(/);
    expect(flightApi).not.toContain("/api/stream");
    expect(flightApi).not.toContain("getAircraftStateService");
    expect(flightApi).not.toContain("create(");
  });
});
