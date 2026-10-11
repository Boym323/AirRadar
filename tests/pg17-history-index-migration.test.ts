import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("../deploy/sql/pg17-flight-history-index.sql", import.meta.url), "utf8");
const contract = readFileSync(new URL("../prisma/contract.prisma", import.meta.url), "utf8");

describe("PostgreSQL 17 flight history index migration", () => {
  it("keeps the index in the source contract under the production name", () => {
    expect(contract).toContain("@@index([aircraftId, lastSeenAt], map: \"flight_aircraftId_lastSeenAt_desc_idx\")");
  });

  it("uses an idempotent concurrent operational DDL statement", () => {
    expect(sql).toMatch(/CREATE INDEX CONCURRENTLY IF NOT EXISTS/);
    expect(sql).toContain('ON public."flight" ("aircraftId", "lastSeenAt" DESC)');
    expect(sql).not.toMatch(/^\s*BEGIN\s*;\s*$/m);
    expect(sql).not.toMatch(/^\s*COMMIT\s*;\s*$/m);
    expect(sql).toContain("MANUAL DBA CHANGE ONLY");
  });
});
