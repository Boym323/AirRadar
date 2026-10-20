import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const eta = readFileSync(new URL("../lib/predictive-intelligence/eta-advisory.ts", import.meta.url), "utf8");
const runway = readFileSync(new URL("../lib/predictive-intelligence/runway-advisory.ts", import.meta.url), "utf8");
const runwayChange = readFileSync(new URL("../lib/predictive-intelligence/runway-change-advisory.ts", import.meta.url), "utf8");
const trajectory = readFileSync(new URL("../lib/predictive-intelligence/trajectory-advisory.ts", import.meta.url), "utf8");
const api = readFileSync(new URL("../app/api/aircraft/[hex]/prediction/route.ts", import.meta.url), "utf8");
const sanitizer = readFileSync(new URL("../lib/predictive-intelligence/explainability.ts", import.meta.url), "utf8");

describe("Explainable Prediction V1 boundary", () => {
  it("keeps public evidence behind the existing PUBLIC + PASS advisory gates", () => {
    for (const source of [eta, runway, runwayChange, trajectory]) {
      expect(source).toContain('!== "PUBLIC"');
      expect(source).toContain('decision !== "PASS"');
      expect(source).toContain("explainablePredictionEvidence(");
    }
  });

  it("uses an explicit evidence whitelist and excludes internal reason diagnostics", () => {
    expect(sanitizer).toContain("const KEYS:");
    expect(sanitizer).toContain('"distanceRemainingNm"');
    expect(sanitizer).toContain('"surfaceWind"');
    expect(sanitizer).toContain('"crossTrackKm"');
    expect(sanitizer).not.toContain('"reason",');
  });

  it("keeps the legacy advisory API access bounded while public predictive UI is retired", () => {
    expect(api).toContain("buildPublicEtaAdvisory");
    expect(api).toContain("buildPublicRunwayAdvisory");
    expect(api).toContain("buildPublicTrajectoryAdvisory");
    expect(existsSync(new URL("../components/predictive-aircraft-advisories.tsx", import.meta.url))).toBe(false);
    const detail = readFileSync(new URL("../components/aircraft-detail-v3.tsx", import.meta.url), "utf8");
    expect(detail).not.toContain("PredictiveAircraftAdvisories");
    expect(detail).toContain("<AircraftAltitudeChart");
  });
});
