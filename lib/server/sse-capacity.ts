/** Hard cap for simultaneous browser/server-sent event sessions in this Node process. */
export const MAX_SSE_CLIENTS = 128;

let activeClients = 0;
let activeV1Clients = 0;
let activeV2Clients = 0;
let lastV2SnapshotBytes: number | null = null;
let lastV2DeltaBytes: number | null = null;
let recentDeltaChanged = 0;
let recentDeltaRemoved = 0;
let recentDeltaSamples = 0;
let recentDeltaBytes = 0;
const MAX_RECENT_DELTA_SAMPLES = 32;

export type SseProtocol = "v1" | "v2";

export function acquireSseClient(protocol: SseProtocol = "v1"): (() => void) | null {
  if (activeClients >= MAX_SSE_CLIENTS) return null;
  activeClients += 1;
  if (protocol === "v2") activeV2Clients += 1;
  else activeV1Clients += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeClients = Math.max(0, activeClients - 1);
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
    lastV2SnapshotBytes,
    lastV2DeltaBytes,
    recentDeltaChanged,
    recentDeltaRemoved,
    recentDeltaSamples,
    recentDeltaAverageBytes: recentDeltaSamples ? Math.trunc(recentDeltaBytes / recentDeltaSamples) : null,
  };
}
