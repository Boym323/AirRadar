/**
 * Server-only, opt-in SondeHub MQTT-over-WebSocket batch consumer.
 * No browser connects directly to the provider and no telemetry is written
 * to canonical ADS-B/OGN, SSE or PostgreSQL state.
 */
import { getAirRadarUserAgent } from "@/lib/server/user-agent";
import { getReceiverPosition } from "@/lib/server/config";
import { normalizeLatestSondes, type SondePoint } from "@/lib/server/sondehub-provider";

const URL_ENDPOINT = "https://api.v2.sondehub.org/sondes/websocket";
const MAX_MESSAGE = 1024 * 1024;
const MAX_SONDES = 300;
const MAX_AGE_MS = 15 * 60_000;
const CLIENT_IDLE_MS = 5 * 60_000;
const RETRY_MS = 90_000;
const SUB_TOPIC = "batch";

export function isSondeMqttEnabled(): boolean {
  return process.env.SONDEHUB_ENABLED?.trim().toLowerCase() === "true"
    && process.env.SONDEHUB_MQTT_ENABLED?.trim().toLowerCase() === "true";
}

function remainingLength(size: number): number[] {
  if (!Number.isInteger(size) || size < 0 || size > 268_435_455) throw new Error("MQTT length invalid");
  const out: number[] = [];
  do {
    let part = size % 128;
    size = Math.floor(size / 128);
    if (size > 0) part |= 0x80;
    out.push(part);
  } while (size > 0);
  return out;
}
function stringField(s: string): Uint8Array {
  const encoded = new TextEncoder().encode(s);
  if (encoded.length > 0xffff) throw new Error("MQTT string too long");
  return Uint8Array.of(encoded.length >> 8, encoded.length & 0xff, ...encoded);
}
function packet(header: number, body: Uint8Array): Uint8Array {
  return Uint8Array.of(header, ...remainingLength(body.length), ...body);
}
/** MQTT 3.1.1, clean session, 60s keepalive, no authentication credentials. */
export function mqttConnectPacket(clientId: string): Uint8Array {
  const body = Uint8Array.of(...stringField("MQTT"), 4, 2, 0, 60, ...stringField(clientId));
  return packet(0x10, body);
}
export function mqttSubscribePacket(topic = SUB_TOPIC): Uint8Array {
  return packet(0x82, Uint8Array.of(0, 1, ...stringField(topic), 0));
}
export function mqttPubAck(idHigh: number, idLow: number): Uint8Array {
  return Uint8Array.of(0x40, 0x02, idHigh, idLow);
}
interface MqttPacket { type: number; flags: number; payload: Uint8Array; }
/** Incremental, length-checked frame decoder supporting coalesced/split messages. */
export function splitMqttPackets(input: Uint8Array): { packets: MqttPacket[]; remainder: Uint8Array } {
  if (input.length > MAX_MESSAGE) throw new Error("MQTT buffer exceeds bound");
  const packets: MqttPacket[] = [];
  let offset = 0;
  while (offset < input.length) {
    const header = input[offset];
    let length = 0, multiplier = 1, index = offset + 1, complete = false;
    for (let i = 0; i < 4; i++) {
      if (index >= input.length) break;
      const digit = input[index++];
      length += (digit & 127) * multiplier;
      if (!(digit & 128)) { complete = true; break; }
      multiplier *= 128;
    }
    if (!complete) {
      if (index < input.length && index - offset >= 5) throw new Error("Invalid MQTT length");
      break;
    }
    if (length > MAX_MESSAGE || index + length > offset + MAX_MESSAGE) throw new Error("MQTT packet too large");
    if (index + length > input.length) break;
    packets.push({ type: header >> 4, flags: header & 0x0f, payload: input.slice(index, index + length) });
    offset = index + length;
    if (packets.length > 32) throw new Error("Too many MQTT packets");
  }
  return { packets, remainder: input.slice(offset) };
}
export function mqttPublishPayload(packet: MqttPacket): { topic: string; data: Uint8Array; ack: [number, number] | null } | null {
  if (packet.type !== 3 || packet.payload.length < 2) return null;
  const n = (packet.payload[0] << 8) | packet.payload[1];
  if (n < 1 || n > 100 || 2 + n > packet.payload.length) return null;
  const topic = new TextDecoder("utf-8", { fatal: true }).decode(packet.payload.slice(2, 2 + n));
  const qos = (packet.flags >> 1) & 3;
  if (qos > 1) return null;
  const afterTopic = 2 + n;
  if (qos === 1 && afterTopic + 2 > packet.payload.length) return null;
  const ack: [number, number] | null = qos === 1
    ? [packet.payload[afterTopic], packet.payload[afterTopic + 1]] : null;
  return { topic, data: packet.payload.slice(afterTopic + (ack ? 2 : 0)), ack };
}

function fromBatchJson(raw: unknown): Record<string, unknown> {
  const rows = Array.isArray(raw) ? raw : raw && typeof raw === "object"
    ? Object.values(raw as Record<string, unknown>) : [];
  const out: Record<string, unknown> = {};
  for (const value of rows.slice(0, 3000)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const row = value as Record<string, unknown>;
    if (typeof row.serial !== "string" || row.serial.length > 40) continue;
    out[row.serial] = row;
  }
  return out;
}
export function normalizeMqttSondeBatch(raw: unknown, now = Date.now()): SondePoint[] {
  const { lat, lon } = getReceiverPosition();
  // Fail closed on incomplete or badly timed observations.
  return normalizeLatestSondes(fromBatchJson(raw), lat, lon, 450, now);
}
function haversineKm(a: SondePoint, lat: number, lon: number): number {
  const toRad = Math.PI / 180;
  const dLat = (a.lat - lat) * toRad, dLon = (a.lon - lon) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}
export interface SondeLiveState {
  running: boolean;
  connected: boolean;
  observedAt: string | null;
  sondes: SondePoint[];
}

export class SondeMqttReceiver {
  private socket: WebSocket | null = null;
  private readonly observations = new Map<string, SondePoint>();
  private lastDemandAt = 0;
  private lastAttemptAt = 0;
  private lastMessageAt: string | null = null;
  private connecting = false;
  private connected = false;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private buffer = new Uint8Array();
  private session = 0;

  constructor(private readonly fetcher: typeof fetch = fetch, private readonly now: () => number = Date.now) {}

  requestStart(): void {
    if (!isSondeMqttEnabled()) return;
    this.lastDemandAt = this.now();
    if (this.socket || this.connecting || this.now() - this.lastAttemptAt < RETRY_MS) return;
    void this.connect();
  }
  getSnapshot(lat: number, lon: number, radiusKm: number): SondeLiveState {
    const now = this.now();
    for (const [serial, sonde] of this.observations) {
      if (now - Date.parse(sonde.observedAt) > MAX_AGE_MS) this.observations.delete(serial);
    }
    const sondes = [...this.observations.values()].filter(x=>haversineKm(x,lat,lon)<=radiusKm)
      .sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt)).slice(0,MAX_SONDES);
    return { running: this.socket !== null || this.connecting, connected: this.connected, observedAt: this.lastMessageAt, sondes };
  }
  private cleanup(): void {
    this.connected = false;
    this.buffer = new Uint8Array();
    if (this.heartbeat) { clearInterval(this.heartbeat); this.heartbeat = null; }
    const old = this.socket;
    this.socket = null;
    if (old && old.readyState < WebSocket.CLOSING) old.close();
  }
  private async connect(): Promise<void> {
    this.connecting = true;
    this.lastAttemptAt = this.now();
    const session = ++this.session;
    try {
      const response = await this.fetcher(URL_ENDPOINT, {
        cache: "no-store", signal: AbortSignal.timeout(8_000),
        headers: { Accept: "text/plain", "User-Agent": getAirRadarUserAgent("sondehub-mqtt") },
      });
      if (!response.ok) throw new Error("SondeHub websocket URL unavailable");
      const urlString = (await response.text()).trim();
      if (urlString.length < 20 || urlString.length > 4096) throw new Error("SondeHub URL length invalid");
      const url = new URL(urlString);
      if (url.protocol !== "wss:" || !url.hostname.endsWith(".amazonaws.com")
        || !url.hostname.includes(".iot.") || url.port || url.username || url.password
        || url.pathname !== "/mqtt") throw new Error("SondeHub websocket destination invalid");
      if (session !== this.session || !isSondeMqttEnabled()) return;
      const socket = new WebSocket(urlString, ["mqtt"]);
      socket.binaryType = "arraybuffer";
      this.socket = socket;
      socket.addEventListener("open", () => {
        if (this.socket !== socket || !isSondeMqttEnabled()) return;
        const id = "airradar-" + Math.random().toString(36).slice(2, 11);
        socket.send(mqttConnectPacket(id));
        this.heartbeat = setInterval(() => {
          if (this.socket !== socket) return;
          if (!isSondeMqttEnabled() || this.now() - this.lastDemandAt > CLIENT_IDLE_MS) {
            this.cleanup();
            return;
          }
          if (socket.readyState === WebSocket.OPEN) socket.send(Uint8Array.of(0xc0, 0));
        }, 30_000);
        this.heartbeat.unref?.();
      });
      socket.addEventListener("message", (event: MessageEvent) => {
        if (this.socket !== socket || !(event.data instanceof ArrayBuffer)) return;
        try {
          const incoming = new Uint8Array(event.data);
          if (this.buffer.length + incoming.length > MAX_MESSAGE) throw new Error("Oversized MQTT frame");
          const joined = new Uint8Array(this.buffer.length + incoming.length);
          joined.set(this.buffer);
          joined.set(incoming, this.buffer.length);
          const result = splitMqttPackets(joined);
          this.buffer = result.remainder;
          for (const p of result.packets) {
            if (p.type === 2 && p.payload.length >= 2 && p.payload[1] === 0) {
              this.connected = true;
              socket.send(mqttSubscribePacket());
              continue;
            }
            if (p.type !== 3) continue;
            const pub = mqttPublishPayload(p);
            if (!pub || pub.topic !== SUB_TOPIC || pub.data.length > MAX_MESSAGE) continue;
            if (pub.ack) socket.send(mqttPubAck(pub.ack[0], pub.ack[1]));
            const decoded = JSON.parse(new TextDecoder().decode(pub.data)) as unknown;
            for (const item of normalizeMqttSondeBatch(decoded, this.now())) {
              const old = this.observations.get(item.serial);
              if (!old || item.observedAt >= old.observedAt) this.observations.set(item.serial, item);
            }
            this.lastMessageAt = new Date(this.now()).toISOString();
            while (this.observations.size > MAX_SONDES) this.observations.delete(this.observations.keys().next().value!);
          }
        } catch {
          this.cleanup(); // Decode failures never impact ADS-B or OGN.
        }
      });
      socket.addEventListener("close", () => { if (this.socket === socket) this.cleanup(); });
      socket.addEventListener("error", () => { if (this.socket === socket) this.cleanup(); });
    } catch {
      // Signed websocket URL or upstream may be unavailable; normal cached REST snapshot remains.
    } finally { this.connecting = false; }
  }
}
const globalSondeMqtt = globalThis as typeof globalThis & { __airradarSondeMqtt?: SondeMqttReceiver };
export const defaultSondeMqttReceiver = globalSondeMqtt.__airradarSondeMqtt ??= new SondeMqttReceiver();
