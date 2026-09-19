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
  const q = (value >> 4) & 1; const n = ((value & 0x0f) << 4) | ((value >> 5) & 0x0f); return q ? n * 25 - 1000 : null;
}
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
  constructor(private readonly receiver: ReceiverPosition, maxAircraft = 3000, private readonly expiryMs = 30_000) { this.maxAircraft = maxAircraft; }

  decode(frame: BeastFrame, receivedAt = Date.now()): Aircraft | null {
    const p = frame.payload;
    if (p.length !== 2 && p.length !== 7 && p.length !== 14) return null;
    const df = p[0] >> 3;
    if (p.length < 7 || (df !== 17 && df !== 18)) return null;
    const icaoHex = p.subarray(1, 4).toString("hex").toUpperCase();
    const me = p.subarray(4, 11);
    const typeCode = me[0] >> 3;
    let track = this.tracks.get(icaoHex);
    if (!track) { const created: Track = { lastMessageAt: receivedAt, lastPositionAt: null, aircraft: { icaoHex } }; this.tracks.set(icaoHex, created); track = created; }
    track.lastMessageAt = receivedAt;
    const a = track.aircraft;
    a.icaoHex = icaoHex;
    a.lastSeen = new Date(receivedAt).toISOString();
    a.source = "ADS-B"; a.origin = "local"; a.sourceType = `df${df}`; a.trail ??= [];
    if (typeCode >= 1 && typeCode <= 4) a.callsign = callsignField(me.subarray(1, 7));
    if (typeCode >= 9 && typeCode <= 18 || typeCode >= 20 && typeCode <= 22) {
      a.baroAltitude = altitudeFromGillham(((me[1] & 7) << 8) | me[2]); a.altitude = a.baroAltitude;
      const odd = Boolean(me[2] & 4); const cprLat = ((me[2] & 3) << 15) | (me[3] << 7) | (me[4] >> 1); const cprLon = ((me[4] & 1) << 16) | (me[5] << 8) | me[6];
      const slot: Cpr = { odd, lat: cprLat / 131072, lon: cprLon / 131072, receivedAt };
      if (odd) track.cprOdd = slot; else track.cprEven = slot;
      const even = track.cprEven; const oddFrame = track.cprOdd;
      if (even && oddFrame && receivedAt - Math.min(even.receivedAt, oddFrame.receivedAt) <= 10_000) {
        const j = Math.floor(59 * even.lat - 60 * oddFrame.lat + 0.5); const latEven = cprDlat(false) * (MOD(j, 60) + even.lat); const latOdd = cprDlat(true) * (MOD(j, 59) + oddFrame.lat);
        const normalizedEven = latEven >= 270 ? latEven - 360 : latEven; const normalizedOdd = latOdd >= 270 ? latOdd - 360 : latOdd; const useOdd = oddFrame.receivedAt > even.receivedAt; const lat = useOdd ? normalizedOdd : normalizedEven; const ni = cprN(lat, useOdd); const m = Math.floor(even.lon * (ni - 1) - oddFrame.lon * ni + 0.5); const longitude = useOdd ? (360 / Math.max(1, ni)) * (MOD(m, Math.max(1, ni)) + oddFrame.lon) : (360 / Math.max(1, ni)) * (MOD(m, Math.max(1, ni)) + even.lon);
        a.lat = lat; a.lon = longitude >= 180 ? longitude - 360 : longitude; track.lastPositionAt = receivedAt;
      }
    } else if (typeCode === 19) {
      const subtype = me[1] & 7; if (subtype >= 1 && subtype <= 4) { const ew = ((me[2] & 3) << 8) | me[3]; const ns = ((me[4] & 3) << 8) | me[5]; const ewSpeed = ew ? ew - 1 : 0; const nsSpeed = ns ? ns - 1 : 0; const east = me[2] & 4 ? -ewSpeed : ewSpeed; const north = me[4] & 4 ? -nsSpeed : nsSpeed; a.groundSpeed = Math.round(Math.sqrt(east * east + north * north)); a.track = Math.round((Math.atan2(east, north) * 180 / Math.PI + 360) % 360); } const vr = ((me[6] & 7) << 6) | (me[7] >> 2); if (vr) a.verticalRate = (me[6] & 8 ? -1 : 1) * (vr - 1) * 64;
    } else if (typeCode === 28) { a.squawk = String(((me[1] & 7) << 9) | ((me[2] & 7) << 6) | ((me[3] & 7) << 3) | (me[4] & 7)).padStart(4, "0"); a.emergency = String((me[1] >> 2) & 7); }
    const lat = a.lat ?? null; const lon = a.lon ?? null; a.distanceKm = lat !== null && lon !== null ? haversineDistanceKm(this.receiver.lat, this.receiver.lon, lat, lon) : null; a.bearing = lat !== null && lon !== null ? initialBearing(this.receiver.lat, this.receiver.lon, lat, lon) : null; a.seenSeconds = Math.max(0, (Date.now() - receivedAt) / 1000); a.seenPosSeconds = track.lastPositionAt === null ? null : Math.max(0, (Date.now() - track.lastPositionAt) / 1000); a.onGround = false; a.category = null; a.registration = null; a.aircraftType = null; a.aircraftDescription = null; a.rssi = null; a.messages = (a.messages ?? 0) + 1; a.baroRate = a.verticalRate ?? null; a.geomAltitude = null; a.geomRate = null; a.provenance = { seenLocal: true, seenNetwork: false, lastLocalSeen: a.lastSeen, lastNetworkSeen: null, positionOrigin: lat !== null ? "local" : null, positionSource: a.source! };
    this.expire(receivedAt); return a as Aircraft;
  }
  snapshot(now = Date.now()): Aircraft[] { this.expire(now); return [...this.tracks.values()].map((track) => ({ ...track.aircraft, trail: track.aircraft.trail ?? [] } as Aircraft)); }
  private expire(now: number): void { for (const [hex, track] of this.tracks) if (now - track.lastMessageAt > this.expiryMs) this.tracks.delete(hex); while (this.tracks.size > this.maxAircraft) { const oldest = [...this.tracks.entries()].sort((a, b) => a[1].lastMessageAt - b[1].lastMessageAt)[0]; if (!oldest) break; this.tracks.delete(oldest[0]); } }
}
