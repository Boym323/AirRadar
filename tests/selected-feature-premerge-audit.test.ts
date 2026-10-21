import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("selected feature premerge review", () => {
  it("verifies registered internal APIs, retained lifecycles and revised 79 KEEP / 99 REMOVE boundaries", () => {
    const raw = execFileSync(process.execPath, ["scripts/selected-feature-premerge-audit.mjs"], { encoding: "utf8" });
    const result = JSON.parse(raw) as { status: string; selection: {keep:number;remove:number};
      inspected: {sourceFiles:number;activeApis:number;retiredApis:number}; externalUpstreamReferences:Array<{file:string;url:string}>; failures:string[] };
    expect(result.selection).toMatchObject({keep:79,remove:99});
    expect(result.inspected.activeApis).toBe(52);
    expect(result.inspected.retiredApis).toBe(51);
    expect(result.inspected.sourceFiles).toBeGreaterThan(250);
    expect(result.externalUpstreamReferences.length).toBeGreaterThanOrEqual(3);
    expect(result.externalUpstreamReferences.every((r)=>r.url.startsWith("/api/data/"))).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.status).toBe("PASS");
  });
});
