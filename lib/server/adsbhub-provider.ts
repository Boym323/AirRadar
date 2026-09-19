import net from "node:net";
import type { Aircraft, NetworkProviderDiagnostics, ReceiverPosition } from "@/lib/aircraft/types";
import { haversineDistanceKm, initialBearing } from "@/lib/geo";
import { parseSbsLine, SbsLineBuffer } from "@/lib/server/sbs-mlat-parser";
import type { NetworkAircraftProvider, NetworkAircraftSnapshot } from "@/lib/server/provider";
import {
  getAdsbHubHost, getAdsbHubMaxTracks, getAdsbHubPort, getAdsbHubPublishIntervalMs,
  getAdsbHubRadiusNm, getAdsbHubReconnectMaxMs, getAdsbHubStaleMs,
} from "@/lib/server/config";

type Track = {
  aircraft: Aircraft;
  receivedAt: number;
  positionReceivedAt: number | null;
  fields: Partial<Record<keyof Aircraft, number>>;
};
type SocketFactory = (options: { host: string; port: number }) => net.Socket;

/** Bounded, arrival-time-driven consumer for the generic ADSBHub SBS/30003 feed. */
export class AdsbHubProvider implements NetworkAircraftProvider {
  readonly name = "adsbhub";
  private readonly buffer = new SbsLineBuffer(4096);
  private readonly tracks = new Map<string, Track>();
  private readonly receiver: ReceiverPosition;
  private readonly enabled: boolean;
  private readonly host: string;
  private readonly port: number;
  private readonly radiusNm: number;
  private readonly staleMs: number;
  private readonly reconnectMaxMs: number;
  private readonly publishIntervalMs: number;
  private readonly maxTracks: number;
  private readonly socketFactory: SocketFactory;
  private socket: net.Socket | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retryMs = 1000;
  private stopped = true;
  private connected = false;
  private connectionSince: number | null = null;
  private lastLineAt: number | null = null;
  private lastDataAt: number | null = null;
  private lastError: string | null = null;
  private reconnects = 0;
  private linesReceived = 0;
  private linesParsed = 0;
  private malformedLines = 0;
  private invalidIcao = 0;
  private invalidPosition = 0;
  private bytesReceived = 0;
  private lastSnapshot: Aircraft[] = [];

  constructor(receiver: ReceiverPosition, options: {
    enabled?: boolean; host?: string; port?: number; radiusNm?: number; staleMs?: number;
    reconnectMaxMs?: number; maxTracks?: number; publishIntervalMs?: number; socketFactory?: SocketFactory;
  } = {}) {
    this.receiver = receiver;
    this.enabled = options.enabled ?? true;
    this.host = options.host ?? getAdsbHubHost();
    this.port = options.port ?? getAdsbHubPort();
    this.radiusNm = options.radiusNm ?? getAdsbHubRadiusNm();
    this.staleMs = options.staleMs ?? getAdsbHubStaleMs();
    this.reconnectMaxMs = options.reconnectMaxMs ?? getAdsbHubReconnectMaxMs();
    this.maxTracks = options.maxTracks ?? getAdsbHubMaxTracks();
    this.publishIntervalMs = options.publishIntervalMs ?? getAdsbHubPublishIntervalMs();
    this.socketFactory = options.socketFactory ?? ((address) => net.createConnection(address));
  }

  start(): void { if (!this.enabled || !this.stopped) return; this.stopped = false; this.connect(); }
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const socket = this.socket;
    this.socket = null;
    this.connected = false;
    socket?.destroy();
  }
  getNextPollDelayMs(): number { return this.publishIntervalMs; }

  async getSnapshot(): Promise<NetworkAircraftSnapshot> {
    if (!this.enabled) return { aircraft: [], fetchedAt: new Date().toISOString(), provider: this.name };
    if (this.stopped) this.start();
    this.expire(Date.now());
    this.lastSnapshot = this.publish(Date.now());
    return { aircraft: this.lastSnapshot, fetchedAt: new Date().toISOString(), provider: this.name };
  }

  getDiagnostics(): NetworkProviderDiagnostics {
    const now = Date.now();
    const stale = !this.lastDataAt || now - this.lastDataAt > this.staleMs;
    const status = !this.enabled ? "disabled" : this.connected && !stale ? "online" : this.connected ? "stale" : this.socket ? "connecting" : "disconnected";
    const linesPerSecond = this.connectionSince ? this.linesReceived / Math.max(1, (now - this.connectionSince) / 1000) : 0;
    return {
      enabled: this.enabled, status, lastAttemptAt: null,
      lastSuccessAt: this.lastLineAt ? new Date(this.lastLineAt).toISOString() : null,
      latencyMs: null, consecutiveFailures: 0, aircraftCount: this.lastSnapshot.length,
      positionedAircraftCount: this.lastSnapshot.filter((a) => a.lat !== null && a.lon !== null).length,
      mlatAircraftCount: 0, radiusNm: this.radiusNm, pollIntervalMs: this.publishIntervalMs, retryAfterMs: null,
      selectedSource: "adsbhub", connected: this.connected,
      connectionSince: this.connectionSince ? new Date(this.connectionSince).toISOString() : null,
      lastLineAt: this.lastLineAt ? new Date(this.lastLineAt).toISOString() : null,
      linesReceived: this.linesReceived, linesParsed: this.linesParsed, malformedLines: this.malformedLines,
      invalidIcao: this.invalidIcao, invalidPosition: this.invalidPosition, bytesReceived: this.bytesReceived,
      linesPerSecond, activeInternalTracks: this.tracks.size, publishedAircraftCount: this.lastSnapshot.length,
      adsbPositionCount: this.lastSnapshot.filter((a) => a.lat !== null && a.lon !== null).length,
      mlatPositionCount: 0, configuredRadiusNm: this.radiusNm, reconnects: this.reconnects,
      lastSourceTransitionAt: this.connectionSince ? new Date(this.connectionSince).toISOString() : null,
      lastError: this.lastError, stale,
    };
  }

  private connect(): void {
    if (this.stopped || this.socket) return;
    const socket = this.socketFactory({ host: this.host, port: this.port });
    this.socket = socket;
    socket.setNoDelay?.(true);
    socket.setTimeout?.(this.staleMs);
    socket.once("connect", () => { this.connected = true; this.connectionSince = Date.now(); this.retryMs = 1000; this.lastError = null; });
    socket.on("data", (chunk) => this.handleData(chunk));
    socket.once("timeout", () => { this.lastError = "stale connection"; socket.destroy(); });
    socket.once("error", (error) => { this.lastError = error.message; });
    socket.once("close", () => {
      if (this.socket === socket) this.socket = null;
      this.connected = false; this.connectionSince = null;
      if (!this.stopped) this.scheduleReconnect();
    });
  }
  private scheduleReconnect(): void {
    if (this.timer || this.stopped) return;
    const delay = this.retryMs;
    this.retryMs = Math.min(this.reconnectMaxMs, delay * 2);
    this.reconnects += 1;
    this.timer = setTimeout(() => { this.timer = null; this.connect(); }, delay);
  }
  private handleData(chunk: Uint8Array): void {
    const now = Date.now();
    this.bytesReceived += chunk.byteLength;
    this.lastDataAt = now;
    for (const line of this.buffer.push(chunk)) {
      this.linesReceived += 1; this.lastLineAt = now;
      const parsed = parseSbsLine(line, this.receiver, now, { origin: "adsbhub", source: "UNKNOWN" });
      if (!parsed.aircraft) {
        if (parsed.error === "invalid_icao") this.invalidIcao += 1;
        else if (parsed.error === "invalid_position") this.invalidPosition += 1;
        else this.malformedLines += 1;
        continue;
      }
      this.linesParsed += 1;
      this.merge(parsed.aircraft, now);
    }
  }
  private merge(incoming: Aircraft, receivedAt: number): void {
    const existing = this.tracks.get(incoming.icaoHex);
    const hasPosition = incoming.lat !== null && incoming.lon !== null;
    const fields: (keyof Aircraft)[] = ["callsign", "altitude", "baroAltitude", "lat", "lon", "groundSpeed", "track", "verticalRate", "baroRate", "squawk", "onGround"];
    const next: Aircraft = existing ? { ...existing.aircraft } : { ...incoming };
    const freshness = existing?.fields ?? {};
    for (const field of fields) {
      const value = incoming[field];
      if (value !== null && value !== undefined && (!freshness[field] || receivedAt >= freshness[field]!)) {
        (next as unknown as Record<string, unknown>)[field] = value;
        freshness[field] = receivedAt;
      }
    }
    next.lastSeen = new Date(receivedAt).toISOString();
    const latestPositionReceivedAt = hasPosition ? receivedAt : existing?.positionReceivedAt ?? null;
    next.seenSeconds = 0;
    next.seenPosSeconds = latestPositionReceivedAt === null
      ? null
      : Math.max(0, (receivedAt - latestPositionReceivedAt) / 1000);
    next.origin = "adsbhub";
    next.provenance = { ...(next.provenance ?? { seenLocal: false, seenNetwork: true, lastLocalSeen: null, lastNetworkSeen: null, positionOrigin: null, positionSource: "UNKNOWN" }), seenLocal: false, seenNetwork: true, lastNetworkSeen: next.lastSeen, positionOrigin: next.lat !== null && next.lon !== null ? "adsbhub" : next.provenance?.positionOrigin ?? null, positionSource: "UNKNOWN" };
    if (next.lat !== null && next.lon !== null) { next.distanceKm = haversineDistanceKm(this.receiver.lat, this.receiver.lon, next.lat, next.lon); next.bearing = initialBearing(this.receiver.lat, this.receiver.lon, next.lat, next.lon); }
    next.trail = existing?.aircraft.trail ?? (next.lat !== null && next.lon !== null ? [{ lat: next.lat, lon: next.lon, recordedAt: next.lastSeen, altitude: next.altitude, groundSpeed: next.groundSpeed, track: next.track }] : []);
    this.tracks.set(incoming.icaoHex, {
      aircraft: next,
      receivedAt,
      positionReceivedAt: latestPositionReceivedAt,
      fields: freshness,
    });
    if (this.tracks.size > this.maxTracks) {
      let oldest: string | null = null; let oldestAt = Number.POSITIVE_INFINITY;
      for (const [hex, track] of this.tracks) if (track.receivedAt < oldestAt) { oldest = hex; oldestAt = track.receivedAt; }
      if (oldest) this.tracks.delete(oldest);
    }
  }
  private expire(now: number): void { for (const [hex, track] of this.tracks) if (now - track.receivedAt > this.staleMs) this.tracks.delete(hex); }
  private publish(now: number): Aircraft[] {
    const radiusKm = this.radiusNm * 1.852;
    const result: Aircraft[] = [];
    for (const track of this.tracks.values()) if (track.positionReceivedAt !== null && now - track.positionReceivedAt <= this.staleMs && track.aircraft.lat !== null && track.aircraft.lon !== null && (track.aircraft.distanceKm ?? Infinity) <= radiusKm) result.push(track.aircraft);
    return result;
  }
}
