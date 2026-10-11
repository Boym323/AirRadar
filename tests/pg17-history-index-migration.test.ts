import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("../deploy/sql/pg17-flight-history-index.sql", import.meta.url), "utf8");
const contract = readFileSync(new URL("../prisma/contract.prisma", import.meta.url), "utf8");
const migration = readFileSync(new URL("../migrations/app/20261011T1656_atc_dataset_version/migration.ts", import.meta.url), "utf8");
const migrationOps = readFileSync(new URL("../migrations/app/20261011T1656_atc_dataset_version/ops.json", import.meta.url), "utf8");
const operations = JSON.parse(migrationOps) as Array<{ id: string }>;

describe("PostgreSQL 17 flight history index migration", () => {
  it("keeps the index in the source contract under the production name", () => {
    expect(contract).toContain("@@index([aircraftId, lastSeenAt], map: \"flight_aircraftId_lastSeenAt_desc_idx\")");
  });

  it("uses an idempotent concurrent operational DDL statement", () => {
    expect(sql).toMatch(/CREATE INDEX CONCURRENTLY IF NOT EXISTS/);
    expect(sql).toContain('ON public."flight" ("aircraftId", "lastSeenAt" DESC)');
    expect(sql).toContain("existing index has wrong definition or is invalid");
    expect(sql).toContain("equivalent index exists under another name");
    expect(sql).not.toMatch(/^\s*BEGIN\s*;\s*$/m);
    expect(sql).not.toMatch(/^\s*COMMIT\s*;\s*$/m);
    expect(sql).toContain("MANUAL DBA CHANGE ONLY");
  });

  it("does not put blocking index DDL in the transactional automatic migration", () => {
    expect(migration).not.toMatch(/CREATE INDEX(?! CONCURRENTLY)/i);
    expect(migrationOps).not.toContain("flight_aircraftId_lastSeenAt_desc_idx");
    expect(migration).toContain("atcDatasetVersion");
    expect(operations.map((operation) => operation.id)).toEqual([
      "table.atcDatasetVersion",
      "data.atcDatasetVersion.bootstrap",
    ]);
  });
});
