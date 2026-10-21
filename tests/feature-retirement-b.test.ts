import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("retired standalone feature boundaries", () => {
  const root = new URL("../", import.meta.url);
  const exists = (path: string) => existsSync(new URL(path, root));

  it("does not expose retired page routes or page-owned modules", () => {
    for (const path of [
      "app/workspaces/page.tsx",
      "app/baselines/page.tsx",
      "app/events/page.tsx",
      "app/my-airradar/page.tsx",
      "app/discover/page.tsx",
      "app/routes/page.tsx",
      "app/routes/[origin]/[destination]/page.tsx",
      "app/journeys/page.tsx",
      "components/saved-workspaces.tsx",
      "components/historical-baselines.tsx",
      "components/aviation-event-feed.tsx",
      "components/my-airradar-home.tsx",
      "components/aircraft-discovery.tsx",
      "components/route-network-explorer.tsx",
      "components/route-network-detail.tsx",
      "components/followed-journeys.tsx",
      "components/follow-journey-button.tsx",
    ]) expect(exists(path), path).toBe(false);

    const registry = JSON.parse(readFileSync(new URL("docs/features.registry.json", root), "utf8")) as {
      features: Array<{ id: string }>;
    };
    const ids = new Set(registry.features.map(({ id }) => id));
    for (const id of ["saved-workspaces", "historical-baselines", "aviation-event-feed", "my-airradar-home", "aircraft-discovery", "route-network-explorer", "followed-journeys"]) {
      expect(ids.has(id), id).toBe(false);
    }
  });

  it("keeps shared event, logbook, and receiver-statistics APIs", () => {
    for (const path of [
      "app/api/logbook/summary/route.ts",
      "app/api/statistics/traffic/route.ts",
    ]) expect(exists(path), path).toBe(true);
  });

  it("keeps the retired Flight Intelligence events endpoint absent", () => {
    expect(exists("app/api/intelligence/events/route.ts")).toBe(false);
  });

  it("removes retired links from navigation and the aircraft detail action", () => {
    const shell = readFileSync(new URL("components/airradar-shell.tsx", root), "utf8");
    const palette = readFileSync(new URL("components/command-palette.tsx", root), "utf8");
    const detail = readFileSync(new URL("components/aircraft-detail-v3.tsx", root), "utf8");
    for (const path of ["/workspaces", "/baselines", "/events", "/my-airradar", "/discover", "/routes", "/journeys"]) {
      expect(shell).not.toContain(path);
      expect(palette).not.toContain(path);
    }
    expect(detail).not.toContain("FollowJourneyButton");
    expect(detail).not.toContain("/journeys");
  });

  it("does not retain localized metadata for retired pages", async () => {
    const { localizedPageMetadata } = await import("@/lib/i18n/page-metadata");
    for (const path of ["/workspaces", "/baselines", "/events", "/my-airradar", "/discover", "/routes", "/journeys"]) {
      expect(localizedPageMetadata(path, "en").title, path).toBeNull();
    }
  });
});
