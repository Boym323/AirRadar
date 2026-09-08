import { describe, expect, it, vi } from "vitest";
import { createShutdownCoordinator } from "@/lib/server/shutdown";

describe("shutdown coordinator", () => {
  it("runs cleanup once and concurrent calls join the same promise", async () => {
    const order: string[] = [];
    let release: (() => void) | undefined;
    const cleanup = {
      stopAircraft: vi.fn(() => new Promise<void>((resolve) => {
        order.push("aircraft");
        release = resolve;
      })),
      closeStatistics: vi.fn(async () => { order.push("statistics"); }),
      closeProvider: vi.fn(async () => { order.push("provider"); }),
      closeDatabase: vi.fn(async () => { order.push("database"); }),
    };
    const coordinator = createShutdownCoordinator(cleanup, 100);
    const first = coordinator.shutdown();
    const second = coordinator.shutdown();
    expect(first).toBe(second);
    release?.();
    await first;
    expect(order).toEqual(["aircraft", "statistics", "provider", "database"]);
    expect(cleanup.stopAircraft).toHaveBeenCalledOnce();
    expect(coordinator.getState()).toBe("COMPLETE");
  });

  it("continues after a hung phase within the shared budget", async () => {
    const cleanup = {
      stopAircraft: vi.fn(async () => undefined),
      closeStatistics: vi.fn(() => new Promise<void>(() => undefined)),
      closeProvider: vi.fn(async () => undefined),
      closeDatabase: vi.fn(async () => undefined),
    };
    const coordinator = createShutdownCoordinator(cleanup, 25);
    const started = Date.now();
    await coordinator.shutdown();
    expect(Date.now() - started).toBeLessThan(150);
    expect(cleanup.closeProvider).toHaveBeenCalledOnce();
    expect(cleanup.closeDatabase).toHaveBeenCalledOnce();
  });
});
