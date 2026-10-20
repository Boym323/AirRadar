import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildNavigationReferenceInvestigation,
  parseNavigationReferenceInvestigation,
} from "@/lib/investigation-links";

describe("Navigation reference investigation links", () => {
  it("round-trips the retained NAVAID and ATS-route bookmarks", () => {
    const id = parseNavigationReferenceInvestigation("?id=vlm");
    expect(id).toEqual({ id: "VLM", route: null });
    expect(parseNavigationReferenceInvestigation("?" + buildNavigationReferenceInvestigation(id))).toEqual(id);
    const route = parseNavigationReferenceInvestigation("?route=l984");
    expect(route).toEqual({ id: null, route: "L984" });
    expect(parseNavigationReferenceInvestigation("?" + buildNavigationReferenceInvestigation(route))).toEqual(route);
  });

  it("fails closed on malformed identifiers", () => {
    expect(parseNavigationReferenceInvestigation("?id=%2Fetc%2Fpasswd&route=%2Fetc")).toEqual({ id: null, route: null });
  });

  it("restores browser history without persistence or duplicated queries", () => {
    const navigation = readFileSync(new URL("../components/navigation-reference-explorer.tsx", import.meta.url), "utf8");
    const helper = readFileSync(new URL("../lib/investigation-links.ts", import.meta.url), "utf8");
    expect(navigation).toContain('addEventListener("popstate"');
    expect(navigation).toContain("window.history.pushState");
    expect(navigation).toContain("window.history.replaceState");
    expect(navigation).toContain("parseNavigationReferenceInvestigation");
    expect(helper).not.toContain("fetch(");
    expect(helper).not.toContain("prisma");
    expect(helper).not.toContain("localStorage");
  });
});
