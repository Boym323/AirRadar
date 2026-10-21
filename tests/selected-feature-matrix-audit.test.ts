import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const root = new URL("../", import.meta.url);
const matrix = JSON.parse(readFileSync(new URL("docs/audits/SELECTED-FEATURE-MATRIX-2026-10-19.json", root), "utf8")) as { keepIds: string[]; removeIds: string[] };
const audit = JSON.parse(readFileSync(new URL("docs/audits/SELECTED-FEATURE-ID-VERIFICATION-2026-10-21.json", root), "utf8")) as {
  records: Array<{ id: string; family: string; assessment: string; reviewLevel: string; evidenceSet: string }>;
  groups: Record<string, { retired: string[]; retained: string[]; context: string }>;
  deletedApiRoutes: string[];
  deletedPageEntrypoints: string[];
  preservedEndpoints: string[];
  auditedHead: string;
};

describe("selected-feature ID audit", () => {
  it("accounts for exactly the 90 rejected IDs without claiming unproved individual mappings", () => {
    const ids = audit.records.map((item) => item.id);
    expect(ids.length).toBe(90);
    expect(new Set(ids).size).toBe(90);
    expect(new Set(ids)).toEqual(new Set(matrix.removeIds));
    expect(new Set(matrix.keepIds).size).toBe(matrix.keepIds.length);
    for (const item of audit.records) {
      expect(item.family).toBe(item.id.slice(0, 1));
      expect(item.evidenceSet).toBe(item.family);
      expect(audit.groups[item.evidenceSet]?.context).toBeTruthy();
      expect(["EXPLICIT_ID_IN_REDUCTION_NOTES", "GROUP_LEVEL_ONLY"]).toContain(item.reviewLevel);
      if (item.id === "T12") expect(item.assessment).toBe("INCOMPLETE_ACTIVE_SCHEDULED_FETCH");
    }
  });

  it("guards all explicitly retired page and API entrypoints", () => {
    expect(audit.deletedApiRoutes).toHaveLength(50);
    expect(audit.deletedPageEntrypoints).toHaveLength(21);
    for (const path of [...audit.deletedApiRoutes, ...audit.deletedPageEntrypoints]) {
      expect(existsSync(new URL(path, root)), path).toBe(false);
    }
  });

  it("preserves selected core API contracts and shared family dependencies", () => {
    for (const path of audit.preservedEndpoints) expect(existsSync(new URL(path, root)), path).toBe(true);
    for (const group of Object.values(audit.groups)) {
      for (const path of group.retired) expect(existsSync(new URL(path, root)), path).toBe(false);
      for (const path of group.retained) expect(existsSync(new URL(path, root)), path).toBe(true);
    }
  });

  it("captures the canonical tracked nonempty production LOC without equating it to PR diff", async () => {
    // @ts-ignore: canonical metrics script is a JavaScript module without TypeScript declarations.
    const { scanCodebase } = await import("../scripts/code-metrics.mjs");
    const totals = await scanCodebase();
    const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    console.info("AIRRADAR_AUDIT_CANONICAL_LOC " + JSON.stringify({ commit, ...totals }));
    expect(totals.production.files).toBeGreaterThan(0);
    expect(totals.production.loc).toBeGreaterThan(0);
  });
});
