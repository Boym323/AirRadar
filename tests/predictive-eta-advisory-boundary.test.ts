import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(new URL("../app/api/aircraft/[hex]/prediction/route.ts", import.meta.url), "utf8");
const detailSource = readFileSync(new URL("../components/aircraft-detail-v3.tsx", import.meta.url), "utf8");
const graduationSource = readFileSync(new URL("../lib/predictive-intelligence/graduation.ts", import.meta.url), "utf8");

describe("Predictive ETA Advisory V1 boundary", () => {
  it("keeps admin preview behind the existing authenticated session", () => {
    expect(routeSource).toContain("isWatchlistSessionValid(request)");
    expect(routeSource).toContain("admin && etaReadiness");
    expect(routeSource).toContain("buildAdminEtaAdvisoryPreview");
    expect(routeSource).toContain("...(adminPreview ? { adminPreview } : {})");
  });

  it("does not read readiness for ordinary all-SHADOW public requests", () => {
    expect(routeSource).toContain('admin || Object.values(configuredPolicy).some((status) => status === "PUBLIC")');
    expect(routeSource).toContain("readinessRequired ? await readPredictiveReadinessReport() : null");
  });

  it("keeps the retained aircraft detail free of rejected predictive advisories", () => {
    expect(detailSource).not.toContain("PredictiveAircraftAdvisories");
    expect(detailSource).not.toContain("AircraftOperationalTwin");
    expect(detailSource).toContain("<AircraftAltitudeChart");
  });

  it("suppresses stale public ETA at serialization as a second safety boundary", () => {
    expect(graduationSource).toContain('policy.ETA === "PUBLIC" && fresh');
    expect(graduationSource).toContain("estimatedArrivalAt > now");
  });
});
