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
      expect(["EXPLICIT_ID_IN_REDUCTION_NOTES", "GROUP_LEVEL_ONLY", "INDIVIDUAL_SOURCE_RETIREMENT"]).toContain(item.reviewLevel);
      if (item.id === "T12") expect(item.assessment).toBe("LIVE_COLLECTION_DISABLED_HISTORIC_ARCHIVE_RETAINED");
    }
  });


  it("covers every selected ID with source-backed family witnesses without claiming one-to-one semantics", () => {
    const evidence = JSON.parse(readFileSync(new URL("docs/audits/SELECTED-FEATURE-KEEP-REMOVE-WITNESSES-2026-10-21.json", root), "utf8")) as {
      keepItems: Array<{id:string;witnessFiles:string[];level:string}>;
      removeItems: Array<{id:string;witnessFiles:string[];level:string}>;
    };
    expect(evidence.keepItems.map(x=>x.id)).toEqual(matrix.keepIds);
    expect(evidence.removeItems.map(x=>x.id)).toEqual(matrix.removeIds);
    for (const item of evidence.keepItems) {
      expect(item.level).toBe("FAMILY_RUNTIME_POSITIVE_ANCHORS");
      expect(item.witnessFiles.length).toBeGreaterThan(0);
      for (const file of item.witnessFiles) expect(existsSync(new URL(file, root)), file).toBe(true);
    }
  });

  it("recovers the exact original user-title mapping for all 90 REMOVE IDs without confusing names with implementation proof", () => {
    const source = JSON.parse(readFileSync(new URL("docs/audits/SELECTED-FEATURE-ORIGINAL-REMOVE-NAMES-2026-10-21.json", root), "utf8")) as {
      count:number; sourceDate:string; items:Array<{id:string;title:string;source:string}>;
    };
    const witnesses = JSON.parse(readFileSync(new URL("docs/audits/SELECTED-FEATURE-KEEP-REMOVE-WITNESSES-2026-10-21.json", root), "utf8")) as {
      originalTitleCount:number; remainingWithoutOriginalTitle:number;
      removeItems:Array<{id:string;recoveredTitle:string;originalPerIdImplementationVerified:boolean}>;
    };
    expect(source.count).toBe(90);
    expect(source.sourceDate).toBe("2026-10-21");
    expect(source.items.map(item=>item.id)).toEqual(matrix.removeIds);
    expect(source.items.every(item => item.title.length > 8 && item.source === "user-complete-178-item-inventory-2026-10-21")).toBe(true);
    expect(new Set(source.items.map(item=>item.title)).size).toBe(90);
    expect(witnesses.originalTitleCount).toBe(90);
    expect(witnesses.remainingWithoutOriginalTitle).toBe(0);
    for (let i=0; i<90; i++) {
      expect(witnesses.removeItems[i].id).toBe(source.items[i].id);
      expect(witnesses.removeItems[i].recoveredTitle).toBe(source.items[i].title);
      // Original names alone are not proof. Four removals have targeted regression
      // evidence; other one-to-one implementation mappings are not proven.
      const independentlyVerified = ["T04", "T05", "W11", "W12"].includes(source.items[i].id);
      expect(witnesses.removeItems[i].originalPerIdImplementationVerified).toBe(independentlyVerified);
    }
  });

  it("uses exact user-supplied titles for all 178 IDs and preserves earlier KEEP / REMOVE decisions", () => {
    const inventory = JSON.parse(readFileSync(new URL("docs/audits/SELECTED-FEATURE-CANONICAL-INVENTORY-2026-10-21.json", root), "utf8")) as {
      count: number; counts: {KEEP:number;REMOVE:number};
      items: Array<{id:string;title:string;decision:"KEEP"|"REMOVE";core:boolean}>;
    };
    const witnesses = JSON.parse(readFileSync(new URL("docs/audits/SELECTED-FEATURE-KEEP-REMOVE-WITNESSES-2026-10-21.json", root), "utf8")) as {
      originalKeepTitleCount: number; originalTitleCount: number;
      keepItems:Array<{id:string;originalIndividualName:string}>;
      removeItems:Array<{id:string;recoveredTitle:string}>;
    };
    expect(inventory.count).toBe(178);
    expect(inventory.counts).toEqual({KEEP:88,REMOVE:90});
    expect(inventory.items).toHaveLength(178);
    expect(new Set(inventory.items.map(item=>item.id)).size).toBe(178);
    expect(inventory.items.filter(x=>x.decision==="KEEP").map(x=>x.id)).toEqual(matrix.keepIds);
    expect(new Set(inventory.items.filter(x=>x.decision==="REMOVE").map(x=>x.id))).toEqual(new Set(matrix.removeIds));
    expect(witnesses.originalKeepTitleCount).toBe(88);
    expect(witnesses.originalTitleCount).toBe(90);
    const indexed = new Map(inventory.items.map(entry=>[entry.id,entry.title]));
    for (const item of witnesses.keepItems) expect(item.originalIndividualName).toBe(indexed.get(item.id));
    for (const item of witnesses.removeItems) expect(item.recoveredTitle).toBe(indexed.get(item.id));
    expect(indexed.get("P01")).toBe("Flight Intelligence – automatické události letu");
    expect(indexed.get("L01")).toBe("Watchlist – pravidla sledování letadel");
    expect(indexed.get("T01")).toBe("ATC sektory včetně geometrie a výškových hranic");
    expect(indexed.get("R17")).toBe("ATC sektory a vysílače přímo v mapě");
    const core = inventory.items.filter(x=>x.core);
    expect(core.map(x=>x.id)).toEqual(["J01","J05","J06","J07","J11","R01","O02","O11","O12","O15","U01"]);
    expect(core.every(x=>x.decision==="KEEP")).toBe(true);
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
    const output = execFileSync(process.execPath, [
      "--input-type=module",
      "--eval",
      "import { scanCodebase } from './scripts/code-metrics.mjs'; console.log(JSON.stringify(await scanCodebase()));",
    ], { encoding: "utf8" });
    const totals = JSON.parse(output) as {
      production: { files: number; loc: number };
      tests: { files: number; loc: number };
    };
    const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    console.info("AIRRADAR_AUDIT_CANONICAL_LOC " + JSON.stringify({ commit, ...totals }));
    expect(totals.production.files).toBeGreaterThan(0);
    expect(totals.production.loc).toBeGreaterThan(0);
  });
});
