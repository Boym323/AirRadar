/**
 * V1 Rust migration R-01: optional accelerated ATC ring containment.
 * The canonical JS geometry remains the fallback and reference implementation.
 * Never use native code unless BOTH native BEAST loader and ATC opt-in are set.
 * Prepared, frozen geometry is packed once and cached by object identity.
 */
import type { LonLat } from "@/lib/atc-context/geometry";
import { pointInPolygon } from "@/lib/atc-context/geometry";
import { getNativeBeastEngine } from "@/lib/server/native-acceleration";

const nativeMatch = process.env.AIRRADAR_NATIVE_ATC === "1"
  ? getNativeBeastEngine()?.atcRingContains
  : undefined;
const encodedRings = new WeakMap<readonly LonLat[], Buffer | null>();
const MAX_NATIVE_RING_POINTS = 65_536;

function encodeRing(ring: readonly LonLat[]): Buffer | null {
  if (ring.length > MAX_NATIVE_RING_POINTS) return null;
  const packed = Buffer.allocUnsafe(ring.length * 16);
  for (let i = 0; i < ring.length; i += 1) {
    const point = ring[i];
    if (!point || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) return null;
    packed.writeDoubleLE(point[0], i * 16);
    packed.writeDoubleLE(point[1], i * 16 + 8);
  }
  return packed;
}

/** Same result as pointInPolygon(point, [ring]); never alters public DTOs. */
export function matchAtcRing(point: LonLat, ring: LonLat[]): "inside" | "boundary" | null {
  const fallback = () => pointInPolygon(point, [ring]);
  if (!nativeMatch || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) return fallback();
  // Generic mutable inputs must not reuse stale bytes if their coordinates change.
  const frozen = Object.isFrozen(ring) && ring.every((vertex) => Object.isFrozen(vertex));
  let packed = frozen ? encodedRings.get(ring) : undefined;
  if (packed === undefined) {
    packed = encodeRing(ring);
    if (frozen) encodedRings.set(ring, packed);
  }
  if (packed === null) return fallback();
  try {
    const result = nativeMatch(packed, point[0], point[1]);
    if (result === 0) return null;
    if (result === 1) return "inside";
    if (result === 2) return "boundary";
  } catch {
    // A missing, failing, or older optional addon must never break the radar.
  }
  return fallback();
}
