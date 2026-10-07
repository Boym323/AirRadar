import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AlertDeliveryWorker } from "@/lib/server/alert-delivery-worker";

describe("Delivery Health V1", () => {
  it("exposes bounded durable worker diagnostics", () => {
    const worker = new AlertDeliveryWorker();
    const diagnostics = worker.diagnostics();
    expect(diagnostics).toMatchObject({
      running: false,
      activePoll: false,
      processed: 0,
      sent: 0,
      failed: 0,
      retried: 0,
      recoveredStale: 0,
      pollIntervalMs: 15_000,
      maxAttempts: 5,
    });
  });

  it("registers the durable worker with runtime startup and graceful shutdown", () => {
    const instrumentation = readFileSync(new URL("../instrumentation.node.ts", import.meta.url), "utf8");
    const shutdown = readFileSync(new URL("../lib/server/shutdown.ts", import.meta.url), "utf8");
    expect(instrumentation).toContain("getAlertDeliveryWorker().start()");
    expect(shutdown).toContain("getAlertDeliveryWorker().stop()");
  });

  it("keeps delivery-health access behind the existing admin session", () => {
    const route = readFileSync(new URL("../app/api/admin/alerts/delivery-health/route.ts", import.meta.url), "utf8");
    expect(route).toContain("isWatchlistSessionValid");
    expect(route).toContain('"Cache-Control": "no-store"');
  });
});
