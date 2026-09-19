import net from "node:net";
import type { Aircraft, NetworkProviderDiagnostics, ReceiverPosition } from "@/lib/aircraft/types";
import { haversineDistanceKm, initialBearing } from "@/lib/geo";
import { BeastDecoder } from "@/lib/server/beast-decoder";
import { BeastParser } from "@/lib/server/beast-parser";
import { parseSbsMlatLine, SbsLineBuffer } from "@/lib/server/sbs-mlat-parser";
import { logger } from "@/lib/server/logger";
import type { NetworkAircraftProvider, NetworkAircraftSnapshot } from "@/lib/server/provider";
import {
  getAdsbLolBeastHost, getAdsbLolBeastPort, getAdsbLolMlatHost, getAdsbLolMlatPort,
  getAdsbLolNetworkRadiusNm, getAdsbLolRawMaxTracks, getAdsbLolRawPublishIntervalMs,
  getAdsbLolRawReconnectMaxMs, getAdsbLolRawStaleMs,
} from "@/lib/server/config";

type StreamKind = "beast" | "mlat";

export class AdsbLolRawProvider implements NetworkAircraftProvider {
  readonly name = "adsb.lol-raw";
  private readonly beastDecoder: BeastDecoder;
  private readonly parser = new BeastParser();
  private readonly sbs = new SbsLineBuffer();
  private readonly mlatAircraft = new Map<string, Aircraft>();
  private readonly receiver: ReceiverPosition;
  private readonly staleMs: number;
  private readonly reconnectMaxMs: number;
  private readonly radiusNm: number;
  private readonly publishIntervalMs: number;
  private readonly hosts: Record<StreamKind, string>;
  private readonly ports: Record<StreamKind, number>;
  private readonly sockets: Record<StreamKind, net.Socket | null> = { beast: null, mlat: null };
  private readonly timers: Record<StreamKind, ReturnType<typeof setTimeout> | null> = { beast: null, mlat: null };
  private readonly retryMs: Record<StreamKind, number> = { beast: 1000, mlat: 1000 };
  private stopped = true;
  private lastBeastAt: number | null = null;
  private lastMlatAt: number | null = null;
  private connected = { beast: false, mlat: false };
  private reconnects = { beast: 0, mlat: 0 };
  private framesReceived = 0; private framesDecoded = 0; private decodeErrors = 0;
  private linesReceived = 0; private linesParsed = 0; private parseErrors = 0; private droppedTracks = 0;
  private lastError: string | null = null; private lastTransitionAt: string | null = null;
  private lastSnapshot: Aircraft[] = [];

  constructor(receiver: ReceiverPosition, options: { host?: string; beastHost?: string; mlatHost?: string; beastPort?: number; mlatPort?: number; radiusNm?: number; staleMs?: number; reconnectMaxMs?: number; maxTracks?: number; publishIntervalMs?: number } = {}) {
    this.receiver = receiver;
    this.radiusNm = options.radiusNm ?? getAdsbLolNetworkRadiusNm();
    this.staleMs = options.staleMs ?? getAdsbLolRawStaleMs();
    this.reconnectMaxMs = options.reconnectMaxMs ?? getAdsbLolRawReconnectMaxMs();
    this.publishIntervalMs = options.publishIntervalMs ?? getAdsbLolRawPublishIntervalMs();
    const host = options.host ?? "out.adsb.lol";
    this.hosts = { beast: options.beastHost ?? (options.host ? host : getAdsbLolBeastHost()), mlat: options.mlatHost ?? (options.host ? host : getAdsbLolMlatHost()) };
    this.ports = { beast: options.beastPort ?? getAdsbLolBeastPort(), mlat: options.mlatPort ?? getAdsbLolMlatPort() };
    this.beastDecoder = new BeastDecoder(receiver, options.maxTracks ?? getAdsbLolRawMaxTracks(), this.staleMs, { origin: "adsblol" });
  }
  start(): void { if (!this.stopped) return; this.stopped = false; this.connect("beast"); this.connect("mlat"); }
  async stop(): Promise<void> { this.stopped = true; for (const kind of ["beast", "mlat"] as const) { if (this.timers[kind]) clearTimeout(this.timers[kind]!); this.timers[kind] = null; this.sockets[kind]?.destroy(); this.sockets[kind] = null; this.connected[kind] = false; } }
  getNextPollDelayMs(): number { return this.publishIntervalMs; }
  async getSnapshot(): Promise<NetworkAircraftSnapshot> { if (this.stopped) this.start(); this.expireMlat(); this.lastSnapshot = this.publish(); return { aircraft: this.lastSnapshot, fetchedAt: new Date().toISOString(), provider: this.name }; }
  getDiagnostics(): NetworkProviderDiagnostics {
    const now = Date.now(); const beastHealthy = this.connected.beast && this.lastBeastAt !== null && now - this.lastBeastAt <= this.staleMs; const mlatHealthy = this.connected.mlat && this.lastMlatAt !== null && now - this.lastMlatAt <= this.staleMs;
    return { enabled: true, status: beastHealthy || mlatHealthy ? (beastHealthy && mlatHealthy ? "online" : "degraded") : "stale", lastAttemptAt: null, lastSuccessAt: this.lastBeastAt || this.lastMlatAt ? new Date(Math.max(this.lastBeastAt ?? 0, this.lastMlatAt ?? 0)).toISOString() : null, latencyMs: null, consecutiveFailures: 0, aircraftCount: this.lastSnapshot.length, positionedAircraftCount: this.lastSnapshot.filter((a) => a.lat !== null && a.lon !== null).length, mlatAircraftCount: this.lastSnapshot.filter((a) => a.source === "MLAT").length, radiusNm: this.radiusNm, pollIntervalMs: this.publishIntervalMs, retryAfterMs: null, selectedSource: "raw", beastConnected: this.connected.beast, mlatConnected: this.connected.mlat, beastLastFrameAt: this.lastBeastAt ? new Date(this.lastBeastAt).toISOString() : null, mlatLastLineAt: this.lastMlatAt ? new Date(this.lastMlatAt).toISOString() : null, beastFramesReceived: this.framesReceived, beastFramesDecoded: this.framesDecoded, beastDecodeErrors: this.decodeErrors, mlatLinesReceived: this.linesReceived, mlatLinesParsed: this.linesParsed, mlatParseErrors: this.parseErrors, beastReconnects: this.reconnects.beast, mlatReconnects: this.reconnects.mlat, activeInternalTracks: this.beastDecoder.snapshot().length + this.mlatAircraft.size, publishedAircraftCount: this.lastSnapshot.length, adsbPositionCount: this.lastSnapshot.filter((a) => a.source === "ADS-B" && a.lat !== null).length, mlatPositionCount: this.lastSnapshot.filter((a) => a.source === "MLAT" && a.lat !== null).length, droppedTracks: this.droppedTracks, configuredRadiusNm: this.radiusNm, lastSourceTransitionAt: this.lastTransitionAt, lastError: this.lastError };
  }
  private connect(kind: StreamKind): void {
    if (this.stopped || this.sockets[kind]) return;
    const socket = net.createConnection({ host: this.hosts[kind], port: this.ports[kind] }); this.sockets[kind] = socket; socket.setNoDelay(true); socket.setTimeout(this.staleMs);
    socket.once("connect", () => { this.connected[kind] = true; this.retryMs[kind] = 1000; this.lastError = null; this.transition(`${kind} connected`); });
    socket.on("data", (chunk) => kind === "beast" ? this.handleBeast(chunk) : this.handleMlat(chunk));
    socket.on("timeout", () => socket.destroy()); socket.on("error", (error) => { this.lastError = `${kind}: ${error.message}`; });
    socket.once("close", () => { if (this.sockets[kind] === socket) this.sockets[kind] = null; this.connected[kind] = false; if (!this.stopped) this.scheduleReconnect(kind); });
  }
  private scheduleReconnect(kind: StreamKind): void { if (this.timers[kind] || this.stopped) return; const delay = this.retryMs[kind]; this.reconnects[kind] += 1; this.retryMs[kind] = Math.min(this.reconnectMaxMs, delay * 2); this.timers[kind] = setTimeout(() => { this.timers[kind] = null; this.connect(kind); }, delay); }
  private handleBeast(chunk: Uint8Array): void { for (const frame of this.parser.push(chunk)) { this.framesReceived += 1; try { const result = this.beastDecoder.decode(frame); if (result) { this.framesDecoded += 1; this.lastBeastAt = Date.now(); } else this.decodeErrors += 1; } catch { this.decodeErrors += 1; } } }
  private handleMlat(chunk: Uint8Array): void { for (const line of this.sbs.push(chunk)) { this.linesReceived += 1; const parsed = parseSbsMlatLine(line, this.receiver); if (!parsed.aircraft) { this.parseErrors += 1; continue; } this.linesParsed += 1; this.lastMlatAt = Date.now(); const old = this.mlatAircraft.get(parsed.aircraft.icaoHex); this.mlatAircraft.set(parsed.aircraft.icaoHex, old ? this.merge(old, parsed.aircraft) : parsed.aircraft); } }
  private merge(old: Aircraft, incoming: Aircraft): Aircraft { const value = { ...old }; for (const key of ["callsign", "altitude", "baroAltitude", "groundSpeed", "track", "verticalRate", "baroRate", "squawk", "lat", "lon", "seenPosSeconds"] as const) if (incoming[key] !== null && incoming[key] !== undefined) (value as Record<string, unknown>)[key] = incoming[key]; value.lastSeen = incoming.lastSeen; value.origin = "adsblol"; const incomingPosition = incoming.lat !== null && incoming.lon !== null; if (incomingPosition) { value.source = "MLAT"; value.provenance = incoming.provenance; } else { value.provenance = { ...(old.provenance ?? { seenLocal: false, seenNetwork: true, lastLocalSeen: null, lastNetworkSeen: null, positionOrigin: null, positionSource: old.source }), seenNetwork: true, lastNetworkSeen: incoming.lastSeen }; } if (value.lat !== null && value.lon !== null) { value.distanceKm = haversineDistanceKm(this.receiver.lat, this.receiver.lon, value.lat, value.lon); value.bearing = initialBearing(this.receiver.lat, this.receiver.lon, value.lat, value.lon); } return value; }
  private expireMlat(): void { const cutoff = Date.now() - this.staleMs; for (const [hex, aircraft] of this.mlatAircraft) if (Date.parse(aircraft.lastSeen) < cutoff) this.mlatAircraft.delete(hex); }
  private publish(): Aircraft[] { const merged = new Map<string, Aircraft>(); for (const aircraft of this.beastDecoder.snapshot()) merged.set(aircraft.icaoHex, aircraft); for (const mlat of this.mlatAircraft.values()) { const old = merged.get(mlat.icaoHex); merged.set(mlat.icaoHex, old ? this.merge(old, mlat) : mlat); } const result = [...merged.values()].filter((aircraft) => aircraft.lat !== null && aircraft.lon !== null && (aircraft.distanceKm ?? Infinity) <= this.radiusNm * 1.852); this.droppedTracks += Math.max(0, merged.size - result.length); return result; }
  private transition(message: string): void { this.lastTransitionAt = new Date().toISOString(); if (message === "beast connected" || message === "mlat connected") logger.info({ subsystem: "adsb.lol-raw", message }, "Raw provider connection state changed"); }
}
