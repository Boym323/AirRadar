import { io, type Socket } from "socket.io-client";
import type { RxwHubConnectionState, RxwHubPublicSnapshot } from "@/lib/aircraft/rxw-communications";
import { RxwHubMessageStore } from "@/lib/server/rxw-hub-store";
import { logger } from "@/lib/server/logger";

const RXW_DEFAULT_URL = "https://hub.rxw.cz";
const RXW_MAX_BATCH_ITEMS = 100;

export function isRxwHubEnabled(): boolean {
  return process.env.RXW_HUB_ENABLED?.trim().toLowerCase() === "true";
}

/** The endpoint is operator-supplied, never obtained from the request/client. */
export function resolveRxwHubEndpoint(raw = process.env.RXW_HUB_URL || RXW_DEFAULT_URL): { origin: string; path: string } | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.search || url.hash) return null;
    const prefix = url.pathname.replace(/\/$/, "");
    if (prefix && !/^\/[a-zA-Z0-9/_-]+$/.test(prefix)) return null;
    return { origin: url.origin, path: prefix + "/socket.io" };
  } catch {
    return null;
  }
}

export class RxwHubService {
  private readonly store = new RxwHubMessageStore();
  private started = false;
  private socket: Socket | null = null;
  private connection: RxwHubConnectionState = "disabled";
  private lastReceivedAt: string | null = null;

  start(): void {
    if (this.started) return;
    this.started = true;
    if (!isRxwHubEnabled()) return;
    const endpoint = resolveRxwHubEndpoint();
    if (!endpoint) {
      this.connection = "error";
      logger.warn({ component: "rxw-hub" }, "Invalid RXW_HUB_URL; hub client was not started");
      return;
    }

    this.connection = "connecting";
    try {
      const socket = io(endpoint.origin + "/main", {
        path: endpoint.path,
        transports: ["websocket"],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30_000,
        randomizationFactor: 0.5,
        timeout: 10_000,
        autoConnect: false,
      });
      this.socket = socket;
      socket.on("connect", () => {
        this.connection = "connected";
        logger.info({ component: "rxw-hub" }, "RXW Hub connected");
      });
      socket.on("disconnect", () => {
        this.connection = "disconnected";
      });
      socket.on("connect_error", () => {
        this.connection = "error";
      });
      socket.on("acars_msg", (payload: unknown) => {
        if (!this.started) return;
        const wrapper = payload !== null && typeof payload === "object" ? payload as { msghtml?: unknown } : null;
        if (this.store.ingest(wrapper?.msghtml)) this.lastReceivedAt = new Date().toISOString();
      });
      socket.on("acars_msg_batch", (payload: unknown) => {
        if (!this.started) return;
        const wrapper = payload !== null && typeof payload === "object"
          ? payload as { messages?: unknown }
          : null;
        if (!Array.isArray(wrapper?.messages)) return;
        for (const item of wrapper.messages.slice(0, RXW_MAX_BATCH_ITEMS)) {
          if (this.store.ingest(item)) this.lastReceivedAt = new Date().toISOString();
        }
      });
      socket.connect();
    } catch {
      this.connection = "error";
      logger.warn({ component: "rxw-hub" }, "RXW Hub connection could not be initialized");
    }
  }

  getSnapshot(icaoHex: string, callsign: string | null = null): RxwHubPublicSnapshot {
    return {
      enabled: isRxwHubEnabled(),
      source: "RXW Hub",
      connection: this.connection,
      lastReceivedAt: this.lastReceivedAt,
      routeHint: isRxwHubEnabled() ? this.store.routeForFlight(icaoHex, callsign) : null,
      waypointPlan: isRxwHubEnabled() && process.env.RXW_FPN_ENABLED?.trim().toLowerCase() === "true" ? this.store.waypointPlanForFlight(icaoHex, callsign) : null,
      messages: isRxwHubEnabled() ? this.store.list(icaoHex) : [],
    };
  }

  getWaypointAvailability(): { enabled: boolean; aircraft: ReturnType<RxwHubMessageStore["waypointAvailability"]> } {
    const enabled = isRxwHubEnabled() && process.env.RXW_FPN_ENABLED?.trim().toLowerCase() === "true";
    return { enabled, aircraft: enabled ? this.store.waypointAvailability() : [] };
  }

  stop(): void {
    this.started = false;
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.store.clear();
    this.lastReceivedAt = null;
    this.connection = "stopped";
  }
}

// Instrumentation and request routes may run in separate Next.js bundles.
// A process-wide singleton guarantees at most one connection per Node process.
const shared = globalThis as typeof globalThis & { airradarRxwHub?: RxwHubService };

export function getRxwHubService(): RxwHubService {
  shared.airradarRxwHub ??= new RxwHubService();
  return shared.airradarRxwHub;
}
