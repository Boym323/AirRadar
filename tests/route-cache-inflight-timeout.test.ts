import { afterEach, describe, expect, it, vi } from "vitest";
import { PostgresRouteCache } from "@/lib/server/route-postgres-cache";
import { getRouteEnrichmentTelemetry } from "@/lib/server/route-enrichment-telemetry";

const getPrismaMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/db", () => ({ getPrisma: getPrismaMock }));

afterEach(() => {
  vi.useRealTimers();
  getPrismaMock.mockReset();
});

describe("route-cache timed out SQL operation lifecycle", () => {
  it("retains an active slot until the underlying SQL finishes and measures actual late completion", async () => {
    vi.useFakeTimers();
    let finishQuery!: (rows: []) => void;
    const pending = new Promise<[]>((resolve) => { finishQuery = resolve; });
    const query = vi.fn(() => pending);
    getPrismaMock.mockReturnValue({
      raw: { sql: () => ({ returnsRow: () => ({ build: () => ({}) }) }) },
      runtime: () => ({ query }),
    });
    const store = new PostgresRouteCache();
    const key = "flight-route:ABC123:CSA123:2026-10-10";
    const before = getRouteEnrichmentTelemetry().getDbLatencyDistribution().sampleCount;
    const result = store.get(key);
    await vi.advanceTimersByTimeAsync(751);
    await expect(result).resolves.toBeNull();
    expect(query).toHaveBeenCalledOnce();
    expect(store.getDiagnostics()).toMatchObject({ active: 1, failures: 1 });
    // A timeout must not cause an additional SQL call while the old query
    // continues executing and the provider is in backoff.
    await expect(store.get(key)).resolves.toBeNull();
    expect(query).toHaveBeenCalledOnce();
    finishQuery([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getDiagnostics().active).toBe(0);
    expect(store.getDiagnostics().completedAfterCallerTimeout).toBe(1);
    expect(getRouteEnrichmentTelemetry().getDbLatencyDistribution().sampleCount).toBe(before + 1);
    const snapshot = getRouteEnrichmentTelemetry().getSnapshot();
    expect(snapshot.sql.callerTimeouts).toBeGreaterThanOrEqual(1);
    expect(snapshot.sql.completedAfterCallerTimeout).toBeGreaterThanOrEqual(1);
    expect(snapshot.sql.timing).toMatchObject({
      measurement: "db_call_elapsed",
      serverSideOnly: false,
      includesPoolWait: true,
      includesNetworkTime: true,
      connectionAcquisition: "NOT MEASURED",
    });
  });

  it("never admits more than four active DB calls and reports the fifth as rejected", async () => {
    let finishQuery!: (rows: []) => void;
    const pending = new Promise<[]>((resolve) => { finishQuery = resolve; });
    const query = vi.fn(() => pending);
    getPrismaMock.mockReturnValue({
      raw: { sql: () => ({ returnsRow: () => ({ build: () => ({}) }) }) },
      runtime: () => ({ query }),
    });
    const store = new PostgresRouteCache();
    const key = (n: number) => `flight-route:ABC12${n}:CSA123:2026-10-10`;
    const requests = [1, 2, 3, 4].map((n) => store.get(key(n)));
    await Promise.resolve();
    await expect(store.get(key(5))).resolves.toBeNull();
    expect(query).toHaveBeenCalledTimes(4);
    expect(store.getDiagnostics()).toMatchObject({ active: 4, rejectedConcurrency: 1, maxActive: 4 });
    finishQuery([]);
    await Promise.all(requests);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(store.getDiagnostics().active).toBe(0);
  });
});
