import type { Aircraft, ReceiverPosition } from "@/lib/aircraft/types";
import { haversineDistanceKm, initialBearing } from "@/lib/geo";
import { positionObservedAt } from "@/lib/aircraft/source-merge";

export interface SbsParseResult { aircraft: Aircraft | null; error: string | null; messageType?: number; }

function number(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function coordinate(value: string | undefined, min: number, max: number): number | null {
  const parsed = number(value);
  return parsed !== null && parsed >= min && parsed <= max ? parsed : null;
}
function text(value: string | undefined): string | null { const result = value?.trim() ?? ""; return result || null; }

export interface SbsParserOptions {
  origin?: "adsblol" | "adsbhub";
  source?: Aircraft["source"];
}

/** Generic BaseStation/SBS MSG parser. Remote timestamps are retained only as diagnostics; freshness is arrival time. */
export function parseSbsLine(line: string, receiver: ReceiverPosition, now = Date.now(), options: SbsParserOptions = {}): SbsParseResult {
  const fields = line.trim().split(",");
  const messageType = Number(fields[1]);
  if (fields.length < 22 || fields[0] !== "MSG" || !Number.isInteger(messageType) || messageType < 1 || messageType > 8) return { aircraft: null, error: "malformed", messageType };
  const rawIcao = fields[4]?.trim().toUpperCase();
  if (!/^[0-9A-F]{1,6}$/.test(rawIcao ?? "")) return { aircraft: null, error: "invalid_icao", messageType };
  const icaoHex = rawIcao.padStart(6, "0");
  const lat = coordinate(fields[14], -90, 90);
  const lon = coordinate(fields[15], -180, 180);
  if ((fields[14]?.trim() || fields[15]?.trim()) && (lat === null || lon === null)) return { aircraft: null, error: "invalid_position", messageType };
  const altitude = number(fields[11]);
  const groundSpeed = number(fields[12]);
  const track = number(fields[13]);
  const verticalRate = number(fields[16]);
  const lastSeen = new Date(now).toISOString();
  const source = options.source ?? "UNKNOWN";
  const origin = options.origin ?? "adsblol";
  const aircraft: Aircraft = {
    icaoHex, callsign: text(fields[10]), registration: null, aircraftType: null, aircraftDescription: null,
    lat, lon, altitude, baroAltitude: altitude, geomAltitude: null, groundSpeed, track,
    verticalRate, baroRate: verticalRate, geomRate: null, squawk: text(fields[17]), category: null,
    emergency: text(fields[19]), rssi: null, messages: null, seenSeconds: 0, seenPosSeconds: lat !== null ? 0 : null,
    lastSeen, source, origin, provenance: { seenLocal: false, seenNetwork: true, lastLocalSeen: null,
      lastNetworkSeen: lastSeen, positionOrigin: lat !== null ? origin : null, positionSource: lat !== null ? source : "UNKNOWN" },
    sourceType: origin === "adsblol" ? "sbs_in_mlat" : "sbs_30003", onGround: fields[21]?.trim().toLowerCase() === "-1" || fields[21]?.trim().toLowerCase() === "true",
    distanceKm: lat !== null && lon !== null ? haversineDistanceKm(receiver.lat, receiver.lon, lat, lon) : null,
    bearing: lat !== null && lon !== null ? initialBearing(receiver.lat, receiver.lon, lat, lon) : null,
    trail: [],
  };
  const observedAt = positionObservedAt(aircraft);
  aircraft.trail = lat !== null && lon !== null && observedAt !== null
    ? [{ lat, lon, recordedAt: new Date(observedAt).toISOString(), altitude, groundSpeed, track }]
    : [];
  return { aircraft, error: null, messageType };
}

/** Compatibility wrapper for the ADSB.lol SBS/MLAT lane. */
export function parseSbsMlatLine(line: string, receiver: ReceiverPosition, now = Date.now()): SbsParseResult {
  return parseSbsLine(line, receiver, now, { origin: "adsblol", source: "MLAT" });
}

export class SbsLineBuffer {
  private buffer = "";
  constructor(readonly maxLineBytes = 4096) {}
  push(chunk: Uint8Array | string): string[] {
    this.buffer += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    const lines: string[] = [];
    let index = -1;
    while ((index = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, index).replace(/\r$/, "");
      this.buffer = this.buffer.slice(index + 1);
      if (line && Buffer.byteLength(line, "utf8") <= this.maxLineBytes) lines.push(line);
    }
    if (Buffer.byteLength(this.buffer, "utf8") > this.maxLineBytes) this.buffer = "";
    return lines;
  }
  get bufferedBytes(): number { return Buffer.byteLength(this.buffer, "utf8"); }
}
