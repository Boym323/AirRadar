import type { PublicReceiverPosition, ReceiverPosition } from "@/lib/aircraft/types";

export function receiverPositionChanged(previous: ReceiverPosition | null, next: ReceiverPosition): boolean {
  return previous === null || previous.lat !== next.lat || previous.lon !== next.lon;
}

export function shouldRecenterOnReceiver(
  provider: string,
  previousCentered: ReceiverPosition | null,
  next: ReceiverPosition | PublicReceiverPosition,
): boolean {
  return provider !== "mock"
    && next.lat !== null
    && next.lon !== null
    && receiverPositionChanged(previousCentered, next as ReceiverPosition);
}
