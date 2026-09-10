import net from "node:net";
import { getOgnConfig, getReceiverPosition, type OgnConfig } from "@/lib/server/config";
import { AprsLineReader, OgnParseError, parseAprsEnvelope, parseOgnPosition, type ParsedOgnPosition } from "@/lib/ogn/aprs-parser";
import { classifyOgnTocall } from "@/lib/ogn/source-classifier";
import type { OgnProviderDiagnostics, OgnProviderStatus, OgnPosition } from "@/lib/ogn/types";

const SERVER_IDLE_HEALTH_MS = 60_000;

export interface OgnSocketLike {
  on(event: string, listener: (...args: unknown[]) => void): OgnSocketLike;
  once(event: string, listener: (...args: unknown[]) => void): OgnSocketLike;
  write(data: string): boolean;
  destroy(): void;
}

export interface OgnProviderOptions {
  config?: OgnConfig;
  receiver?: { lat: number; lon: number; name: string };
  onPosition?: (position: OgnPosition) => void;
  socketFactory?: (host: string, port: number) => OgnSocketLike;
  random?: () => number;
  now?: () => number;
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : "OGN socket error";
}

function jittered(delay: number, random: () => number): number {
  return Math.max(0, Math.round(delay * (0.8 + random() * 0.4)));
}

export function buildOgnLogin(config: OgnConfig, receiver = getReceiverPosition()): string {
  // APRS-IS 14580 expects a receive-only login. The filter is server-side,
  // while the local classifier remains the integrity boundary for OGADSB.
  const filter = `filter r/${receiver.lat.toFixed(4)}/${receiver.lon.toFixed(4)}/${config.radiusKm} -u/OGADSB`;
  return `user AIRRADAR pass -1 vers AirRadar 1.0.0 ${filter}\r\n`;
}

export class OgnProvider {
  readonly name = "ogn-aprs";
  private readonly config: OgnConfig;
  private readonly receiver: { lat: number; lon: number; name: string };
  private readonly onPosition?: (position: OgnPosition) => void;
  private readonly socketFactory: (host: string, port: number) => OgnSocketLike;
  private readonly random: () => number;
  private readonly now: () => number;
  private readonly lineReader = new AprsLineReader();
  private readonly sourceCounts = new Map<string, number>();
  private readonly unknownTocalls = new Map<string, number>();
  private socket: OgnSocketLike | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private handshakeTimer: ReturnType<typeof setTimeout> | null = null;
  private keepaliveTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private status: OgnProviderStatus;
  private connectedAt: number | null = null;
  private lastActivityAt: number | null = null;
  private lastPacketAt: number | null = null;
  private lastAircraftPacketAt: number | null = null;
  private loginAcknowledged = false;
  private reconnectAttempt = 0;
  private reconnects = 0;
  private packets = 0;
  private positionPackets = 0;
  private malformed = 0;
  private droppedAdsb = 0;
  private droppedGroundStatus = 0;
  private droppedStatus = 0;
  private droppedDelayed = 0;
  private unknownTocall = 0;
  private configurationError: string | null;
  private reportedLogin = false;
  private reportedError = false;

  constructor(options: OgnProviderOptions = {}) {
    this.config = options.config ?? getOgnConfig();
    this.receiver = options.receiver ?? getReceiverPosition();
    this.onPosition = options.onPosition;
    this.socketFactory = options.socketFactory ?? ((host, port) => net.createConnection({ host, port }) as unknown as OgnSocketLike);
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
    this.configurationError = this.config.configurationError;
    this.status = this.config.enabled ? (this.configurationError ? "degraded" : "offline") : "disabled";
  }

  start(): void {
    if (this.running || !this.config.enabled || this.configurationError) return;
    this.running = true;
    this.status = "connecting";
    this.connect();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.connectTimer) clearTimeout(this.connectTimer);
    if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
    if (this.keepaliveTimer) clearTimeout(this.keepaliveTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.connectTimer = null;
    this.handshakeTimer = null;
    this.keepaliveTimer = null;
    this.reconnectTimer = null;
    this.lineReader.reset();
    const socket = this.socket;
    this.socket = null;
    if (socket) socket.destroy();
    if (this.config.enabled && !this.configurationError) this.status = "offline";
  }

  getDiagnostics(): OgnProviderDiagnostics {
    const now = this.now();
    const status = this.status === "online" && this.lastActivityAt !== null && now - this.lastActivityAt > SERVER_IDLE_HEALTH_MS
      ? "degraded"
      : this.status;
    return {
      enabled: this.config.enabled,
      status,
      host: this.config.host,
      port: this.config.port,
      radiusKm: this.config.radiusKm,
      connectedAt: this.toIso(this.connectedAt),
      lastActivityAt: this.toIso(this.lastActivityAt),
      lastPacketAt: this.toIso(this.lastPacketAt),
      lastAircraftPacketAt: this.toIso(this.lastAircraftPacketAt),
      loginAcknowledged: this.loginAcknowledged,
      packets: this.packets,
      positionPackets: this.positionPackets,
      canonicalPositionUpdates: 0,
      duplicatePackets: 0,
      malformed: this.malformed,
      droppedAdsb: this.droppedAdsb,
      droppedGroundStatus: this.droppedGroundStatus,
      droppedStatus: this.droppedStatus,
      droppedDelayed: this.droppedDelayed,
      droppedPrivacy: 0,
      droppedDdbUnresolved: 0,
      ddbUnresolvable: 0,
      droppedStale: 0,
      droppedCapacity: 0,
      unknownTocall: this.unknownTocall,
      sourceCounts: Object.fromEntries(this.sourceCounts),
      unknownTocalls: [...this.unknownTocalls.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 20)
        .map(([tocall, count]) => ({ tocall, count })),
      activeTargets: 0,
      freshTargets: 0,
      staleTargets: 0,
      ddb: {
        status: "disabled", strategy: "targeted", representation: null, mode: null, endpoint: "https://ddb.glidernet.org/download/", entries: 0,
        cacheEntries: 0, positiveEntries: 0, negativeEntries: 0, pendingKeys: 0, queuedIds: 0, inFlight: false,
        requests: 0, successfulRequests: 0, failedRequests: 0, batchCount: 0, lastBatchSize: null,
        cacheHits: 0, cacheMisses: 0, evictions: 0, unexpectedRecords: 0, conflictingRecords: 0,
        lastAttemptAt: null, lastRefreshAt: null, lastSuccessAt: null, lastHttpStatus: null, ageMs: null,
        failures: 0, fallbackCount: 0, fallbackUsed: false, rateLimited: false, retryAfterMs: null, nextRetryAt: null,
        aircraftTypeAvailable: false, stale: true,
        persistence: {
          enabled: false, cacheFile: "/var/lib/airradar/ogn-ddb-cache-v1.json", loadedFromDisk: false,
          diskEntriesLoaded: 0, diskEntriesRejected: 0, lastLoadAt: null, lastLoadError: null, dirty: false,
          lastSaveAt: null, lastSaveEntries: 0, lastSaveError: null, writes: 0,
        },
      },
      reconnects: this.reconnects,
      configurationError: this.configurationError,
    };
  }

  private connect(): void {
    if (!this.running) return;
    this.status = "connecting";
    this.loginAcknowledged = false;
    let socket: OgnSocketLike;
    try {
      socket = this.socketFactory(this.config.host, this.config.port);
    } catch (error) {
      this.reportError(error);
      this.handleDisconnect(null);
      return;
    }
    this.socket = socket;
    let connected = false;
    this.connectTimer = setTimeout(() => {
      if (!connected && this.socket === socket) {
        socket.destroy();
        this.handleDisconnect(socket);
      }
    }, this.config.connectTimeoutMs);
    socket.once("connect", () => {
      connected = true;
      if (this.connectTimer) clearTimeout(this.connectTimer);
      this.connectTimer = null;
      if (this.socket !== socket || !this.running) return;
      this.connectedAt = this.now();
      this.lastActivityAt = this.connectedAt;
      try {
        socket.write(buildOgnLogin(this.config, this.receiver));
        this.handshakeTimer = setTimeout(() => {
          if (this.socket !== socket || !this.running || this.loginAcknowledged) return;
          console.error("OGN login handshake timed out");
          socket.destroy();
        }, this.config.handshakeTimeoutMs);
      } catch (error) {
        this.reportError(error);
        socket.destroy();
      }
    });
    socket.on("data", (chunk: unknown) => {
      if (this.socket !== socket || !this.running) return;
      const data = typeof chunk === "string" ? Buffer.from(chunk) : chunk instanceof Uint8Array ? chunk : null;
      if (!data) return;
      const result = this.lineReader.push(data);
      if (result.oversized) this.malformed += result.oversized;
      for (const line of result.lines) this.handleLine(line);
    });
    socket.on("error", (error: unknown) => this.reportError(error));
    socket.on("timeout", () => socket.destroy());
    socket.on("close", () => this.handleDisconnect(socket));
  }

  private handleLine(line: string): void {
    const receivedAt = this.now();
    this.lastActivityAt = receivedAt;
    if (!line) return;
    if (line.startsWith("#")) {
      this.handleServerComment(line);
      return;
    }
    this.packets += 1;
    this.lastPacketAt = receivedAt;
    let envelope;
    try {
      envelope = parseAprsEnvelope(line);
    } catch {
      this.malformed += 1;
      return;
    }
    const tocall = envelope.tocall.toUpperCase();
    this.recordSource(tocall);
    const classification = classifyOgnTocall(tocall);
    if (classification.action === "drop") {
      if (classification.reason === "adsb") this.droppedAdsb += 1;
      else if (classification.reason === "ground") this.droppedGroundStatus += 1;
      else if (classification.reason === "status") this.droppedStatus += 1;
      else if (classification.reason === "delayed") this.droppedDelayed += 1;
      else this.recordUnknown(tocall);
      return;
    }
    let parsed: ParsedOgnPosition;
    try {
      parsed = parseOgnPosition(line, { now: new Date(receivedAt), maxPacketAgeMs: this.config.maxPacketAgeMs });
    } catch (error) {
      const code = error instanceof OgnParseError ? error.code : "position";
      if (code === "status") this.droppedStatus += 1;
      else if (code === "age" || code === "future") this.droppedDelayed += 1;
      else this.malformed += 1;
      return;
    }
    this.positionPackets += 1;
    this.lastAircraftPacketAt = receivedAt;
    try {
      this.onPosition?.(parsed.position);
    } catch (error) {
      // A state/privacy consumer failure must not kill TCP ingest.
      this.reportError(error);
    }
  }

  private handleServerComment(line: string): void {
    const lower = line.toLowerCase();
    if (!lower.includes("logresp")) return;
    if (/invalid|unrecognized|reject|failed|error/.test(lower)) {
      this.status = "degraded";
      this.clearHandshakeTimer();
      this.loginAcknowledged = false;
      this.socket?.destroy();
      return;
    }
    const firstAcknowledgement = !this.loginAcknowledged;
    this.clearHandshakeTimer();
    this.loginAcknowledged = true;
    this.status = "online";
    if (!this.reportedLogin) {
      this.reportedLogin = true;
      console.info("OGN login accepted");
    }
    if (firstAcknowledgement && this.socket) this.scheduleKeepalive(this.socket);
    this.reconnectAttempt = 0;
    this.reportedError = false;
  }

  private handleDisconnect(socket: OgnSocketLike | null): void {
    if (socket && this.socket !== socket) return;
    if (socket && this.socket === socket) this.socket = null;
    if (this.connectTimer) clearTimeout(this.connectTimer);
    if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
    if (this.keepaliveTimer) clearTimeout(this.keepaliveTimer);
    this.connectTimer = null;
    this.handshakeTimer = null;
    this.keepaliveTimer = null;
    this.lineReader.reset();
    if (!this.running) return;
    const wasHealthy = this.loginAcknowledged && this.lastActivityAt !== null;
    this.status = "reconnecting";
    if (wasHealthy) this.reconnectAttempt = 0;
    const base = Math.min(this.config.reconnectMaxMs, this.config.reconnectMinMs * 2 ** Math.min(this.reconnectAttempt, 10));
    this.reconnectAttempt += 1;
    this.reconnects += 1;
    const delay = jittered(base, this.random);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
    console.info(`OGN reconnecting in ${delay}ms`);
  }

  private scheduleKeepalive(socket: OgnSocketLike): void {
    if (!this.running || this.socket !== socket) return;
    this.keepaliveTimer = setTimeout(() => {
      this.keepaliveTimer = null;
      if (!this.running || this.socket !== socket) return;
      try {
        // OGN/APRS expects a comment-line keepalive; this carries no aircraft
        // position or telemetry and is only sent while this socket is live.
        socket.write("#keepalive\r\n");
        this.scheduleKeepalive(socket);
      } catch (error) {
        this.reportError(error);
        socket.destroy();
      }
    }, this.config.keepaliveMs);
  }

  private clearHandshakeTimer(): void {
    if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
    this.handshakeTimer = null;
  }

  private recordSource(tocall: string): void {
    if (this.sourceCounts.has(tocall) || this.sourceCounts.size < 64) this.sourceCounts.set(tocall, (this.sourceCounts.get(tocall) ?? 0) + 1);
  }

  private recordUnknown(tocall: string): void {
    this.unknownTocall += 1;
    if (this.unknownTocalls.has(tocall) || this.unknownTocalls.size < 32) this.unknownTocalls.set(tocall, (this.unknownTocalls.get(tocall) ?? 0) + 1);
  }

  private reportError(error: unknown): void {
    if (this.reportedError) return;
    this.reportedError = true;
    console.error(`OGN socket error: ${safeError(error)}`);
  }

  private toIso(value: number | null): string | null {
    return value === null ? null : new Date(value).toISOString();
  }
}
