import type { Aircraft, AircraftOperationalStatus, AircraftTargetState, ReceiverPosition } from "@/lib/aircraft/types";
import type { BeastFrame } from "./beast-parser";
import { haversineDistanceKm, initialBearing } from "@/lib/geo";
import { decodeCommB } from "./bds-decoder";
import { altitudeObservationFor, recordBeastAltitudeDecode, selectAltitudeObservation } from "@/lib/aircraft/altitude-provenance";

interface Cpr { odd: boolean; lat: number; lon: number; receivedAt: number; }
interface Track { aircraft: Partial<Aircraft> & { icaoHex: string }; cprEven?: Cpr; cprOdd?: Cpr; lastMessageAt: number; lastPositionAt: number | null; altitudeAt: number | null; baroAltitudeAt: number | null; geomAltitudeAt: number | null; altitudeDf: number | null; altitudeTypeCode: number | null; altitudeSubtype: number | null; groundSpeedAt: number | null; trackAt: number | null; verticalRateAt: number | null; extendedTelemetryAt: number | null; }

const CHARSET = "#ABCDEFGHIJKLMNOPQRSTUVWXYZ#####_###############0123456789######";
const MOD = (value: number, modulus: number) => ((value % modulus) + modulus) % modulus;
function cprN(lat: number, odd: boolean): number {
  const a = Math.abs(lat);
  if (a < 10.47047130) return 59 - (odd ? 1 : 0);
  if (a < 14.82817437) return 58 - (odd ? 1 : 0);
  if (a < 18.18626357) return 57 - (odd ? 1 : 0);
  if (a < 21.02939493) return 56 - (odd ? 1 : 0);
  if (a < 23.54504487) return 55 - (odd ? 1 : 0);
  if (a < 25.82924707) return 54 - (odd ? 1 : 0);
  if (a < 27.93898710) return 53 - (odd ? 1 : 0);
  if (a < 29.91135686) return 52 - (odd ? 1 : 0);
  if (a < 31.77209708) return 51 - (odd ? 1 : 0);
  if (a < 33.53993436) return 50 - (odd ? 1 : 0);
  if (a < 35.22899598) return 49 - (odd ? 1 : 0);
  if (a < 36.85025108) return 48 - (odd ? 1 : 0);
  if (a < 38.41241892) return 47 - (odd ? 1 : 0);
  if (a < 39.92256684) return 46 - (odd ? 1 : 0);
  if (a < 41.38651832) return 45 - (odd ? 1 : 0);
  if (a < 42.80914012) return 44 - (odd ? 1 : 0);
  if (a < 44.19454951) return 43 - (odd ? 1 : 0);
  if (a < 45.54626723) return 42 - (odd ? 1 : 0);
  if (a < 46.86733252) return 41 - (odd ? 1 : 0);
  if (a < 48.16039128) return 40 - (odd ? 1 : 0);
  if (a < 49.42776439) return 39 - (odd ? 1 : 0);
  if (a < 50.67150166) return 38 - (odd ? 1 : 0);
  if (a < 51.89342469) return 37 - (odd ? 1 : 0);
  if (a < 53.09516153) return 36 - (odd ? 1 : 0);
  if (a < 54.27817472) return 35 - (odd ? 1 : 0);
  if (a < 55.44378444) return 34 - (odd ? 1 : 0);
  if (a < 56.59318756) return 33 - (odd ? 1 : 0);
  if (a < 57.72747354) return 32 - (odd ? 1 : 0);
  if (a < 58.84763776) return 31 - (odd ? 1 : 0);
  if (a < 59.95503256) return 30 - (odd ? 1 : 0);
  if (a < 61.04997580) return 29 - (odd ? 1 : 0);
  if (a < 62.13216659) return 28 - (odd ? 1 : 0);
  if (a < 63.20694051) return 27 - (odd ? 1 : 0);
  if (a < 64.27412345) return 26 - (odd ? 1 : 0);
  if (a < 65.29606545) return 25 - (odd ? 1 : 0);
  if (a < 66.42091648) return 24 - (odd ? 1 : 0);
  if (a < 67.44883596) return 23 - (odd ? 1 : 0);
  if (a < 68.41125452) return 22 - (odd ? 1 : 0);
  if (a < 69.29485395) return 21 - (odd ? 1 : 0);
  if (a < 70.09129308) return 20 - (odd ? 1 : 0);
  if (a < 70.94649946) return 19 - (odd ? 1 : 0);
  if (a < 71.87456726) return 18 - (odd ? 1 : 0);
  if (a < 72.83047201) return 17 - (odd ? 1 : 0);
  if (a < 73.76133670) return 16 - (odd ? 1 : 0);
  if (a < 74.74483009) return 15 - (odd ? 1 : 0);
  if (a < 75.70485120) return 14 - (odd ? 1 : 0);
  if (a < 76.59658788) return 13 - (odd ? 1 : 0);
  if (a < 77.58659601) return 12 - (odd ? 1 : 0);
  if (a < 78.31894336) return 11 - (odd ? 1 : 0);
  if (a < 79.17414159) return 10 - (odd ? 1 : 0);
  if (a < 80.00000000) return 9 - (odd ? 1 : 0);
  return 1;
}
const cprDlat = (odd: boolean) => 360 / (odd ? 59 : 60);
function decodeId13Field(value: number): number {
  let encoded = 0;
  if (value & 0x1000) encoded |= 0x0010;
  if (value & 0x0800) encoded |= 0x1000;
  if (value & 0x0400) encoded |= 0x0020;
  if (value & 0x0200) encoded |= 0x2000;
  if (value & 0x0100) encoded |= 0x0040;
  if (value & 0x0080) encoded |= 0x4000;
  if (value & 0x0020) encoded |= 0x0100;
  if (value & 0x0010) encoded |= 0x0001;
  if (value & 0x0008) encoded |= 0x0200;
  if (value & 0x0004) encoded |= 0x0002;
  if (value & 0x0002) encoded |= 0x0400;
  if (value & 0x0001) encoded |= 0x0004;
  return encoded;
}

function modeAToModeC(value: number): number | null {
  if ((value & 0xffff8889) !== 0 || (value & 0x000000f0) === 0) return null;
  let fiveHundreds = 0;
  let oneHundreds = 0;
  if (value & 0x0010) oneHundreds ^= 0x007;
  if (value & 0x0020) oneHundreds ^= 0x003;
  if (value & 0x0040) oneHundreds ^= 0x001;
  if ((oneHundreds & 5) === 5) oneHundreds ^= 2;
  if (oneHundreds > 5) return null;
  if (value & 0x0002) fiveHundreds ^= 0x0ff;
  if (value & 0x0004) fiveHundreds ^= 0x07f;
  if (value & 0x1000) fiveHundreds ^= 0x03f;
  if (value & 0x2000) fiveHundreds ^= 0x01f;
  if (value & 0x4000) fiveHundreds ^= 0x00f;
  if (value & 0x0100) fiveHundreds ^= 0x007;
  if (value & 0x0200) fiveHundreds ^= 0x003;
  if (value & 0x0400) fiveHundreds ^= 0x001;
  if (fiveHundreds & 1) oneHundreds = 6 - oneHundreds;
  const altitude = fiveHundreds * 5 + oneHundreds - 13;
  return altitude >= -12 ? altitude * 100 : null;
}

/** Decode the 13-bit AC field used by DF0/4/16/20 surveillance replies. */
export function decodeAltitudeCode(value: number): number | null {
  if (!Number.isInteger(value) || value < 0 || value > 0x1fff || value === 0) return null;
  const m = (value >> 6) & 1;
  if (m) {
    // M=1 selects metric altitude.  The M bit is not part of the 12-bit
    // metric value; convert the transmitted metres to the public feet unit.
    const metres = ((value >> 7) << 6) | (value & 0x3f);
    return metres === 0 ? null : Math.round(metres * 3.28084);
  }
  const q = (value >> 4) & 1;
  // With Q=1, remove M and Q and concatenate the remaining altitude bits.
  const n = ((value >> 7) << 5) | (((value >> 5) & 1) << 4) | (value & 0x0f);
  if (q) return n * 25 - 1000;
  return modeAToModeC(decodeId13Field(value));
}

/** Decode the 12-bit ADS-B airborne-position barometric altitude field. */
export function decodeAdsbBarometricAltitude(value: number): number | null {
  if (!Number.isInteger(value) || value < 0 || value > 0x0fff || value === 0) return null;
  // ADS-B has no AC13 M bit here. Q=0 is the legacy Gillham representation,
  // but without the AC13 layout it cannot be decoded safely from this field.
  if (((value >> 4) & 1) === 0) return null;
  const n = ((value >> 5) << 4) | (value & 0x0f);
  return n * 25 - 1000;
}

/** Decode the 12-bit ADS-B GNSS height field (metres) to feet. */
export function decodeAdsbGnssAltitude(value: number): number | null {
  if (!Number.isInteger(value) || value <= 0 || value > 0x0fff) return null;
  return Math.round(value * 3.28084);
}
function modeSValue(bytes: Buffer): bigint {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}
function modeSBits(value: bigint, start: number, length: number, totalBits = 56): number {
  const shift = BigInt(totalBits - start - length);
  const mask = (1n << BigInt(length)) - 1n;
  return Number((value >> shift) & mask);
}
const MODE_S_CRC_POLYNOMIAL = 0xfff409n;
function modeSCrc(payload: Buffer): number {
  let value = modeSValue(payload);
  for (let bit = payload.length * 8 - 1; bit >= 24; bit -= 1) {
    if ((value >> BigInt(bit)) & 1n) value ^= MODE_S_CRC_POLYNOMIAL << BigInt(bit - 24);
  }
  return Number(value & 0xffffffn);
}
function squawkFromIdentity(identity: number): string {
  const bit = (position: number) => (identity >> (12 - position)) & 1;
  const a = (bit(5) << 2) | (bit(3) << 1) | bit(1);
  const b = (bit(11) << 2) | (bit(9) << 1) | bit(7);
  const c = (bit(4) << 2) | (bit(2) << 1) | bit(0);
  const d = (bit(12) << 2) | (bit(10) << 1) | bit(8);
  return `${a}${b}${c}${d}`;
}
function surfaceMovementSpeed(movement: number): number | null {
  if (movement === 0 || movement > 124) return null;
  if (movement === 1) return 0;
  const lower = [2, 9, 13, 39, 94, 109, 124];
  const speed = [0.125, 1, 2, 15, 70, 100, 175];
  const step = [0.125, 0.25, 0.5, 1, 2, 5];
  if (movement === 124) return 175;
  const index = lower.findIndex((value) => value > movement);
  const bin = Math.max(1, index) - 1;
  return speed[bin]! + (movement - lower[bin]!) * step[bin]!;
}
function decodeSurfacePosition(
  receiver: ReceiverPosition,
  odd: boolean,
  rawLat: number,
  rawLon: number,
): { lat: number; lon: number } {
  const latitudeStep = 90 / (odd ? 59 : 60);
  const latitude = latitudeStep * (Math.floor(receiver.lat / latitudeStep - rawLat + 0.5) + rawLat);
  const normalizedLatitude = latitude >= 90 ? latitude - 180 : latitude;
  const zones = Math.max(1, cprN(normalizedLatitude, odd));
  const longitudeStep = 90 / zones;
  const longitude = longitudeStep * (Math.floor(receiver.lon / longitudeStep - rawLon + 0.5) + rawLon);
  const normalizedLongitude = MOD(longitude + 180, 360) - 180;
  return { lat: normalizedLatitude, lon: normalizedLongitude };
}
const EMERGENCY_STATES: Record<number, string | null> = {
  0: null,
  1: "general_emergency",
  2: "lifeguard",
  3: "minimum_fuel",
  4: "no_communications",
  5: "unlawful_interference",
  6: "reserved",
  7: "reserved",
};
function callsignField(bytes: Buffer): string | null {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  let result = "";
  for (let i = 0; i < 8; i++) { const shift = BigInt((7 - i) * 6); result += CHARSET[Number((value >> shift) & 0x3fn)] ?? " "; }
  return result.replace(/_/g, " ").trim() || null;
}

export class BeastDecoder {
  private readonly tracks = new Map<string, Track>();
  private readonly bdsCounters = { commBDecoded: 0, commBAmbiguous: 0, commBRejected: 0, bds40: 0, bds44: 0, bds50: 0, bds60: 0 };
  private lastBeastTimestamp: bigint | null = null;
  private lastObservationAt: number | null = null;
  private timestampFallbacks = 0;
  private timestampDiscontinuities = 0;
  readonly maxAircraft: number;
  private readonly origin: "local" | "adsblol";
  constructor(private readonly receiver: ReceiverPosition, maxAircraft = 3000, private readonly expiryMs = 30_000, options: { origin?: "local" | "adsblol" } = {}) { this.maxAircraft = Math.max(1, Math.min(50_000, Math.trunc(maxAircraft))); this.origin = options.origin ?? "local"; }

  decode(frame: BeastFrame, receivedAt = Date.now()): Aircraft | null {
    const p = frame.payload;
    if (p.length !== 7 && p.length !== 14) return null;
    const df = p[0] >> 3;
    const longFrame = p.length === 14;
    if (longFrame && ![16, 17, 18, 20, 21].includes(df)) return null;
    if (!longFrame && ![0, 4, 5, 11].includes(df)) return null;
    const parity = modeSCrc(p);
    if (longFrame && (df === 17 || df === 18) && parity !== 0) return null;
    let icaoHex: string;
    if (longFrame && (df === 17 || df === 18)) {
      icaoHex = p.subarray(1, 4).toString("hex").toUpperCase();
    } else if (df === 11) {
      icaoHex = p.subarray(1, 4).toString("hex").toUpperCase();
    } else {
      // DF4/5/20/21 use address parity (AP), so the CRC remainder is the
      // ICAO address. Only attach the message to an already-known track;
      // otherwise an arbitrary AP value could create a false aircraft.
      icaoHex = parity.toString(16).padStart(6, "0").toUpperCase();
      if (!this.tracks.has(icaoHex)) return null;
    }
    const me = longFrame && (df === 17 || df === 18) ? p.subarray(4, 11) : null;
    const observedAt = this.observationTime(frame, receivedAt);
    const typeCode = me ? me[0] >> 3 : null;
    let track = this.tracks.get(icaoHex);
    if (!track) { const created: Track = { lastMessageAt: observedAt, lastPositionAt: null, altitudeAt: null, baroAltitudeAt: null, geomAltitudeAt: null, altitudeDf: null, altitudeTypeCode: null, altitudeSubtype: null, groundSpeedAt: null, trackAt: null, verticalRateAt: null, extendedTelemetryAt: null, aircraft: { icaoHex } }; this.tracks.set(icaoHex, created); track = created; }
    track.lastMessageAt = observedAt;
    const a = track.aircraft;
    a.icaoHex = icaoHex;
    a.lastSeen = new Date(observedAt).toISOString();
    a.source = a.source ?? "ADS-B"; a.origin = this.origin; a.sourceType = `df${df}`; a.trail ??= [];
    if (me && typeCode !== null && typeCode >= 1 && typeCode <= 4) { a.callsign = callsignField(me.subarray(1, 7)); a.category = `A${typeCode}`; }
    if (me && typeCode !== null && typeCode >= 5 && typeCode <= 8) {
      const velocity = modeSValue(me);
      const movement = modeSBits(velocity, 5, 7);
      const trackStatus = modeSBits(velocity, 12, 1);
      const trackRaw = modeSBits(velocity, 13, 7);
      const odd = modeSBits(velocity, 21, 1) === 1;
      const rawLat = modeSBits(velocity, 22, 17);
      const rawLon = modeSBits(velocity, 39, 17);
      const position = decodeSurfacePosition(this.receiver, odd, rawLat / 131072, rawLon / 131072);
      a.lat = position.lat;
      a.lon = position.lon;
      a.onGround = true;
      a.groundSpeed = surfaceMovementSpeed(movement);
      a.track = trackStatus === 1 ? trackRaw * 360 / 128 : null;
      track.lastPositionAt = observedAt;
    } else if (me && typeCode !== null && (typeCode >= 9 && typeCode <= 18 || typeCode >= 20 && typeCode <= 22)) {
      // ME bits 9..20 are a 12-bit altitude field. The following T/F/CPR
      // bits in me[2] must not be included in it.
      const adsbAltitudeCode = (me[1]! << 4) | (me[2]! >> 4);
      const decodedAltitude = typeCode >= 9 && typeCode <= 18
        ? decodeAdsbBarometricAltitude(adsbAltitudeCode)
        : decodeAdsbGnssAltitude(adsbAltitudeCode);
      if (typeCode >= 9 && typeCode <= 18) {
        a.baroAltitude = decodedAltitude;
        a.altitude = a.baroAltitude;
        if (decodedAltitude !== null) { track.baroAltitudeAt = observedAt; track.altitudeAt = observedAt; track.altitudeDf = df; track.altitudeTypeCode = typeCode; track.altitudeSubtype = null; }
      } else {
        a.geomAltitude = decodedAltitude;
        a.altitude = a.geomAltitude;
        if (decodedAltitude !== null) { track.geomAltitudeAt = observedAt; track.altitudeAt = observedAt; track.altitudeDf = df; track.altitudeTypeCode = typeCode; track.altitudeSubtype = null; }
      }
      const odd = Boolean(me[2] & 4); const cprLat = ((me[2] & 3) << 15) | (me[3] << 7) | (me[4] >> 1); const cprLon = ((me[4] & 1) << 16) | (me[5] << 8) | me[6];
      const slot: Cpr = { odd, lat: cprLat / 131072, lon: cprLon / 131072, receivedAt: observedAt };
      if (odd) track.cprOdd = slot; else track.cprEven = slot;
      const even = track.cprEven; const oddFrame = track.cprOdd;
      if (even && oddFrame && Math.abs(even.receivedAt - oddFrame.receivedAt) <= 10_000) {
        const j = Math.floor(59 * even.lat - 60 * oddFrame.lat + 0.5); const latEven = cprDlat(false) * (MOD(j, 60) + even.lat); const latOdd = cprDlat(true) * (MOD(j, 59) + oddFrame.lat);
        const normalizedEven = latEven >= 270 ? latEven - 360 : latEven; const normalizedOdd = latOdd >= 270 ? latOdd - 360 : latOdd; const useOdd = oddFrame.receivedAt > even.receivedAt; const lat = useOdd ? normalizedOdd : normalizedEven; const ni = cprN(lat, useOdd); const m = Math.floor(even.lon * (ni - 1) - oddFrame.lon * ni + 0.5); const longitude = useOdd ? (360 / Math.max(1, ni)) * (MOD(m, Math.max(1, ni)) + oddFrame.lon) : (360 / Math.max(1, ni)) * (MOD(m, Math.max(1, ni)) + even.lon);
        const normalizedLongitude = MOD(longitude + 180, 360) - 180;
        if (lat >= -90 && lat <= 90 && Number.isFinite(normalizedLongitude)) { a.lat = lat; a.lon = normalizedLongitude; track.lastPositionAt = observedAt; }
      }
    } else if (me && typeCode === 19) {
      const velocity = modeSValue(me);
      const subtype = modeSBits(velocity, 5, 3);
      const verticalRateSource = modeSBits(velocity, 35, 1);
      const verticalRateSign = modeSBits(velocity, 36, 1);
      const verticalRateMagnitude = modeSBits(velocity, 37, 9);
      const verticalRate = verticalRateMagnitude === 0
        ? null
        : (verticalRateSign ? -1 : 1) * (verticalRateMagnitude - 1) * 64;
      a.verticalRate = verticalRate;
      if (verticalRate !== null) track.verticalRateAt = observedAt;
      a.baroRate = verticalRateSource === 1 ? verticalRate : null;
      a.geomRate = verticalRateSource === 0 ? verticalRate : null;

      if (subtype === 1 || subtype === 2) {
        const ewMagnitude = modeSBits(velocity, 14, 10);
        const nsMagnitude = modeSBits(velocity, 25, 10);
        if (ewMagnitude !== 0 && nsMagnitude !== 0) {
          const scale = subtype === 2 ? 4 : 1;
          const east = (modeSBits(velocity, 13, 1) ? -1 : 1) * (ewMagnitude - 1) * scale;
          const north = (modeSBits(velocity, 24, 1) ? -1 : 1) * (nsMagnitude - 1) * scale;
          a.groundSpeed = Math.round(Math.sqrt(east * east + north * north));
          a.track = (Math.atan2(east, north) * 180 / Math.PI + 360) % 360;
          track.groundSpeedAt = observedAt; track.trackAt = observedAt;
        } else {
          a.groundSpeed = null;
          a.track = null;
        }
      } else if (subtype === 3 || subtype === 4) {
        // Subtypes 3/4 report IAS/TAS, not ground speed. The heading is still
        // useful as the best available track-like direction.
          a.track = modeSBits(velocity, 13, 1) === 1
            ? (modeSBits(velocity, 14, 1) ? -1 : 1) * modeSBits(velocity, 15, 10) * 90 / 512
            : null;
          const airspeedStatus = modeSBits(velocity, 26, 1);
          const airspeed = modeSBits(velocity, 27, 10);
          if (airspeedStatus && airspeed > 0) {
            const telemetry = a.adsbTelemetry ?? emptyTelemetry();
            const telemetryField = modeSBits(velocity, 25, 1) === 0 ? "iasKt" : "tasKt";
            if (telemetryField === "iasKt") telemetry.iasKt = airspeed; else telemetry.tasKt = airspeed;
            a.adsbTelemetry = telemetry;
            track.extendedTelemetryAt = observedAt;
            const fields = a.provenance?.fields ?? {};
            fields[telemetryField] = { origin: this.origin, protocol: "beast-mode-s", df, tc: typeCode, subtype, observedAt: new Date(observedAt).toISOString(), confidence: "high" };
            a.provenance = provenanceWithFields(a, this.origin, fields);
          }
          a.groundSpeed = null;
          if (a.track !== null) track.trackAt = observedAt;
      }

      const geoBaroSign = modeSBits(velocity, 48, 1);
      const geoBaroMagnitude = modeSBits(velocity, 49, 7);
      if (geoBaroMagnitude !== 0 && geoBaroMagnitude !== 127 && a.baroAltitude !== null && a.baroAltitude !== undefined) {
        const difference = (geoBaroMagnitude - 1) * 25 * (geoBaroSign ? -1 : 1);
        a.geomAltitude = a.baroAltitude + difference;
      }
    } else if (me && typeCode === 28) {
      const status = modeSValue(me);
      const subtype = modeSBits(status, 5, 3);
      if (subtype === 1) {
        a.emergency = EMERGENCY_STATES[modeSBits(status, 8, 3)] ?? null;
        a.squawk = squawkFromIdentity(modeSBits(status, 11, 13));
      }
    } else if (me && typeCode === 29) {
      const state = modeSValue(me);
      const modeStatus = modeSBits(state, 46, 1) === 1;
      const selectedAltitudeRaw = modeSBits(state, 9, 11);
      const targetState: AircraftTargetState = {
        subtype: modeSBits(state, 5, 2),
        selectedAltitudeFt: selectedAltitudeRaw === 0 ? null : (selectedAltitudeRaw - 1) * 32,
        selectedAltitudeSource: selectedAltitudeRaw === 0 ? "N/A" : modeSBits(state, 8, 1) === 1 ? "FMS" : "MCP/FCU",
        baroPressureHpa: modeSBits(state, 20, 9) === 0 ? null : 800 + (modeSBits(state, 20, 9) - 1) * 0.8,
        selectedHeadingDeg: modeSBits(state, 29, 1) === 0 ? null : modeSBits(state, 30, 9) * 360 / 512,
        nacp: modeSBits(state, 39, 4),
        nicBaro: modeSBits(state, 43, 1),
        sil: modeSBits(state, 44, 2),
        modeStatus,
        autopilot: modeStatus ? modeSBits(state, 47, 1) === 1 : null,
        vnavMode: modeStatus ? modeSBits(state, 48, 1) === 1 : null,
        altitudeHoldMode: modeStatus ? modeSBits(state, 49, 1) === 1 : null,
        approachMode: modeStatus ? modeSBits(state, 51, 1) === 1 : null,
        lnavMode: modeStatus ? modeSBits(state, 53, 1) === 1 : null,
        tcasOperational: modeSBits(state, 52, 1) === 1,
      };
      a.targetState = targetState;
      track.extendedTelemetryAt = observedAt;
      const fields = a.provenance?.fields ?? {};
      for (const field of ["selectedAltitudeFt", "baroPressureHpa", "selectedHeadingDeg", "targetState"]) {
        fields[field] = { origin: this.origin, protocol: "beast-mode-s", df, tc: typeCode, subtype: targetState.subtype, observedAt: new Date(observedAt).toISOString(), confidence: "high" };
      }
      a.provenance = provenanceWithFields(a, this.origin, fields);
    } else if (me && typeCode === 31) {
      const status = modeSValue(me);
      const version = modeSBits(status, 40, 3);
      const subtype = modeSBits(status, 5, 3);
      const operationalStatus: AircraftOperationalStatus = {
        subtype,
        capabilityClass: modeSBits(status, 8, 16),
        operationalMode: modeSBits(status, 24, 16),
        adsbVersion: version,
        nicSupplementA: modeSBits(status, 43, 1),
        nacp: modeSBits(status, 44, 4),
        sil: modeSBits(status, 50, 2),
        headingReference: modeSBits(status, 53, 1) === 1 ? "magnetic" : "true",
        nicBaro: subtype === 0 && version >= 1 ? modeSBits(status, 52, 1) : null,
        silSupplement: version === 2 ? modeSBits(status, 54, 1) : null,
      };
      a.operationalStatus = operationalStatus;
      track.extendedTelemetryAt = observedAt;
      const fields = a.provenance?.fields ?? {};
      fields.operationalStatus = { origin: this.origin, protocol: "beast-mode-s", df, tc: typeCode, subtype, observedAt: new Date(observedAt).toISOString(), confidence: "high" };
      a.provenance = provenanceWithFields(a, this.origin, fields);
    } else if (df === 0 || df === 4 || df === 16 || df === 20) {
      const altitude = decodeAltitudeCode(((p[2]! & 0x1f) << 8) | p[3]!);
      if (altitude !== null) {
        a.baroAltitude = altitude;
        a.altitude = altitude;
        track.baroAltitudeAt = observedAt;
        track.altitudeAt = observedAt;
        track.altitudeDf = df;
        track.altitudeTypeCode = null;
        track.altitudeSubtype = null;
      }
      a.onGround = (p[0]! & 0x07) === 1;
    } else if (df === 5 || df === 21) {
      a.squawk = squawkFromIdentity(((p[2]! & 0x1f) << 8) | p[3]!);
      a.onGround = (p[0]! & 0x07) === 1;
    } else if (df === 11) {
      a.onGround = (p[0]! & 0x07) === 4;
    }
    if (longFrame && (df === 20 || df === 21)) {
      const commB = decodeCommB(p.subarray(4, 11));
      if (!commB) this.bdsCounters.commBRejected += 1;
      else if (commB.confidence === "ambiguous") this.bdsCounters.commBAmbiguous += 1;
      else {
        this.bdsCounters.commBDecoded += 1;
        if (commB.register === "BDS4,0") this.bdsCounters.bds40 += 1;
        if (commB.register === "BDS4,4") this.bdsCounters.bds44 += 1;
        if (commB.register === "BDS5,0") this.bdsCounters.bds50 += 1;
        if (commB.register === "BDS6,0") this.bdsCounters.bds60 += 1;
        const telemetry = a.adsbTelemetry ?? emptyTelemetry();
        const values = commB.values;
        if (typeof values.iasKt === "number") telemetry.iasKt = values.iasKt;
        if (typeof values.tasKt === "number") telemetry.tasKt = values.tasKt;
        if (typeof values.mach === "number") telemetry.mach = values.mach;
        if (typeof values.magneticHeadingDeg === "number") telemetry.magneticHeadingDeg = values.magneticHeadingDeg;
        if (typeof values.trueHeadingDeg === "number") telemetry.trueHeadingDeg = values.trueHeadingDeg;
        if (typeof values.rollDeg === "number") telemetry.rollDeg = values.rollDeg;
        if (typeof values.trackRateDegPerSec === "number") telemetry.trackRateDegPerSec = values.trackRateDegPerSec;
        if (typeof values.selectedAltitudeMcpFt === "number") telemetry.selectedAltitudeMcpFt = values.selectedAltitudeMcpFt;
        if (typeof values.selectedAltitudeFmsFt === "number") telemetry.selectedAltitudeFmsFt = values.selectedAltitudeFmsFt;
        if (typeof values.navQnhHpa === "number") telemetry.navQnhHpa = values.navQnhHpa;
        if (typeof values.windDirectionDeg === "number") telemetry.windDirectionDeg = values.windDirectionDeg;
        if (typeof values.windSpeedKt === "number") telemetry.windSpeedKt = values.windSpeedKt;
        if (typeof values.outsideAirTemperatureC === "number") telemetry.outsideAirTemperatureC = values.outsideAirTemperatureC;
        if (typeof values.staticPressureHpa === "number") telemetry.staticPressureHpa = values.staticPressureHpa;
        if (typeof values.groundSpeedKt === "number" && (track.groundSpeedAt === null || observedAt - track.groundSpeedAt > 5_000)) {
          a.groundSpeed = values.groundSpeedKt;
          track.groundSpeedAt = observedAt;
        }
        const bdsModes = [
          values.vnavMode === true ? "vnav" : null,
          values.altitudeHoldMode === true ? "althold" : null,
          values.approachMode === true ? "approach" : null,
        ].filter((mode): mode is string => mode !== null);
        if (bdsModes.length > 0) telemetry.navModes = [...new Set([...telemetry.navModes, ...bdsModes])];
        if (typeof values.baroVerticalRate === "number") { a.baroRate = values.baroVerticalRate; a.verticalRate = values.baroVerticalRate; track.verticalRateAt = observedAt; }
        if (typeof values.inertialVerticalRate === "number") { a.geomRate = values.inertialVerticalRate; if (a.verticalRate === null || a.verticalRate === undefined) a.verticalRate = values.inertialVerticalRate; track.verticalRateAt = observedAt; }
        a.adsbTelemetry = telemetry;
        track.extendedTelemetryAt = observedAt;
        const fields = a.provenance?.fields ?? {};
        for (const key of Object.keys(values)) fields[key] = { origin: this.origin, protocol: "beast-mode-s", df, bds: commB.register, observedAt: new Date(observedAt).toISOString(), confidence: commB.confidence };
        if (bdsModes.length > 0) fields.navModes = { origin: this.origin, protocol: "beast-mode-s", df, bds: commB.register, observedAt: new Date(observedAt).toISOString(), confidence: commB.confidence };
        a.provenance = provenanceWithFields(a, this.origin, fields);
      }
    }
    const lat = a.lat ?? null; const lon = a.lon ?? null; a.distanceKm = lat !== null && lon !== null ? haversineDistanceKm(this.receiver.lat, this.receiver.lon, lat, lon) : null; a.bearing = lat !== null && lon !== null ? initialBearing(this.receiver.lat, this.receiver.lon, lat, lon) : null; a.seenSeconds = Math.max(0, (Date.now() - observedAt) / 1000); a.seenPosSeconds = track.lastPositionAt === null ? null : Math.max(0, (Date.now() - track.lastPositionAt) / 1000); a.onGround ??= false; a.category ??= null; a.registration ??= null; a.aircraftType ??= null; a.aircraftDescription ??= null; a.rssi ??= null; a.beastSignal = frame.signal; a.messages = (a.messages ?? 0) + 1; a.baroRate ??= null; a.geomRate ??= null; a.provenance = { ...(a.provenance ?? {}), seenLocal: this.origin === "local", seenNetwork: this.origin === "adsblol", lastLocalSeen: this.origin === "local" ? a.lastSeen! : null, lastNetworkSeen: this.origin === "adsblol" ? a.lastSeen! : null, positionOrigin: lat !== null ? this.origin : null, positionSource: lat !== null ? a.source! : "UNKNOWN" };
    a.observationTimes = { altitude: track.altitudeAt, baroAltitude: track.baroAltitudeAt, geomAltitude: track.geomAltitudeAt, groundSpeed: track.groundSpeedAt, track: track.trackAt, verticalRate: track.verticalRateAt, position: track.lastPositionAt, extendedTelemetry: track.extendedTelemetryAt, signal: observedAt };
    if (track.altitudeAt !== null && a.altitude !== null && a.altitude !== undefined) {
      const altitudeObservedAt = new Date(track.altitudeAt).toISOString();
      const fields = a.provenance.fields ?? {};
      fields.altitude = { origin: this.origin, protocol: "beast-mode-s", df: track.altitudeDf ?? undefined, tc: track.altitudeTypeCode ?? undefined, subtype: track.altitudeSubtype ?? undefined, observedAt: altitudeObservedAt, confidence: "high" };
      if (a.baroAltitude !== null && a.baroAltitude !== undefined) fields.baroAltitude = { origin: this.origin, protocol: "beast-mode-s", df: track.altitudeDf ?? undefined, tc: track.altitudeTypeCode ?? undefined, subtype: track.altitudeSubtype ?? undefined, observedAt: new Date(track.baroAltitudeAt ?? track.altitudeAt).toISOString(), confidence: "high" };
      if (a.geomAltitude !== null && a.geomAltitude !== undefined) fields.geomAltitude = { origin: this.origin, protocol: "beast-mode-s", df: track.altitudeDf ?? undefined, tc: track.altitudeTypeCode ?? undefined, subtype: track.altitudeSubtype ?? undefined, observedAt: new Date(track.geomAltitudeAt ?? track.altitudeAt).toISOString(), confidence: "high" };
      a.provenance = { ...a.provenance, fields };
      const altitudeObservation = altitudeObservationFor(a as Aircraft, "altitude", receivedAt);
      if (altitudeObservation) {
        const altitudeDecision = selectAltitudeObservation(icaoHex, [altitudeObservation], receivedAt);
        a.altitudeObservation = altitudeObservation;
        a.altitudeDecision = altitudeDecision;
        recordBeastAltitudeDecode(icaoHex, altitudeObservation, altitudeDecision);
      }
    }
    this.expire(observedAt); return a as Aircraft;
  }
  snapshot(now = Date.now()): Aircraft[] { this.expire(now); return [...this.tracks.values()].map((track) => ({ ...track.aircraft, trail: track.aircraft.trail ?? [] } as Aircraft)); }
  getDiagnostics(): typeof this.bdsCounters & { timestampFallbacks: number; timestampDiscontinuities: number } {
    return { ...this.bdsCounters, timestampFallbacks: this.timestampFallbacks, timestampDiscontinuities: this.timestampDiscontinuities };
  }
  private expire(now: number): void { for (const [hex, track] of this.tracks) if (now - track.lastMessageAt > this.expiryMs) this.tracks.delete(hex); while (this.tracks.size > this.maxAircraft) { let oldestHex: string | null = null; let oldestAt = Number.POSITIVE_INFINITY; for (const [hex, track] of this.tracks) if (track.lastMessageAt < oldestAt) { oldestAt = track.lastMessageAt; oldestHex = hex; } if (!oldestHex) break; this.tracks.delete(oldestHex); } }
  private observationTime(frame: BeastFrame, receivedAt: number): number {
    if (frame.timestamp.length !== 6 || frame.timestamp.every((value) => value === 0)) {
      this.timestampFallbacks += 1;
      return receivedAt;
    }
    let ticks = 0n; for (const byte of frame.timestamp) ticks = (ticks << 8n) | BigInt(byte);
    if (this.lastBeastTimestamp === null) { this.lastBeastTimestamp = ticks; this.lastObservationAt = receivedAt; return receivedAt; }
    const deltaTicks = ticks >= this.lastBeastTimestamp
      ? ticks - this.lastBeastTimestamp
      : (this.lastBeastTimestamp - ticks > 0x800000000000n ? ticks + 0x1000000000000n - this.lastBeastTimestamp : -1n);
    if (deltaTicks < 0n || deltaTicks > 0x100000000000n) {
      this.timestampDiscontinuities += 1;
      this.lastBeastTimestamp = ticks;
      this.lastObservationAt = receivedAt;
      return receivedAt;
    }
    const candidate = (this.lastObservationAt ?? receivedAt) + Number(deltaTicks) / 12_000;
    this.lastBeastTimestamp = ticks;
    if (!Number.isFinite(candidate) || Math.abs(candidate - receivedAt) > 86_400_000) {
      this.timestampDiscontinuities += 1;
      this.lastObservationAt = receivedAt;
      return receivedAt;
    }
    this.lastObservationAt = candidate; return candidate;
  }
}

function provenanceWithFields(
  aircraft: Partial<Aircraft>,
  origin: "local" | "adsblol",
  fields: NonNullable<Aircraft["provenance"]>["fields"],
): NonNullable<Aircraft["provenance"]> {
  const existing = aircraft.provenance;
  return {
    seenLocal: existing?.seenLocal ?? origin === "local",
    seenNetwork: existing?.seenNetwork ?? origin === "adsblol",
    lastLocalSeen: existing?.lastLocalSeen ?? (origin === "local" ? aircraft.lastSeen ?? null : null),
    lastNetworkSeen: existing?.lastNetworkSeen ?? (origin === "adsblol" ? aircraft.lastSeen ?? null : null),
    positionOrigin: existing?.positionOrigin ?? null,
    positionSource: existing?.positionSource ?? aircraft.source ?? "UNKNOWN",
    ...(existing?.networkSources ? { networkSources: existing.networkSources } : {}),
    fields,
  };
}

function emptyTelemetry(): NonNullable<Aircraft["adsbTelemetry"]> {
  return { iasKt: null, tasKt: null, mach: null, windDirectionDeg: null, windSpeedKt: null, outsideAirTemperatureC: null, totalAirTemperatureC: null, staticPressureHpa: null, navQnhHpa: null, selectedAltitudeMcpFt: null, selectedAltitudeFmsFt: null, selectedHeadingDeg: null, navModes: [], nic: null, containmentRadiusM: null, nacP: null, nacV: null, sil: null, silType: null, gva: null, sda: null, adsbVersion: null, alert: null, spi: null, dbFlags: null, magneticHeadingDeg: null, trueHeadingDeg: null, rollDeg: null, trackRateDegPerSec: null };
}
