import type { AircraftView, PublicStateSnapshot } from "@/lib/aircraft/types";
import { SSE_V2_PROTOCOL, type SseV2DeltaPayload, type SseV2SnapshotPayload } from "@/lib/aircraft/sse-v2";

export type SseDeltaEvent =
  | { event: "snapshot"; payload: SseV2SnapshotPayload; initial: true }
  | { event: "delta"; payload: SseV2DeltaPayload; initial: false };

function aircraftFingerprint(aircraft: AircraftView): string {
  // JSON is used only for one public aircraft at a time. This is deliberately
  // not a cryptographic hash and avoids serializing the full snapshot merely
  // to detect a change.
  return JSON.stringify(aircraft);
}

export class SseDeltaEncoder {
  private sequence = 0n;
  private readonly aircraft = new Map<string, { value: AircraftView; fingerprint: string }>();

  initial(snapshot: PublicStateSnapshot): SseV2SnapshotPayload {
    this.sequence += 1n;
    this.aircraft.clear();
    for (const item of snapshot.aircraft) this.aircraft.set(item.icaoHex, { value: item, fingerprint: aircraftFingerprint(item) });
    return {
      ...snapshot,
      protocol: SSE_V2_PROTOCOL,
      sequence: this.sequence.toString(10),
    };
  }

  delta(snapshot: PublicStateSnapshot): SseV2DeltaPayload {
    this.sequence += 1n;
    const next = new Map<string, { value: AircraftView; fingerprint: string }>();
    for (const item of snapshot.aircraft) next.set(item.icaoHex, { value: item, fingerprint: aircraftFingerprint(item) });
    const changed: AircraftView[] = [];
    for (const item of next.values()) {
      const previous = this.aircraft.get(item.value.icaoHex);
      if (!previous || previous.fingerprint !== item.fingerprint) changed.push(item.value);
    }
    const removed = [...this.aircraft.keys()].filter((hex) => !next.has(hex)).sort();
    this.aircraft.clear();
    for (const [hex, item] of next) this.aircraft.set(hex, item);
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
