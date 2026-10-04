import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(new URL("../app/api/aircraft/[hex]/prediction/route.ts", import.meta.url), "utf8");
const advisorySource = readFileSync(new URL("../components/predictive-aircraft-advisories.tsx", import.meta.url), "utf8");
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

  it("uses one bounded prediction request without another stream or poller", () => {
    expect(advisorySource.match(/fetch\(/g)).toHaveLength(1);
    expect(advisorySource).toContain("/prediction");
    expect(advisorySource).not.toContain("new EventSource");
    expect(advisorySource).not.toContain("setInterval");
  });

  it("keeps one local one-shot expiry timer per predictive advisory", () => {
    expect(advisorySource).toContain('from "@/lib/predictive-intelligence/eta-advisory"');
    expect(advisorySource).toContain("ETA_ADVISORY_STALE_AFTER_MS");
    expect(advisorySource.match(/window\.setTimeout\(/g)).toHaveLength(3);
    expect(advisorySource.match(/window\.clearTimeout\(/g)).toHaveLength(3);
    expect(advisorySource).toContain("etaAdvisory: null");
    expect(advisorySource).toContain('state: "stale"');
  });

  it("mounts predictive advisories only on the existing aircraft detail surface", () => {
    expect(detailSource).toContain("PredictiveAircraftAdvisories");
    expect(detailSource).toContain("enabled={Boolean(liveAircraft");
    expect(advisorySource).toContain('data-testid="predictive-eta-advisory"');
  });

  it("suppresses stale public ETA at serialization as a second safety boundary", () => {
    expect(graduationSource).toContain('policy.ETA === "PUBLIC" && fresh');
    expect(graduationSource).toContain("estimatedArrivalAt > now");
  });
});
