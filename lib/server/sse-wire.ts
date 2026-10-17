import type { PublicStateSnapshot } from "@/lib/aircraft/types";
import type { SseDeltaEvent } from "@/lib/server/sse-delta";
import { measureRuntime } from "@/lib/server/runtime-performance";

/**
 * The public snapshot is already shared by identity across SSE subscribers.
 * V2 change arrays are shared for the same (previous, current) snapshot pair.
 * Cache encoded, immutable wire frames at those boundaries so JSON.stringify
 * and UTF-8 encoding happen once for clients with identical state/sequence.
 *
 * Weak keys do not retain expired snapshots; the small sequence LRU also
 * bounds frames if many clients resume at different V2 sequence numbers.
 */
const FRAME_VARIANTS_PER_IDENTITY = 8;
const encodedFrames = new WeakMap<object, Map<string, Uint8Array>>();
const encoder = new TextEncoder();

export function encodeAircraftSseFrame(
  snapshot: PublicStateSnapshot,
  delta: SseDeltaEvent | null,
): Uint8Array {
  const event = delta?.event ?? "snapshot";
  const payload = delta?.payload ?? snapshot;
  // The shared changed array uniquely identifies a cached V2 transition.
  // Initial V2 and legacy V1 events use their public snapshot identity.
  const identity: object = delta?.event === "delta" ? delta.payload.changed : snapshot;
  const key = delta ? `v2:${event}:${delta.payload.sequence}` : "v1:snapshot";
  let frames = encodedFrames.get(identity);
  const cached = frames?.get(key);
  if (cached) return cached;

  const processedAircraft = delta?.event === "delta" ? delta.payload.changed.length : snapshot.aircraft.length;
  const bytes = measureRuntime("snapshot.sse-serialization", processedAircraft, () =>
    encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
  if (!frames) {
    frames = new Map<string, Uint8Array>();
    encodedFrames.set(identity, frames);
  }
  if (frames.has(key)) frames.delete(key);
  frames.set(key, bytes);
  if (frames.size > FRAME_VARIANTS_PER_IDENTITY) {
    const oldest = frames.keys().next().value;
    if (oldest !== undefined) frames.delete(oldest);
  }
  return bytes;
}
