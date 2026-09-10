import type { AprsEnvelope, OgnAircraftType, OgnId, OgnPosition } from "@/lib/ogn/types";
import { classifyOgnTocall, type OgnSourceClassification } from "@/lib/ogn/source-classifier";

export const MAX_APRS_LINE_BYTES = 512;
export const DEFAULT_OGN_MAX_PACKET_AGE_MS = 120_000;
export const DEFAULT_OGN_FUTURE_TOLERANCE_MS = 10_000;

export type OgnParseFailure =
  | "envelope"
  | "unsupported"
  | "status"
  | "timestamp"
  | "coordinates"
  | "position"
  | "identity"
  | "course"
  | "speed"
  | "altitude"
  | "age"
  | "future";

export interface ParsedOgnPosition {
  position: OgnPosition;
  classification: Extract<OgnSourceClassification, { action: "accept" }>;
}

export class OgnParseError extends Error {
  readonly code: OgnParseFailure;

  constructor(code: OgnParseFailure, message: string = code) {
    super(message);
    this.name = "OgnParseError";
    this.code = code;
  }
}

export interface OgnParserOptions {
  now?: Date;
  maxPacketAgeMs?: number;
  futureToleranceMs?: number;
}

/** Parse only the TNC2 envelope. Payload parsing is intentionally separate. */
export function parseAprsEnvelope(line: string): AprsEnvelope {
  const normalized = line.replace(/\r$/, "");
  const separator = normalized.indexOf(":");
  const header = separator >= 0 ? normalized.slice(0, separator) : "";
  const payload = separator >= 0 ? normalized.slice(separator + 1) : "";
  const routeSeparator = header.indexOf(">");
  if (routeSeparator <= 0 || separator < routeSeparator + 2 || !payload) {
    throw new OgnParseError("envelope", "Invalid TNC2 envelope");
  }
  const from = header.slice(0, routeSeparator).trim();
  const route = header.slice(routeSeparator + 1).trim();
  const [tocall, ...path] = route.split(",").map((part) => part.trim());
  if (!from || !tocall || /[\r\n]/.test(normalized) || from.length > 16 || tocall.length > 16 || path.some((part) => part.length > 16)) {
    throw new OgnParseError("envelope", "Invalid TNC2 fields");
  }
  return { from, tocall: tocall.toUpperCase(), path: path.filter(Boolean), payload };
}

function parseCoordinate(value: string, latitude: boolean): number {
  const pattern = latitude ? /^(\d{2})(\d{2})\.(\d{2})([NS])$/ : /^(\d{3})(\d{2})\.(\d{2})([EW])$/;
  const match = pattern.exec(value);
  if (!match) throw new OgnParseError("coordinates", "Invalid APRS coordinate");
  const degrees = Number(match[1]);
  const minutes = Number(`${match[2]}.${match[3]}`);
  const maximumDegrees = latitude ? 90 : 180;
  if (!Number.isInteger(degrees) || !Number.isFinite(minutes) || minutes >= 60 || degrees > maximumDegrees || degrees === maximumDegrees && minutes > 0) {
    throw new OgnParseError("coordinates", "APRS coordinate outside range");
  }
  const result = degrees + minutes / 60;
  return match[4] === (latitude ? "S" : "W") ? -result : result;
}

function nearestTimestamp(time: string, now: Date): Date {
  const match = /^(\d{2})(\d{2})(\d{2})[hz]$/i.exec(time);
  if (!match) throw new OgnParseError("timestamp", "Unsupported OGN timestamp");
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3]);
  if (hour > 23 || minute > 59 || second > 59) throw new OgnParseError("timestamp", "Invalid OGN timestamp");
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const candidates = [-1, 0, 1].map((dayOffset) => new Date(dayStart + dayOffset * 86_400_000 + ((hour * 60 + minute) * 60 + second) * 1000));
  return candidates.reduce((nearest, candidate) => Math.abs(candidate.getTime() - now.getTime()) < Math.abs(nearest.getTime() - now.getTime()) ? candidate : nearest);
}

function addressType(code: number): OgnId["addressType"] {
  if (code === 1) return "icao";
  if (code === 2) return "flarm";
  if (code === 3) return "ogn";
  return "unknown";
}

function aircraftType(code: number): OgnAircraftType {
  switch (code) {
    case 1: return "glider";
    case 2: return "tow_plane";
    case 3: return "helicopter";
    case 4: return "parachute";
    case 5: return "drop_plane";
    case 6: return "hang_glider";
    case 7: return "paraglider";
    case 8: return "powered_aircraft";
    case 9: return "jet_aircraft";
    case 11: return "balloon";
    case 12: return "airship";
    case 13: return "uav";
    default: return "unknown";
  }
}

function parseId(comment: string): OgnId {
  const token = comment.split(/\s+/).find((part) => /^id/i.test(part));
  if (!token) throw new OgnParseError("identity", "OGN position has no id field");
  const match = /^id([0-9a-f]{8}|[0-9a-f]{10})$/i.exec(token);
  if (!match) throw new OgnParseError("identity", "Invalid OGN id field");
  const value = match[1].toUpperCase();
  if (value.length === 8) {
    const detail = Number.parseInt(value.slice(0, 2), 16);
    const addressTypeCode = detail & 0b11;
    const aircraftTypeCode = (detail >> 2) & 0b1111;
    return {
      address: value.slice(2),
      addressType: addressType(addressTypeCode),
      addressTypeCode,
      aircraftType: aircraftType(aircraftTypeCode),
      aircraftTypeCode,
      noTracking: Boolean(detail & 0b0100_0000),
      stealth: Boolean(detail & 0b1000_0000),
    };
  }
  const detail = Number.parseInt(value.slice(0, 4), 16);
  const addressTypeCode = (detail >> 4) & 0b11_1111;
  const aircraftTypeCode = (detail >> 10) & 0b1111;
  return {
    address: value.slice(4),
    addressType: addressType(addressTypeCode),
    addressTypeCode,
    aircraftType: aircraftType(aircraftTypeCode),
    aircraftTypeCode,
    noTracking: Boolean(detail & 0x4000),
    stealth: Boolean(detail & 0x8000),
  };
}

function parseComment(comment: string): Pick<OgnPosition, "trackDeg" | "groundSpeedKt" | "altitudeFt" | "verticalRateFpm" | "turnRateDegPerSec" | "flightLevel" | "receiverSignalDb"> {
  let trackDeg: number | null = null;
  let groundSpeedKt: number | null = null;
  let altitudeFt: number | null = null;
  let verticalRateFpm: number | null = null;
  let turnRateDegPerSec: number | null = null;
  let flightLevel: number | null = null;
  let receiverSignalDb: number | null = null;
  const tokens = comment.trim().split(/\s+/).filter(Boolean);
  for (const [index, token] of tokens.entries()) {
    const course = /^(\d{3})\/(\d{3})(?:\/A=(\d{6}))?$/.exec(token);
    if (course && index === 0) {
      trackDeg = Number(course[1]);
      const speedKph = Number(course[2]);
      if (trackDeg > 360) throw new OgnParseError("course", "Course outside range");
      if (!Number.isFinite(speedKph) || speedKph < 0) throw new OgnParseError("speed", "Speed outside range");
      groundSpeedKt = speedKph * 0.539956803;
      if (course[3]) altitudeFt = Number(course[3]);
      continue;
    }
    const altitude = /^\/A=(\d{6})$/.exec(token);
    if (altitude) {
      altitudeFt = Number(altitude[1]);
      continue;
    }
    if (/^\/A=/.test(token)) throw new OgnParseError("altitude", "Invalid altitude");
    const climb = /^([+-]\d+(?:\.\d+)?)fpm$/i.exec(token);
    if (climb) {
      const value = Number(climb[1]);
      if (!Number.isFinite(value) || Math.abs(value) > 100_000) throw new OgnParseError("position", "Invalid climb rate");
      verticalRateFpm = value;
      continue;
    }
    const turn = /^([+-]\d+(?:\.\d+)?)rot$/i.exec(token);
    if (turn) {
      const value = Number(turn[1]);
      if (!Number.isFinite(value) || Math.abs(value) > 1_000) throw new OgnParseError("position", "Invalid turn rate");
      // OGN's rot unit is half-turns/minute; 1 rot = 3 degrees/second.
      turnRateDegPerSec = value * 3;
      continue;
    }
    const level = /^FL(\d+(?:\.\d+)?)$/i.exec(token);
    if (level) {
      flightLevel = Number(level[1]);
      continue;
    }
    const signal = /^([+-]?\d+(?:\.\d+)?)dB$/i.exec(token);
    if (signal) {
      const value = Number(signal[1]);
      if (Number.isFinite(value) && Math.abs(value) <= 200) receiverSignalDb = value;
    }
  }
  // A structured first token with a malformed numeric section must fail
  // rather than silently publishing a partially interpreted position.
  if (tokens[0]?.includes("/") && !/^\d{3}\/\d{3}(?:\/A=\d{6})?$/.test(tokens[0]) && !/^\/A=\d{6}$/.test(tokens[0])) {
    throw new OgnParseError("position", "Invalid OGN position comment");
  }
  return { trackDeg, groundSpeedKt, altitudeFt, verticalRateFpm, turnRateDegPerSec, flightLevel, receiverSignalDb };
}

function receiverFromPath(path: string[]): string | null {
  const candidates = path
    .map((part) => part.replace(/\*$/, ""))
    .filter((part) => part && !/^q[A-Z]{1,2}$/i.test(part) && !/^TCP(IP)?$/i.test(part) && !/^OGNDELAY$/i.test(part) && !/^DLY\d+APRS$/i.test(part));
  const receiver = candidates.at(-1);
  return receiver && /^[A-Z0-9-]{1,16}$/i.test(receiver) ? receiver.toUpperCase() : null;
}

export function parseOgnPosition(line: string, options: OgnParserOptions = {}): ParsedOgnPosition {
  const envelope = parseAprsEnvelope(line);
  const classification = classifyOgnTocall(envelope.tocall);
  if (classification.action === "drop") {
    const failure: OgnParseFailure = classification.reason === "unknown" || classification.reason === "adsb" || classification.reason === "ground" || classification.reason === "delayed"
      ? "unsupported"
      : classification.reason;
    throw new OgnParseError(failure, `TOCALL ${envelope.tocall} is not an aircraft position source`);
  }
  if (!/^[@/]\d{6}[hz]/i.test(envelope.payload)) {
    if (envelope.payload.startsWith(">")) throw new OgnParseError("status", "Status beacon is not an aircraft position");
    throw new OgnParseError("position", "Unsupported APRS position type");
  }
  if (envelope.payload.length < 27) throw new OgnParseError("position", "APRS position is too short");
  const timestamp = nearestTimestamp(envelope.payload.slice(1, 8), options.now ?? new Date());
  const latitude = parseCoordinate(envelope.payload.slice(8, 16), true);
  const longitude = parseCoordinate(envelope.payload.slice(17, 26), false);
  const comment = parseComment(envelope.payload.slice(27));
  const id = parseId(envelope.payload.slice(27));
  const now = options.now ?? new Date();
  const ageMs = now.getTime() - timestamp.getTime();
  const maxPacketAgeMs = options.maxPacketAgeMs ?? DEFAULT_OGN_MAX_PACKET_AGE_MS;
  const futureToleranceMs = options.futureToleranceMs ?? DEFAULT_OGN_FUTURE_TOLERANCE_MS;
  if (ageMs > maxPacketAgeMs) throw new OgnParseError("age", "OGN position is delayed");
  if (ageMs < -futureToleranceMs) throw new OgnParseError("future", "OGN position is in the future");
  return {
    classification,
    position: {
      senderCallsign: envelope.from.toUpperCase(),
      tocall: envelope.tocall,
      path: envelope.path.slice(),
      lastReceiver: receiverFromPath(envelope.path),
      id,
      trackingSource: classification.source,
      latitude,
      longitude,
      ...comment,
      observedAt: timestamp.toISOString(),
      receivedAt: now.toISOString(),
    },
  };
}

/** Bounded TCP line reader for APRS-IS's 512-byte line contract. */
export class AprsLineReader {
  private readonly buffer = Buffer.alloc(MAX_APRS_LINE_BYTES);
  private length = 0;
  private discardingOversized = false;

  push(chunk: Uint8Array): { lines: string[]; oversized: number } {
    const lines: string[] = [];
    let oversized = 0;
    for (const byte of chunk) {
      if (byte === 0x0a) {
        if (this.discardingOversized) {
          oversized += 1;
        } else {
          const end = this.length > 0 && this.buffer[this.length - 1] === 0x0d ? this.length - 1 : this.length;
          lines.push(this.buffer.subarray(0, end).toString("utf8"));
        }
        this.length = 0;
        this.discardingOversized = false;
        continue;
      }
      if (this.discardingOversized) continue;
      // The APRS-IS limit includes the LF and, for the normal CRLF form, the
      // optional CR as well. Keep at most 511 bytes before LF so a 510-byte
      // body plus CR remains a valid 512-byte line.
      if (this.length >= MAX_APRS_LINE_BYTES - 1) {
        this.length = 0;
        this.discardingOversized = true;
        continue;
      }
      this.buffer[this.length++] = byte;
    }
    return { lines, oversized };
  }

  reset(): void {
    this.length = 0;
    this.discardingOversized = false;
  }
}
