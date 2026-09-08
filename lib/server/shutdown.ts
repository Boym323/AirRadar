import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { closePrisma } from "@/lib/server/db";

export const SHUTDOWN_BUDGET_MS = 10_000;
export type ShutdownState = "RUNNING" | "SHUTTING_DOWN" | "COMPLETE";

type Cleanup = {
  stopAircraft: (deadline: number) => Promise<void>;
  closeStatistics: () => Promise<void>;
  closeProvider: () => Promise<void>;
  closeDatabase: () => Promise<void>;
};

export function createShutdownCoordinator(cleanup: Cleanup, budgetMs = SHUTDOWN_BUDGET_MS) {
  let state: ShutdownState = "RUNNING";
  let shutdownPromise: Promise<void> | null = null;

  const phase = async (name: string, operation: () => Promise<void>, deadline: number): Promise<void> => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      console.warn(`[shutdown] ${name} timed out`);
      void operation().catch((error) => console.warn(`[shutdown] ${name} failed`, error instanceof Error ? error.message : error));
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      await Promise.race([
        operation(),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, remaining);
        }),
      ]);
      if (Date.now() >= deadline) console.warn(`[shutdown] ${name} timed out`);
    } catch (error) {
      console.warn(`[shutdown] ${name} failed`, error instanceof Error ? error.message : error);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const shutdown = (): Promise<void> => {
    if (shutdownPromise) return shutdownPromise;
    state = "SHUTTING_DOWN";
    const startedAt = Date.now();
    const deadline = startedAt + budgetMs;
    shutdownPromise = (async () => {
      console.info("[shutdown] stopping aircraft state");
      console.info("[shutdown] draining history");
      await phase("aircraft state stop", () => cleanup.stopAircraft(deadline), deadline);
      console.info("[shutdown] closing statistics");
      await phase("statistics close", cleanup.closeStatistics, deadline);
      console.info("[shutdown] closing provider");
      await phase("provider close", cleanup.closeProvider, deadline);
      console.info("[shutdown] closing database");
      await phase("database close", cleanup.closeDatabase, deadline);
      state = "COMPLETE";
      console.info(`[shutdown] complete in ${Date.now() - startedAt}ms`);
    })();
    return shutdownPromise;
  };

  return {
    shutdown,
    getState: () => state,
    getShutdownPromise: () => shutdownPromise,
  };
}

const globalForShutdown = globalThis as unknown as {
  airRadarShutdown?: ReturnType<typeof createShutdownCoordinator>;
  airRadarShutdownRegistered?: boolean;
};

export function getShutdownCoordinator() {
  globalForShutdown.airRadarShutdown ??= createShutdownCoordinator({
    stopAircraft: (deadline) => getAircraftStateService().stop({ deadline, closeStatistics: false, closeProvider: false }),
    closeStatistics: () => getAircraftStateService().closeStatistics(),
    closeProvider: () => getAircraftStateService().closeProvider(),
    closeDatabase: closePrisma,
  });
  return globalForShutdown.airRadarShutdown;
}

export function shutdown(): Promise<void> {
  return getShutdownCoordinator().shutdown();
}

export function registerShutdownCoordinator(): void {
  if (globalForShutdown.airRadarShutdownRegistered) return;
  globalForShutdown.airRadarShutdownRegistered = true;
  // Next's production start-server installs SIGTERM/SIGINT handlers which
  // call process.exit(0). Take ownership so application cleanup can finish;
  // the signal is re-delivered after cleanup below.
  for (const listener of process.listeners("SIGTERM")) process.removeListener("SIGTERM", listener);
  for (const listener of process.listeners("SIGINT")) process.removeListener("SIGINT", listener);
  const handleSignal = (signal: NodeJS.Signals) => {
    console.info(`[shutdown] received ${signal}`);
    void shutdown().then(() => {
      process.removeListener("SIGTERM", onSigterm);
      process.removeListener("SIGINT", onSigint);
      process.kill(process.pid, signal);
    });
  };
  const onSigterm = () => handleSignal("SIGTERM");
  const onSigint = () => handleSignal("SIGINT");
  process.once("SIGTERM", onSigterm);
  process.once("SIGINT", onSigint);
}
