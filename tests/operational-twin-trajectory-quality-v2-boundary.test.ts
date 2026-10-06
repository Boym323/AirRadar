import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const serverSource = readFileSync(new URL("../lib/server/operational-twin.ts", import.meta.url), "utf8");
const qualitySource = readFileSync(new URL("../lib/operational-twin/trajectory-quality-v2.ts", import.meta.url), "utf8");
const typesSource = readFileSync(new URL("../lib/operational-twin/types.ts", import.meta.url), "utf8");

describe("Operational Digital Twin Trajectory Quality V2 boundary", () => {
  it("keeps the canonical corridor as the input to weather and event intelligence", () => {
    expect(serverSource).toContain("buildWeatherCorridorIntelligence({\n    corridor,");
    expect(serverSource).toContain("buildOperationalTwinEvents({");
    expect(serverSource).toContain("corridor,");
    expect(serverSource).not.toContain("weatherCorridor = buildWeatherCorridorIntelligence({\n    corridor: trajectoryQualityV2");
  });

  it("exposes the V2 profile additively without promotion", () => {
    expect(typesSource).toContain("trajectoryQualityV2?: OperationalTwinTrajectoryQualityV2");
    expect(serverSource).toContain("situation.trajectoryQualityV2 = trajectoryQualityV2");
    expect(qualitySource).toContain("canonicalRemainsActive: true");
    expect(qualitySource).toContain("autoPromotion: false");
  });

  it("adds no provider, network request or persistence path", () => {
    expect(qualitySource).not.toContain("fetch(");
    expect(qualitySource).not.toContain("setInterval");
    expect(qualitySource).not.toContain("prisma");
    expect(qualitySource).toContain('"HORIZONTAL_PATH_UNCHANGED"');
    expect(qualitySource).toContain('"NOT_FMS_INTENT"');
  });
});
