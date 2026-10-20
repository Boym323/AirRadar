import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Retired rule-based APIs must not return after the L01-L10/L13-L15 removal.
// Historical database tables are preserved; this test only checks app boundaries.
const file = (relative: string) => new URL(`../${relative}`, import.meta.url);

describe("retired Alert/Fleet/Watchlist API boundaries", () => {
  it("does not ship the retired rule-based endpoints", () => {
    const retired = [
      "app/api/admin/alerts/analytics/route.ts",
      "app/api/admin/alerts/delivery/route.ts",
      "app/api/admin/alerts/fleets/[id]/matchers/[matcherId]/route.ts",
      "app/api/admin/alerts/fleets/[id]/matchers/route.ts",
      "app/api/admin/alerts/fleets/[id]/route.ts",
      "app/api/admin/alerts/fleets/route.ts",
      "app/api/admin/alerts/geofences/[id]/route.ts",
      "app/api/admin/alerts/geofences/route.ts",
      "app/api/admin/alerts/history/route.ts",
      "app/api/admin/alerts/rules/[id]/route.ts",
      "app/api/admin/alerts/rules/route.ts",
      "app/api/admin/alerts/simulator/route.ts",
      "app/api/alerts/route.ts",
      "app/api/watchlist/[id]/route.ts",
      "app/api/watchlist/activity/route.ts",
      "app/api/watchlist/route.ts"
];
    for (const path of retired) expect(existsSync(file(path)), path).toBe(false);
  });

  it("keeps Web Push, Pushover, durable delivery and system session authentication", () => {
    for (const path of [
      "app/api/push/subscribe/route.ts",
      "app/api/push/vapid-public-key/route.ts",
      "app/api/admin/alerts/delivery-health/route.ts",
      "app/api/watchlist/session/route.ts",
      "lib/server/alert-delivery-worker.ts",
      "lib/server/alerts-fleets-repository.ts",
      "lib/server/web-push.ts",
      "lib/server/web-push-store.ts",
      "lib/server/watchlist-auth.ts",
    ]) expect(existsSync(file(path)), path).toBe(true);

    const state = readFileSync(file("lib/server/aircraft-state.ts"), "utf8");
    expect(state).toContain("getAlertDeliveryWorker().start()");
    expect(state).toContain("getAlertDeliveryWorker().stop()");
    expect(state).not.toContain("this.alerts.observe(");
    expect(state).not.toContain("this.alerts.observeNewAircraft(");
    expect(state).not.toContain("snapshot.alerts");
    const repository = readFileSync(file("lib/server/alerts-fleets-repository.ts"), "utf8");
    for (const retired of ["saveRule(", "deleteRule(", "saveFleet(", "saveGeofence(", "recordOccurrence(", "loadConfig("]) expect(repository).not.toContain(retired);
    for (const retained of ["claimDelivery(", "getOccurrenceForDelivery(", "markDeliverySent(", "markDeliveryFailure(", "recoverStaleDeliveries(", "deliveryHealthSnapshot(", "listOccurrenceHistory("]) expect(repository).toContain(retained);
    expect(existsSync(file("lib/server/alerts-fleets-v1.ts"))).toBe(false);
    for (const obsolete of ["lib/server/alert-config.ts", "lib/server/watchlist-store.ts", "lib/server/watchlist-api.ts"]) expect(existsSync(file(obsolete)), obsolete).toBe(false);
    expect(existsSync(file("lib/aircraft/watchlist.ts"))).toBe(true); // retained local-only radar filters
  });
});
