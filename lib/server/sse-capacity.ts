/** Hard cap for simultaneous browser/server-sent event sessions in this Node process. */
export const MAX_SSE_CLIENTS = 128;
/** Leave headroom so one stream family cannot consume the entire shared pool. */
export const MAX_SSE_CLIENTS_PER_CHANNEL = MAX_SSE_CLIENTS - 16;
/** Bound one trusted client identity across all SSE endpoints. */
export const MAX_SSE_CLIENTS_PER_CLIENT = 6;

let activeClients = 0;
let activeV1Clients = 0;
let activeV2Clients = 0;
const activeChannelClients: Record<SseChannel, number> = { aircraft: 0, intelligence: 0, ogn: 0 };
const activeClientCounts = new Map<string, number>();
let lastV2SnapshotBytes: number | null = null;
let lastV2DeltaBytes: number | null = null;
let recentDeltaChanged = 0;
let recentDeltaRemoved = 0;
let recentDeltaSamples = 0;
let recentDeltaBytes = 0;
const MAX_RECENT_DELTA_SAMPLES = 32;

export type SseProtocol = "v1" | "v2";
export type SseChannel = "aircraft" | "intelligence" | "ogn";

function normalizedClientKey(value: string): string {
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 128) : "anonymous";
}

export function acquireSseClient(
  protocol: SseProtocol = "v1",
  clientKey = "anonymous",
  channel: SseChannel = "aircraft",
): (() => void) | null {
  const key = normalizedClientKey(clientKey);
  if (activeClients >= MAX_SSE_CLIENTS) return null;
  if (activeChannelClients[channel] >= MAX_SSE_CLIENTS_PER_CHANNEL) return null;
  if ((activeClientCounts.get(key) ?? 0) >= MAX_SSE_CLIENTS_PER_CLIENT) return null;

  activeClients += 1;
  activeChannelClients[channel] += 1;
  activeClientCounts.set(key, (activeClientCounts.get(key) ?? 0) + 1);
  if (protocol === "v2") activeV2Clients += 1;
  else activeV1Clients += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeClients = Math.max(0, activeClients - 1);
    activeChannelClients[channel] = Math.max(0, activeChannelClients[channel] - 1);
    const clientCount = Math.max(0, (activeClientCounts.get(key) ?? 1) - 1);
    if (clientCount === 0) activeClientCounts.delete(key);
    else activeClientCounts.set(key, clientCount);
    if (protocol === "v2") activeV2Clients = Math.max(0, activeV2Clients - 1);
    else activeV1Clients = Math.max(0, activeV1Clients - 1);
  };
}

export function getActiveSseClientCount(): number {
  return activeClients;
}

export function recordSsePayload(
  protocol: SseProtocol,
  event: "snapshot" | "delta",
  bytes: number,
  changed = 0,
  removed = 0,
): void {
  if (protocol !== "v2") return;
  const safeBytes = Number.isFinite(bytes) && bytes >= 0 ? Math.min(Math.trunc(bytes), 100_000_000) : 0;
  if (event === "snapshot") {
    lastV2SnapshotBytes = safeBytes;
    return;
  }
  lastV2DeltaBytes = safeBytes;
  recentDeltaChanged += Math.min(Math.max(0, Math.trunc(changed)), 10_000);
  recentDeltaRemoved += Math.min(Math.max(0, Math.trunc(removed)), 10_000);
  recentDeltaBytes += safeBytes;
  recentDeltaSamples += 1;
  if (recentDeltaSamples > MAX_RECENT_DELTA_SAMPLES) {
    // The counters are intentionally a bounded rolling approximation. Keep
    // the most recent average without retaining payloads or client state.
    recentDeltaSamples = MAX_RECENT_DELTA_SAMPLES;
    recentDeltaChanged = Math.trunc(recentDeltaChanged / 2);
    recentDeltaRemoved = Math.trunc(recentDeltaRemoved / 2);
    recentDeltaBytes = Math.trunc(recentDeltaBytes / 2);
  }
}

export function getSseDiagnostics() {
  return {
    activeClients,
    activeV1Clients,
    activeV2Clients,
    activeChannelClients: { ...activeChannelClients },
    activeClientKeys: activeClientCounts.size,
    lastV2SnapshotBytes,
    lastV2DeltaBytes,
    recentDeltaChanged,
    recentDeltaRemoved,
    recentDeltaSamples,
    recentDeltaAverageBytes: recentDeltaSamples ? Math.trunc(recentDeltaBytes / recentDeltaSamples) : null,
  };
}
