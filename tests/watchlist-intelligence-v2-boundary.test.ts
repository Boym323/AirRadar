import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboard = readFileSync(new URL("../components/watchlist-intelligence-v2.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../components/watchlist-page.tsx", import.meta.url), "utf8");
const activityApi = readFileSync(new URL("../app/api/watchlist/activity/route.ts", import.meta.url), "utf8");

describe("Watchlist Intelligence V2 boundary", () => {
  it("reuses the existing watchlist response and one bounded activity feed", () => {
    expect(page).toContain("<WatchlistIntelligenceV2 locale={locale} rules={rules} />");
    expect(dashboard).toContain('fetch("/api/watchlist/activity?page=0&pageSize=50"');
    expect(dashboard).not.toContain("getPrisma");
    expect(dashboard).not.toContain("/api/admin/");
  });

  it("does not introduce per-rule request fan-out", () => {
    expect(dashboard.match(/fetch\(/g)?.length).toBe(1);
    expect(dashboard).toContain("entry.ruleIds.includes(rule.id)");
    expect(activityApi).toContain("ruleIds");
  });

  it("summarizes current matches and bounded delivery outcomes", () => {
    expect(dashboard).toContain('rule.currentState.status === "matching"');
    expect(dashboard).toContain('item.notificationStatus === "delivered"');
    expect(dashboard).toContain('item.notificationStatus === "failed"');
    expect(dashboard).toContain('data-testid="watchlist-intelligence-v2"');
  });
});
