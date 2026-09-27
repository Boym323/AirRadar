import type { Aircraft, ReceiverPosition } from "@/lib/aircraft/types";
import type { BeastFrame } from "./beast-parser";
import { haversineDistanceKm, initialBearing } from "@/lib/geo";

interface Cpr { odd: boolean; lat: number; lon: number; receivedAt: number; }
interface Track { aircraft: Partial<Aircraft> & { icaoHex: string }; cprEven?: Cpr; cprOdd?: Cpr; lastMessageAt: number; lastPositionAt: number | null; }

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
function altitudeFromGillham(value: number): number | null {
  const q = (value >> 4) & 1;
  // With Q=1, remove the Q bit and concatenate the remaining altitude
  // bits. The upper part is not limited to four bits: doing so turns the
  // 37,000 ft code (0xbf0) into n=15, i.e. -625 ft.
  const n = ((value >> 5) << 4) | (value & 0x0f);
  return q ? n * 25 - 1000 : null;
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
  readonly maxAircraft: number;
  private readonly origin: "local" | "adsblol";
  constructor(private readonly receiver: ReceiverPosition, maxAircraft = 3000, private readonly expiryMs = 30_000, options: { origin?: "local" | "adsblol" } = {}) { this.maxAircraft = Math.max(1, Math.min(50_000, Math.trunc(maxAircraft))); this.origin = options.origin ?? "local"; }

  decode(frame: BeastFrame, receivedAt = Date.now()): Aircraft | null {
    const p = frame.payload;
    if (p.length !== 14) return null;
    const df = p[0] >> 3;
    if (df !== 17 && df !== 18) return null;
    if (modeSCrc(p) !== 0) return null;
    const icaoHex = p.subarray(1, 4).toString("hex").toUpperCase();
    const me = p.subarray(4, 11);
    const typeCode = me[0] >> 3;
    let track = this.tracks.get(icaoHex);
    if (!track) { const created: Track = { lastMessageAt: receivedAt, lastPositionAt: null, aircraft: { icaoHex } }; this.tracks.set(icaoHex, created); track = created; }
    track.lastMessageAt = receivedAt;
    const a = track.aircraft;
    a.icaoHex = icaoHex;
    a.lastSeen = new Date(receivedAt).toISOString();
    a.source = a.source ?? "ADS-B"; a.origin = this.origin; a.sourceType = `df${df}`; a.trail ??= [];
    if (typeCode >= 1 && typeCode <= 4) a.callsign = callsignField(me.subarray(1, 7));
    if (typeCode >= 5 && typeCode <= 8) {
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
      track.lastPositionAt = receivedAt;
    } else if (typeCode >= 9 && typeCode <= 18 || typeCode >= 20 && typeCode <= 22) {
      const decodedAltitude = altitudeFromGillham(((me[1] & 0x1f) << 8) | me[2]);
      if (typeCode >= 9 && typeCode <= 18) {
        a.baroAltitude = decodedAltitude;
        a.altitude = a.baroAltitude;
      } else {
        a.geomAltitude = decodedAltitude;
        a.altitude = a.geomAltitude;
      }
      const odd = Boolean(me[2] & 4); const cprLat = ((me[2] & 3) << 15) | (me[3] << 7) | (me[4] >> 1); const cprLon = ((me[4] & 1) << 16) | (me[5] << 8) | me[6];
      const slot: Cpr = { odd, lat: cprLat / 131072, lon: cprLon / 131072, receivedAt };
      if (odd) track.cprOdd = slot; else track.cprEven = slot;
      const even = track.cprEven; const oddFrame = track.cprOdd;
      if (even && oddFrame && Math.abs(even.receivedAt - oddFrame.receivedAt) <= 10_000) {
        const j = Math.floor(59 * even.lat - 60 * oddFrame.lat + 0.5); const latEven = cprDlat(false) * (MOD(j, 60) + even.lat); const latOdd = cprDlat(true) * (MOD(j, 59) + oddFrame.lat);
        const normalizedEven = latEven >= 270 ? latEven - 360 : latEven; const normalizedOdd = latOdd >= 270 ? latOdd - 360 : latOdd; const useOdd = oddFrame.receivedAt > even.receivedAt; const lat = useOdd ? normalizedOdd : normalizedEven; const ni = cprN(lat, useOdd); const m = Math.floor(even.lon * (ni - 1) - oddFrame.lon * ni + 0.5); const longitude = useOdd ? (360 / Math.max(1, ni)) * (MOD(m, Math.max(1, ni)) + oddFrame.lon) : (360 / Math.max(1, ni)) * (MOD(m, Math.max(1, ni)) + even.lon);
        const normalizedLongitude = MOD(longitude + 180, 360) - 180;
        if (lat >= -90 && lat <= 90 && Number.isFinite(normalizedLongitude)) { a.lat = lat; a.lon = normalizedLongitude; track.lastPositionAt = receivedAt; }
      }
    } else if (typeCode === 19) {
      const velocity = modeSValue(me);
      const subtype = modeSBits(velocity, 5, 3);
      const verticalRateSource = modeSBits(velocity, 35, 1);
      const verticalRateSign = modeSBits(velocity, 36, 1);
      const verticalRateMagnitude = modeSBits(velocity, 37, 9);
      const verticalRate = verticalRateMagnitude === 0
        ? null
        : (verticalRateSign ? -1 : 1) * (verticalRateMagnitude - 1) * 64;
      a.verticalRate = verticalRate;
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
        } else {
          a.groundSpeed = null;
          a.track = null;
        }
      } else if (subtype === 3 || subtype === 4) {
        // Subtypes 3/4 report IAS/TAS, not ground speed. The heading is still
        // useful as the best available track-like direction.
        a.track = modeSBits(velocity, 13, 1) === 1
          ? modeSBits(velocity, 14, 10) / 1024 * 360
          : null;
        a.groundSpeed = null;
      }

      const geoBaroSign = modeSBits(velocity, 48, 1);
      const geoBaroMagnitude = modeSBits(velocity, 49, 7);
      if (geoBaroMagnitude !== 0 && geoBaroMagnitude !== 127 && a.baroAltitude !== null && a.baroAltitude !== undefined) {
        const difference = (geoBaroMagnitude - 1) * 25 * (geoBaroSign ? -1 : 1);
        a.geomAltitude = a.baroAltitude + difference;
      }
    } else if (typeCode === 28) {
      const status = modeSValue(me);
      const subtype = modeSBits(status, 5, 3);
      if (subtype === 1) {
        a.emergency = EMERGENCY_STATES[modeSBits(status, 8, 3)] ?? null;
        a.squawk = squawkFromIdentity(modeSBits(status, 11, 13));
      }
    }
    const lat = a.lat ?? null; const lon = a.lon ?? null; a.distanceKm = lat !== null && lon !== null ? haversineDistanceKm(this.receiver.lat, this.receiver.lon, lat, lon) : null; a.bearing = lat !== null && lon !== null ? initialBearing(this.receiver.lat, this.receiver.lon, lat, lon) : null; a.seenSeconds = Math.max(0, (Date.now() - receivedAt) / 1000); a.seenPosSeconds = track.lastPositionAt === null ? null : Math.max(0, (Date.now() - track.lastPositionAt) / 1000); a.onGround ??= false; a.category ??= null; a.registration ??= null; a.aircraftType ??= null; a.aircraftDescription ??= null; a.rssi ??= null; a.messages = (a.messages ?? 0) + 1; a.baroRate ??= null; a.geomRate ??= null; a.provenance = { seenLocal: this.origin === "local", seenNetwork: this.origin === "adsblol", lastLocalSeen: this.origin === "local" ? a.lastSeen! : null, lastNetworkSeen: this.origin === "adsblol" ? a.lastSeen! : null, positionOrigin: lat !== null ? this.origin : null, positionSource: lat !== null ? a.source! : "UNKNOWN" };
    this.expire(receivedAt); return a as Aircraft;
  }
  snapshot(now = Date.now()): Aircraft[] { this.expire(now); return [...this.tracks.values()].map((track) => ({ ...track.aircraft, trail: track.aircraft.trail ?? [] } as Aircraft)); }
  private expire(now: number): void { for (const [hex, track] of this.tracks) if (now - track.lastMessageAt > this.expiryMs) this.tracks.delete(hex); while (this.tracks.size > this.maxAircraft) { let oldestHex: string | null = null; let oldestAt = Number.POSITIVE_INFINITY; for (const [hex, track] of this.tracks) if (track.lastMessageAt < oldestAt) { oldestAt = track.lastMessageAt; oldestHex = hex; } if (!oldestHex) break; this.tracks.delete(oldestHex); } }
}
