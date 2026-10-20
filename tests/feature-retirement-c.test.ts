import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Batch C feature retirement", () => {
  it("removes the Spotter page and Saved Spots API while retaining shared logbook APIs", () => {
    expect(existsSync(new URL("../app/spotter/page.tsx", import.meta.url))).toBe(false);
    expect(existsSync(new URL("../app/api/admin/spotter/saved-spots/route.ts", import.meta.url))).toBe(false);
    expect(existsSync(new URL("../app/api/logbook/summary/route.ts", import.meta.url))).toBe(true);
    const registry = JSON.parse(readFileSync(new URL("../docs/features.registry.json", import.meta.url), "utf8"));
    expect(registry.features.some((feature: { id: string }) => feature.id === "mobile-spotter-mode")).toBe(false);
  });

  it("retains browser security while retiring alert/geofence rule evaluation", () => {
    const config = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
    expect(config).toContain("camera=(), geolocation=(self)");
    expect(existsSync(new URL("../lib/server/alerts-fleets-v1.ts", import.meta.url))).toBe(false);
  });
});
