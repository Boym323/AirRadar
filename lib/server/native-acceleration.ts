/**
 * Explicit opt-in native accelerator. Never ship or load an unverified binary
 * from a relative path or an untrusted request. Missing/mismatched addons fall
 * back to TS; default production behavior is unchanged.
 */
import { createRequire } from "node:module";
import { isAbsolute } from "node:path";

export interface NativeBeastParser {
  pushPacked(chunk: Buffer): Buffer;
  pushPackedWithCrc(chunk: Buffer): Buffer;
  readonly bufferedBytes: number;
}

interface NativeBeastBindings {
  /** Experimental batched waypoint predicate, not used in production. */
  batchWaypointMatches(points: Float64Array, waypointLat: number, waypointLon: number): Buffer;
  NativeBeastParser: new (maxBufferedBytes?: number) => NativeBeastParser;
  modeSCrc(payload: Buffer): number;
}

let cached: NativeBeastBindings | null | undefined;

export function getNativeBeastEngine(): NativeBeastBindings | null {
  if (process.env.AIRRADAR_NATIVE_BEAST !== "1") return null;
  if (cached !== undefined) return cached;
  const filename = process.env.AIRRADAR_NATIVE_ADDON_PATH;
  if (!filename || !isAbsolute(filename)) {
    console.warn("[AirRadar native] Absolute AIRRADAR_NATIVE_ADDON_PATH required; using TypeScript.");
    cached = null;
    return null;
  }
  try {
    // Dynamic absolute path avoids a required .node import in Next standalone.
    const loaded = createRequire(import.meta.url)(filename) as Partial<NativeBeastBindings>;
    if (typeof loaded.NativeBeastParser !== "function"
      || typeof loaded.NativeBeastParser.prototype?.pushPacked !== "function"
      || typeof loaded.NativeBeastParser.prototype?.pushPackedWithCrc !== "function"
      || typeof loaded.modeSCrc !== "function"
      || typeof loaded.batchWaypointMatches !== "function") {
      throw new Error("Incompatible native addon ABI");
    }
    cached = loaded as NativeBeastBindings;
  } catch (error) {
    console.warn("[AirRadar native] Addon unavailable; using TypeScript:", error instanceof Error ? error.message : "unknown error");
    cached = null;
  }
  return cached;
}
