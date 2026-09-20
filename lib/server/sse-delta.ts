import type { PublicStateSnapshot } from "@/lib/aircraft/types";
import { SSE_V2_PROTOCOL, type SseV2DeltaPayload, type SseV2SnapshotPayload } from "@/lib/aircraft/sse-v2";
import { getPublicAircraftChangeSet } from "@/lib/server/public-serialization";

export type SseDeltaEvent =
  | { event: "snapshot"; payload: SseV2SnapshotPayload; initial: true }
  | { event: "delta"; payload: SseV2DeltaPayload; initial: false };

export class SseDeltaEncoder {
  private sequence = 0n;
  private previous: PublicStateSnapshot | null = null;

  initial(snapshot: PublicStateSnapshot): SseV2SnapshotPayload {
    this.sequence += 1n;
    this.previous = snapshot;
    return {
      ...snapshot,
      protocol: SSE_V2_PROTOCOL,
      sequence: this.sequence.toString(10),
    };
  }

  delta(snapshot: PublicStateSnapshot): SseV2DeltaPayload {
    this.sequence += 1n;
    if (!this.previous) return this.initial(snapshot) as unknown as SseV2DeltaPayload;
    const { changed, removed } = getPublicAircraftChangeSet(this.previous, snapshot);
    this.previous = snapshot;
    const metadata: Record<string, unknown> = { ...snapshot };
    delete metadata.aircraft;
    return {
      ...metadata,
      protocol: SSE_V2_PROTOCOL,
      sequence: this.sequence.toString(10),
      changed,
      removed,
    } as unknown as SseV2DeltaPayload;
  }

  next(snapshot: PublicStateSnapshot): SseDeltaEvent {
    if (this.sequence === 0n) return { event: "snapshot", payload: this.initial(snapshot), initial: true };
    return { event: "delta", payload: this.delta(snapshot), initial: false };
  }
}
