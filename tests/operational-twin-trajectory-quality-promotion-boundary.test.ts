import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const serverSource = readFileSync(new URL("../lib/server/operational-twin.ts", import.meta.url), "utf8");
const promotionSource = readFileSync(
  new URL("../lib/operational-twin/trajectory-quality-promotion.ts", import.meta.url),
  "utf8",
);
const configSource = readFileSync(new URL("../lib/server/config.ts", import.meta.url), "utf8");
const envSource = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
const typesSource = readFileSync(new URL("../lib/operational-twin/types.ts", import.meta.url), "utf8");
const panelSource = readFileSync(new URL("../components/aircraft-operational-twin.tsx", import.meta.url), "utf8");

describe("Trajectory Quality Promotion V1 boundaries", () => {
  it("is explicit opt-in and defaults to canonical", () => {
    expect(configSource).toContain("AIRRADAR_DIGITAL_TWIN_TRAJECTORY_QUALITY_POLICY");
    expect(configSource).toContain('"TRAJECTORY_QUALITY_V2"');
    expect(configSource).toContain(': "CANONICAL"');
    expect(envSource).toContain("AIRRADAR_DIGITAL_TWIN_TRAJECTORY_QUALITY_POLICY=CANONICAL");
  });

  it("captures canonical calibration before applying presentation promotion", () => {
    const captureAt = serverSource.indexOf("captureOperationalTwinTrajectoryQualityOutcome(situation)");
    const promotionAt = serverSource.indexOf("applyOperationalTwinTrajectoryQualityPromotion({");
    expect(captureAt).toBeGreaterThan(-1);
    expect(promotionAt).toBeGreaterThan(captureAt);
    expect(serverSource).toContain("corridor: situation.corridor");
    expect(serverSource).toContain("corridor: trajectoryPromotion.corridor");
  });

  it("keeps weather, event and ATC semantics on the canonical corridor", () => {
    const promotionAt = serverSource.indexOf("applyOperationalTwinTrajectoryQualityPromotion({");
    expect(serverSource.indexOf("buildWeatherCorridorIntelligence({")).toBeLessThan(promotionAt);
    expect(serverSource.indexOf("buildOperationalTwinEvents({")).toBeLessThan(promotionAt);
    expect(serverSource).toContain("downstream weather/event/ATC semantics");
    expect(promotionSource).toContain('"CORRIDOR_ALTITUDE_PRESENTATION_ONLY"');
    expect(promotionSource).toContain("downstreamSemanticsRemainCanonical: true");
  });

  it("fails closed and cannot change horizontal geometry", () => {
    expect(promotionSource).toContain('"graduation_not_pass"');
    expect(promotionSource).toContain('"trajectory_quality_unavailable"');
    expect(promotionSource).toContain('"geometry_mismatch"');
    expect(promotionSource).toContain("sameHorizontalGeometry");
    expect(promotionSource).toContain("altitudeFt: input.trajectoryQualityV2.points[index]!.altitudeFt");
    expect(promotionSource).not.toContain("fetch(");
    expect(promotionSource).not.toContain("setInterval(");
    expect(promotionSource).not.toContain("setTimeout(");
    expect(promotionSource).not.toContain("getPrisma");
  });

  it("exposes per-request promotion diagnostics without auto-promotion", () => {
    expect(typesSource).toContain("trajectoryQualityPromotion?:");
    expect(typesSource).toContain('"operational-digital-twin-trajectory-quality-promotion-v1"');
    expect(typesSource).toContain("canonicalCalibrationRemainsActive: true");
    expect(typesSource).toContain("horizontalGeometryUnchanged: true");
    expect(panelSource).toContain('data-testid="operational-twin-trajectory-quality-promotion-v1"');
    expect(panelSource).toContain("trajectoryQualityPromotion.effectivePolicy");
    expect(promotionSource).not.toContain("process.env");
  });
});
