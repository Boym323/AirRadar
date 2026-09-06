import { normalizeAircraftResponse, type RawReadsbAircraftResponse } from "@/lib/aircraft/normalize";
import type { AircraftProvider } from "@/lib/server/provider";
import type { ProviderSnapshot, ReceiverPosition } from "@/lib/aircraft/types";
import { getReceiverRefreshIntervalMs } from "@/lib/server/config";

function endpoint(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\//, ""), base).toString();
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`readsb returned HTTP ${response.status}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export class LocalReadsbProvider implements AircraftProvider {
  readonly name = "readsb" as const;
  private currentReceiver: ReceiverPosition;
  private lastReceiverCheckAt = 0;
  private lastMessageCount: number | null = null;
  private lastMessageAt: number | null = null;

  constructor(
    private readonly baseUrl: string,
    receiver: ReceiverPosition,
  ) {
    this.currentReceiver = receiver;
  }

  async getSnapshot(): Promise<ProviderSnapshot> {
    const aircraftResponse = await fetchJson<RawReadsbAircraftResponse>(endpoint(this.baseUrl, "/data/aircraft.json"));
    const now = Date.now();
    if (now - this.lastReceiverCheckAt >= getReceiverRefreshIntervalMs()) {
      this.lastReceiverCheckAt = now;
      try {
        const receiverResponse = await fetchJson<Record<string, unknown>>(endpoint(this.baseUrl, "/data/receiver.json"));
        const lat = Number(receiverResponse.lat);
        const lon = Number(receiverResponse.lon);
        if (Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lon) && lon >= -180 && lon <= 180) {
          this.currentReceiver = { ...this.currentReceiver, lat, lon };
        }
      } catch {
        // aircraft.json is enough to keep the radar alive.
      }
    }

    const fetchedAt = new Date(now).toISOString();
    const messageCount = typeof aircraftResponse.messages === "number"
      ? aircraftResponse.messages
      : typeof aircraftResponse.messages === "string" ? Number(aircraftResponse.messages) : null;
    const messagesPerSecond = messageCount !== null && Number.isFinite(messageCount) && this.lastMessageCount !== null && this.lastMessageAt !== null
      ? Math.max(0, (messageCount - this.lastMessageCount) / Math.max((now - this.lastMessageAt) / 1000, 0.001))
      : null;
    this.lastMessageCount = messageCount !== null && Number.isFinite(messageCount) ? messageCount : this.lastMessageCount;
    this.lastMessageAt = now;
    return {
      aircraft: normalizeAircraftResponse(aircraftResponse, this.currentReceiver, new Date(fetchedAt)),
      receiver: this.currentReceiver,
      fetchedAt,
      provider: "readsb",
      messagesPerSecond,
    };
  }
}
