import { readSystemStatus } from "@/lib/server/system-status";
import type { SystemStatusResponse } from "@/lib/server/system-status-contract";

/** Keep diagnostics fresh without creating one database probe per browser. */
export const SYSTEM_STATUS_STREAM_INTERVAL_MS = 5_000;

type Listener = (status: SystemStatusResponse) => void;

class SystemStatusStream {
  private readonly listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private refreshInFlight: Promise<void> | null = null;
  private latest: SystemStatusResponse | null = null;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    if (this.latest) listener(this.latest);
    if (!this.timer) {
      this.timer = setInterval(() => { void this.refresh(); }, SYSTEM_STATUS_STREAM_INTERVAL_MS);
      void this.refresh();
    }

    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  }

  private async refresh(): Promise<void> {
    if (this.refreshInFlight || this.listeners.size === 0) return;
    this.refreshInFlight = readSystemStatus()
      .then((status) => {
        this.latest = status;
        for (const listener of this.listeners) {
          try {
            listener(status);
          } catch {
            this.listeners.delete(listener);
          }
        }
      })
      .catch(() => {
        // A transient diagnostics failure must not terminate the SSE stream.
        // The next bounded refresh will retry and the browser keeps its last
        // known good status in the meantime.
      })
      .finally(() => {
        this.refreshInFlight = null;
      });
    await this.refreshInFlight;
  }
}

const globalForSystemStatus = globalThis as typeof globalThis & {
  airradarSystemStatusStream?: SystemStatusStream;
};

export function getSystemStatusStream(): SystemStatusStream {
  globalForSystemStatus.airradarSystemStatusStream ??= new SystemStatusStream();
  return globalForSystemStatus.airradarSystemStatusStream;
}
