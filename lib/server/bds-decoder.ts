export type BdsConfidence = "high" | "medium" | "ambiguous";

export interface BdsDecoded {
  register: "BDS4,0" | "BDS4,4" | "BDS5,0" | "BDS6,0";
  confidence: BdsConfidence;
  score: number;
  values: Record<string, number | boolean>;
}

const bit = (value: bigint, index: number, length = 1) => Number((value >> BigInt(56 - index - length)) & ((1n << BigInt(length)) - 1n));
const signed = (magnitude: number, sign: number) => sign ? -magnitude : magnitude;
const angle = (raw: number, sign: number, scale: number) => (signed(raw, sign) * scale + 360) % 360;
const statusValueValid = (value: bigint, status: number, start: number, length: number) => status === 1 || bit(value, start, length) === 0;

function decode40(mb: bigint): BdsDecoded | null {
  if (mb === 0n || bit(mb, 39, 8) !== 0 || bit(mb, 51, 2) !== 0) return null;
  const mcpStatus = bit(mb, 0); const fmsStatus = bit(mb, 13); const pressureStatus = bit(mb, 26); const modeStatus = bit(mb, 47); const sourceStatus = bit(mb, 53);
  if (!statusValueValid(mb, mcpStatus, 1, 12) || !statusValueValid(mb, fmsStatus, 14, 12) || !statusValueValid(mb, pressureStatus, 27, 12) || !statusValueValid(mb, modeStatus, 48, 3) || !statusValueValid(mb, sourceStatus, 54, 2)) return null;
  const values: Record<string, number | boolean> = {};
  if (mcpStatus) values.selectedAltitudeMcpFt = bit(mb, 1, 12) * 16;
  if (fmsStatus) values.selectedAltitudeFmsFt = bit(mb, 14, 12) * 16;
  if (pressureStatus) values.navQnhHpa = 800 + bit(mb, 27, 12) / 10;
  if (modeStatus) { values.vnavMode = bit(mb, 48) === 1; values.altitudeHoldMode = bit(mb, 49) === 1; values.approachMode = bit(mb, 50) === 1; }
  if (sourceStatus) values.targetAltitudeSource = bit(mb, 54, 2);
  return { register: "BDS4,0", confidence: "high", score: 7, values };
}

function decode50(mb: bigint): BdsDecoded | null {
  if (mb === 0n) return null;
  const rs = bit(mb, 0); const ts = bit(mb, 11); const gs = bit(mb, 23); const rr = bit(mb, 34); const tas = bit(mb, 45);
  if (!statusValueValid(mb, rs, 1, 10) || !statusValueValid(mb, ts, 12, 11) || !statusValueValid(mb, gs, 24, 10) || !statusValueValid(mb, rr, 35, 10) || !statusValueValid(mb, tas, 46, 10)) return null;
  const values: Record<string, number | boolean> = {};
  if (rs) { const v = signed(bit(mb, 2, 9), bit(mb, 1)); if (Math.abs(v * 45 / 256) > 35) return null; values.rollDeg = v * 45 / 256; }
  if (ts) values.trueHeadingDeg = angle(bit(mb, 13, 10), bit(mb, 12), 90 / 512);
  if (gs) { const v = bit(mb, 24, 10) * 2; if (v > 600) return null; values.groundSpeedKt = v; }
  if (rr) values.trackRateDegPerSec = signed(bit(mb, 36, 9), bit(mb, 35)) * 8 / 256;
  if (tas) { const v = bit(mb, 46, 10) * 2; if (v > 600) return null; values.tasKt = v; }
  if (gs && tas && Math.abs(Number(values.groundSpeedKt) - Number(values.tasKt)) > 200) return null;
  return { register: "BDS5,0", confidence: "medium", score: 6, values };
}

function decode60(mb: bigint): BdsDecoded | null {
  if (mb === 0n) return null;
  const hs = bit(mb, 0); const ias = bit(mb, 12); const mach = bit(mb, 23); const baro = bit(mb, 34); const inertial = bit(mb, 45);
  if (!statusValueValid(mb, hs, 1, 11) || !statusValueValid(mb, ias, 13, 10) || !statusValueValid(mb, mach, 24, 10) || !statusValueValid(mb, baro, 35, 10) || !statusValueValid(mb, inertial, 46, 10)) return null;
  const values: Record<string, number | boolean> = {};
  if (hs) values.magneticHeadingDeg = angle(bit(mb, 2, 10), bit(mb, 1), 90 / 512);
  if (ias) { const v = bit(mb, 13, 10); if (v > 500) return null; values.iasKt = v; }
  if (mach) { const v = bit(mb, 24, 10) * 2.048 / 512; if (v > 1) return null; values.mach = v; }
  if (baro) { const v = signed(bit(mb, 36, 9), bit(mb, 35)) * 32; if (Math.abs(v) > 6000) return null; values.baroVerticalRate = v; }
  if (inertial) { const v = signed(bit(mb, 47, 9), bit(mb, 46)) * 32; if (Math.abs(v) > 6000) return null; values.inertialVerticalRate = v; }
  return { register: "BDS6,0", confidence: "medium", score: 6, values };
}

function decode44(mb: bigint): BdsDecoded | null {
  const fom = bit(mb, 0, 4); const windStatus = bit(mb, 4); if (mb === 0n || fom > 4 || windStatus === 0) return null;
  const windSpeed = bit(mb, 5, 9); const temp = signed(bit(mb, 24, 10), bit(mb, 23)) * 0.25; if (windSpeed > 250 || temp < -80 || temp > 60) return null;
  if (!statusValueValid(mb, bit(mb, 34), 35, 11) || !statusValueValid(mb, bit(mb, 46), 47, 2) || !statusValueValid(mb, bit(mb, 49), 50, 6)) return null;
  const values: Record<string, number | boolean> = { windSpeedKt: windSpeed, windDirectionDeg: bit(mb, 14, 9) * 180 / 256, outsideAirTemperatureC: temp };
  if (bit(mb, 34)) values.staticPressureHpa = bit(mb, 35, 11);
  return { register: "BDS4,4", confidence: "medium", score: 3, values };
}

export function decodeCommB(mbBytes: Buffer): BdsDecoded | null {
  if (mbBytes.length !== 7) return null;
  let mb = 0n; for (const byte of mbBytes) mb = (mb << 8n) | BigInt(byte);
  const candidates = [decode40(mb), decode50(mb), decode60(mb), decode44(mb)].filter((item): item is BdsDecoded => item !== null);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  if (candidates.length > 1 && candidates[0]!.score - candidates[1]!.score <= 1) return { ...candidates[0]!, confidence: "ambiguous", values: {} };
  return candidates[0]!;
}
