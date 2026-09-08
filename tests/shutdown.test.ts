import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { shouldRegisterInstrumentation } from "@/instrumentation";
import { createShutdownCoordinator } from "@/lib/server/shutdown";
import { registerShutdownCoordinator } from "@/lib/server/shutdown";

const shutdownGlobals = globalThis as typeof globalThis & { airRadarShutdownRegistered?: boolean };

afterEach(() => {
  delete shutdownGlobals.airRadarShutdownRegistered;
});

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

  it("registers signal handlers once and invokes shutdown from SIGTERM", async () => {
    const handlers = new Map<NodeJS.Signals, () => void>();
    const shutdown = vi.fn(async () => undefined);
    const once = vi.fn((signal: NodeJS.Signals, handler: () => void) => {
      handlers.set(signal, handler);
      return signalProcess;
    });
    const signalProcess = {
      pid: 4321,
      ppid: 4310,
      listeners: vi.fn(() => []),
      removeListener: vi.fn(),
      once,
      kill: vi.fn(),
    } as unknown as NodeJS.Process;
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    registerShutdownCoordinator(signalProcess, shutdown);
    registerShutdownCoordinator(signalProcess, shutdown);
    await handlers.get("SIGTERM")?.();
    await vi.waitFor(() => expect(signalProcess.kill).toHaveBeenCalledWith(4321, "SIGTERM"));

    expect(once).toHaveBeenCalledTimes(2);
    expect(shutdown).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledWith("[shutdown] coordinator registered pid=4321 ppid=4310");
    expect(info).not.toHaveBeenCalledWith(expect.stringContaining("DATABASE_URL"));
    info.mockRestore();
  });

  it("accepts only the Node.js runtime outside the production build", () => {
    expect(shouldRegisterInstrumentation("nodejs", "phase-production-server")).toBe(true);
    expect(shouldRegisterInstrumentation("edge", "phase-production-server")).toBe(false);
    expect(shouldRegisterInstrumentation(undefined, "phase-production-server")).toBe(false);
    expect(shouldRegisterInstrumentation("nodejs", "phase-production-build")).toBe(false);
  });

  it("keeps Next from installing a competing production signal owner", () => {
    const service = readFileSync(new URL("../deploy/airradar.service", import.meta.url), "utf8");
    const wrapper = readFileSync(new URL("../scripts/start-production.mjs", import.meta.url), "utf8");
    expect(service).toContain("Environment=NEXT_MANUAL_SIG_HANDLE=1");
    expect(service).toContain("ExecStart=/usr/bin/node /var/www/airradar/scripts/start-production.mjs start");
    expect(service).toContain("TimeoutStopSec=20");
    expect(service).toContain("KillMode=control-group");
    expect(service).toContain("KillSignal=SIGTERM");
    expect(wrapper).toContain('process.env.NEXT_RUNTIME = "nodejs"');
    expect(wrapper).toContain("../.next/server/instrumentation.js");
    expect(wrapper).toContain("next/dist/bin/next");
  });
});
