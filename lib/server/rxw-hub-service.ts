import { io, type Socket } from "socket.io-client";
import type { RxwHubConnectionState, RxwHubPublicSnapshot, RxwCommunication, RxwWaypointPlan } from "@/lib/aircraft/rxw-communications";
import { RxwHubMessageStore } from "@/lib/server/rxw-hub-store";
import { logger } from "@/lib/server/logger";
import { getRxwRouteHistoryWriter, isRxwRouteHistoryEnabled } from "@/lib/server/rxw-route-history";

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
  private lastEventAt: string | null = null;
  private receivedEvents = 0;
  private receivedItems = 0;
  private connectCount = 0;
  private disconnectCount = 0;
  private connectionErrors = 0;
  private unsupportedPayloads = 0;

  /** Administrator-safe counters only; never exposes message bodies or identities. */
  getDiagnostics() {
    const stats = this.store.stats();
    return {
      enabled: isRxwHubEnabled(),
      fpnEnabled: isRxwHubEnabled() && process.env.RXW_FPN_ENABLED?.trim().toLowerCase() === "true",
      connection: this.connection,
      routeHistoryEnabled: isRxwRouteHistoryEnabled(),
      routeHistory: getRxwRouteHistoryWriter().diagnostics(),
      connectCount: this.connectCount,
      disconnectCount: this.disconnectCount,
      connectionErrors: this.connectionErrors,
      receivedEvents: this.receivedEvents,
      receivedItems: this.receivedItems,
      unsupportedPayloads: this.unsupportedPayloads,
      lastEventAt: this.lastEventAt,
      lastAcceptedAt: this.lastReceivedAt,
      aircraft: stats.aircraft, accepted: stats.accepted,
      rejectedInvalid: stats.rejectedInvalid, rejectedDuplicate: stats.rejectedDuplicate,
      plans: stats.plans, fpnAccepted: stats.fpnAccepted, fpnRejected: stats.fpnRejected,
    };
  }

  private ingest(item: unknown): void {
    this.receivedItems++;
    const persist = isRxwRouteHistoryEnabled()
      ? (message: RxwCommunication, plan: RxwWaypointPlan | null) => {
        getRxwRouteHistoryWriter().enqueue(message, plan);
      }
      : undefined;
    if (this.store.ingest(item, Date.now(), persist)) this.lastReceivedAt = new Date().toISOString();
  }

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
        this.connectCount++;
        logger.info({ component: "rxw-hub" }, "RXW Hub connected");
      });
      socket.on("disconnect", () => {
        this.connection = "disconnected";
        this.disconnectCount++;
      });
      socket.on("connect_error", () => {
        this.connectionErrors++;
        this.connection = "error";
      });
      socket.on("acars_msg", (payload: unknown) => {
        if (!this.started) return;
        this.receivedEvents++;
        this.lastEventAt = new Date().toISOString();
        const wrapper = payload !== null && typeof payload === "object" && !Array.isArray(payload)
          ? payload as { msghtml?: unknown } : null;
        if (!wrapper || !("msghtml" in wrapper)) this.unsupportedPayloads++;
        this.ingest(wrapper?.msghtml);
      });
      socket.on("acars_msg_batch", (payload: unknown) => {
        if (!this.started) return;
        this.receivedEvents++;
        this.lastEventAt = new Date().toISOString();
        const wrapper = payload !== null && typeof payload === "object" && !Array.isArray(payload)
          ? payload as { messages?: unknown } : null;
        if (!Array.isArray(wrapper?.messages)) { this.unsupportedPayloads++; return; }
        for (const item of wrapper.messages.slice(0, RXW_MAX_BATCH_ITEMS)) this.ingest(item);
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
    this.lastEventAt = null;
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
