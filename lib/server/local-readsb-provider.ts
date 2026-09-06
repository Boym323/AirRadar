import { normalizeAircraftResponse, type RawReadsbAircraftResponse } from "@/lib/aircraft/normalize";
import type { AircraftProvider } from "@/lib/server/provider";
import type { ProviderSnapshot, ReceiverPosition } from "@/lib/aircraft/types";

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

  constructor(
    private readonly baseUrl: string,
    private readonly receiver: ReceiverPosition,
  ) {}

  async getSnapshot(): Promise<ProviderSnapshot> {
    const aircraftResponse = await fetchJson<RawReadsbAircraftResponse>(endpoint(this.baseUrl, "/data/aircraft.json"));
    // receiver.json is optional in a few readsb deployments. The configured
    // position remains authoritative if it is absent or has an invalid shape.
    let receiver = this.receiver;
    try {
      const receiverResponse = await fetchJson<Record<string, unknown>>(endpoint(this.baseUrl, "/data/receiver.json"));
      const lat = Number(receiverResponse.lat);
      const lon = Number(receiverResponse.lon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        receiver = { ...this.receiver, lat, lon };
      }
    } catch {
      // aircraft.json is enough to keep the radar alive.
    }

    const fetchedAt = new Date().toISOString();
    return {
      aircraft: normalizeAircraftResponse(aircraftResponse, receiver, new Date(fetchedAt)),
      receiver,
      fetchedAt,
      provider: "readsb",
    };
  }
}
