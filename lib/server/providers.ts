import { getReceiverPosition } from "@/lib/server/config";
import { LocalReadsbProvider } from "@/lib/server/local-readsb-provider";
import { MockReadsbProvider } from "@/lib/server/mock-readsb-provider";
import type { AircraftProvider } from "@/lib/server/provider";

export function createAircraftProvider(): AircraftProvider {
  const baseUrl = process.env.READSB_BASE_URL?.trim();
  return baseUrl
    ? new LocalReadsbProvider(baseUrl, getReceiverPosition())
    : new MockReadsbProvider(getReceiverPosition());
}
