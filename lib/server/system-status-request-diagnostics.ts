type Store = { startedAtMs: number; requests: number };

const globalStore = globalThis as typeof globalThis & { airRadarSystemStatusRequestDiagnostics?: Store };
const store = globalStore.airRadarSystemStatusRequestDiagnostics ??= { startedAtMs: Date.now(), requests: 0 };

export function recordSystemStatusRequest(): void {
  store.requests += 1;
}

export function getSystemStatusRequestDiagnostics(now = Date.now()): {
  scope: "process-local";
  startedAt: string;
  requests: number;
  uptimeSeconds: number;
} {
  return {
    scope: "process-local",
    startedAt: new Date(store.startedAtMs).toISOString(),
    requests: store.requests,
    uptimeSeconds: Math.max(0, (now - store.startedAtMs) / 1000),
  };
}

export function resetSystemStatusRequestDiagnosticsForTests(): void {
  store.requests = 0;
}
