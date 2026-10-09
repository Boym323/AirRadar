import { describe, expect, it } from "vitest";
import { inspectPrismaTableMappings } from "../scripts/audit-prisma-rc-mapping.mjs";
import { readFileSync } from "node:fs";
describe("Prisma RC schema safety check", () => {
  it("requires explicit maps and a verified external table catalog", () => {
    const source = 'model Flight {\n id Int @id\n @@map("flight")\n}\nmodel Aircraft {\n id Int @id\n}\n';
    const unverified = inspectPrismaTableMappings(source);
    expect(unverified).toMatchObject({totalModels:2,explicitMappings:1,compatibilityVerified:false});
    expect(unverified.models[1]).toMatchObject({model:"Aircraft",legacyCandidate:"aircraft"});
    expect(inspectPrismaTableMappings(source, ["flight", "aircraft"]).compatibilityVerified).toBe(false);
    expect(inspectPrismaTableMappings(source.replace("model Aircraft {\n id Int @id", 'model Aircraft {\n id Int @id\n @@map("aircraft")'), ["flight", "aircraft"]).compatibilityVerified).toBe(true);
  });
  it("flags table-name collisions and refuses guessed production compatibility", () => {
    const source = 'model Flight {\n id Int @id\n @@map("flight")\n}\nmodel Flight2 {\n id Int @id\n @@map("flight")\n}\n';
    expect(inspectPrismaTableMappings(source, ["flight"]).compatibilityVerified).toBe(false);
    expect(inspectPrismaTableMappings(source, ["flight"]).duplicates).toContain("flight");
  });
  it("marks the current prerelease contract as unverified without table catalog", () => {
    const source = readFileSync(new URL("../prisma/contract.prisma", import.meta.url), "utf8");
    const report = inspectPrismaTableMappings(source);
    expect(report.totalModels).toBeGreaterThan(20);
    expect(report.compatibilityVerified).toBe(false);
    expect(report.catalogProvided).toBe(false);
  });
});
