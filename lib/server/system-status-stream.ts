import { readSystemStatus } from "@/lib/server/system-status";
import type { SystemStatusResponse } from "@/lib/server/system-status-contract";

/** Keep diagnostics fresh without creating one database probe per browser. */
export const SYSTEM_STATUS_STREAM_INTERVAL_MS = 5_000;

type Listener = { send: (status: SystemStatusResponse) => void; detail: "full" | "public" };

class SystemStatusStream {
  private readonly listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private refreshInFlight: Promise<void> | null = null;
  private refreshDetail: "full" | "public" | null = null;
  private refreshAgainForAdmin = false;
  private latest: SystemStatusResponse | null = null;
  private latestDetail: "full" | "public" = "public";

  subscribe(send: Listener["send"], detail: Listener["detail"] = "public"): () => void {
    const listener = { send, detail };
    this.listeners.add(listener);
    if (this.latest && (detail === "public" || this.latestDetail === "full")) send(this.latest);
    if (!this.timer) {
      this.timer = setInterval(() => { void this.refresh(); }, SYSTEM_STATUS_STREAM_INTERVAL_MS);
      void this.refresh();
    } else if (detail === "full" && this.latestDetail !== "full") {
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
    const detail = [...this.listeners].some((listener) => listener.detail === "full") ? "full" : "public";
    if (this.listeners.size === 0) return;
    if (this.refreshInFlight) {
      if (detail === "full" && this.refreshDetail !== "full") this.refreshAgainForAdmin = true;
      return;
    }
    this.refreshDetail = detail;
    this.refreshInFlight = readSystemStatus(undefined, detail)
      .then((status) => {
        this.latest = status;
        this.latestDetail = detail;
        for (const listener of this.listeners) {
          try {
            listener.send(status);
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
        this.refreshDetail = null;
        const refreshForAdmin = this.refreshAgainForAdmin && [...this.listeners].some((listener) => listener.detail === "full");
        this.refreshAgainForAdmin = false;
        if (refreshForAdmin) void this.refresh();
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
