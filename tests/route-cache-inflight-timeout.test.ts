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
    const metrics = getRouteEnrichmentTelemetry();
    const before = metrics.getDbLatencyDistribution().sampleCount;
    const beforeSettlement = metrics.getSnapshot().phases.dbCallSettlement.count;
    const beforeLateSettlement = metrics.getSnapshot().phases.dbLateSettlement.count;
    const beforeTimerOvershoot = metrics.getSnapshot().phases.callerTimeoutOvershoot.count;
    const beforeEventLoop = metrics.getSnapshot().sql.eventLoopAtTimeout.sampleCount;
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
    expect(snapshot.phases.dbCallSettlement.count).toBeGreaterThan(beforeSettlement);
    expect(snapshot.phases.dbReadSettlement.count).toBeGreaterThan(0);
    expect(snapshot.phases.dbWriteSettlement.measured).toBe(false);
    expect(snapshot.phases.dbLateSettlement.count).toBeGreaterThan(beforeLateSettlement);
    expect(snapshot.phases.callerTimeoutOvershoot.count).toBeGreaterThan(beforeTimerOvershoot);
    expect(snapshot.phases.callerTimeoutOvershoot.p50Ms).toBeGreaterThanOrEqual(0);
    expect(snapshot.sql.eventLoopAtTimeout.sampleCount).toBeGreaterThan(beforeEventLoop);
    expect(snapshot.sql.eventLoopAtTimeout).toMatchObject({
      scope: "process-local-recent-samples", sampleCapacity: 1024,
    });
    expect(snapshot.sql.timing).toMatchObject({
      serverSideSql: "NOT MEASURED",
      connectionAcquisition: "NOT MEASURED",
      settlement: "all-route-cache-db-calls-including-failures",
    });
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

  it("admits only one recovery probe after backoff and waits for late SQL to release its slot", async () => {
    vi.useFakeTimers();
    let finishSlow!: (rows: []) => void;
    let finishProbe!: (rows: []) => void;
    const slow = new Promise<[]>((resolve) => { finishSlow = resolve; });
    const probe = new Promise<[]>((resolve) => { finishProbe = resolve; });
    const query = vi.fn().mockImplementationOnce(() => slow).mockImplementationOnce(() => probe);
    getPrismaMock.mockReturnValue({
      raw: { sql: () => ({ returnsRow: () => ({ build: () => ({}) }) }) },
      runtime: () => ({ query }),
    });
    const store = new PostgresRouteCache();
    const key = (n: number) => `flight-route:ABC12${n}:CSA123:2026-10-10`;
    const first = store.get(key(1));
    await vi.advanceTimersByTimeAsync(751);
    await expect(first).resolves.toBeNull();
    expect(store.getDiagnostics()).toMatchObject({ active: 1, callerTimeouts: 1, failureStreak: 1 });

    await vi.advanceTimersByTimeAsync(30_001);
    // Expired cooldown must not launch fresh SQL while an older query remains active.
    await expect(store.get(key(2))).resolves.toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
    finishSlow([]);
    await vi.advanceTimersByTimeAsync(0);

    const recovering = store.get(key(2));
    await Promise.resolve();
    expect(query).toHaveBeenCalledTimes(2);
    expect(store.getDiagnostics()).toMatchObject({ probeAttempts: 1, halfOpenProbe: true });
    await expect(store.get(key(3))).resolves.toBeNull();
    expect(query).toHaveBeenCalledTimes(2);

    finishProbe([]);
    await expect(recovering).resolves.toBeNull();
    expect(store.getDiagnostics()).toMatchObject({
      active: 0, probeAttempts: 1, probeFailures: 0, retryAfter: 0, halfOpenProbe: false, failureStreak: 0,
    });
  });

  it("backs off repeated recovery failures exponentially without leaking SQL calls", async () => {
    vi.useFakeTimers();
    const query = vi.fn(async () => { throw new Error("synthetic_db_error"); });
    getPrismaMock.mockReturnValue({
      raw: { sql: () => ({ returnsRow: () => ({ build: () => ({}) }) }) },
      runtime: () => ({ query }),
    });
    const store = new PostgresRouteCache();
    const key = "flight-route:ABC123:CSA123:2026-10-10";
    await expect(store.get(key)).resolves.toBeNull();
    expect(store.getDiagnostics().retryAfter - Date.now()).toBe(30_000);
    await expect(store.get(key)).resolves.toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_001);
    await expect(store.get(key)).resolves.toBeNull();
    expect(query).toHaveBeenCalledTimes(2);
    expect(store.getDiagnostics()).toMatchObject({ failureStreak: 2, probeAttempts: 1, probeFailures: 1 });
    expect(store.getDiagnostics().retryAfter - Date.now()).toBe(60_000);
  });

  it("reserves foreground query capacity when concurrent cache writes saturate", async () => {
    let releaseWrites!: () => void;
    const writes = new Promise<void>((resolve) => { releaseWrites = resolve; });
    const execute = vi.fn(() => writes);
    const query = vi.fn(async () => []);
    getPrismaMock.mockReturnValue({
      raw: { sql: () => ({
        returnsRow: () => ({ build: () => ({}) }),
        affectedCount: () => ({ build: () => ({}) }),
      }) },
      runtime: () => ({ execute, query }),
    });
    const store = new PostgresRouteCache();
    const route = {
      callsign: "CSA123", origin: "LKPR", destination: "LZIB", source: "adsbdb",
      originAirport: { icaoCode: "LKPR", latitude: 50, longitude: 14 },
      destinationAirport: { icaoCode: "LZIB", latitude: 48, longitude: 17 },
    } as Parameters<typeof store.put>[1];
    const key = (n: number) => `flight-route:ABC12${n}:CSA123:2026-10-10`;
    const first = store.put(key(1), route, 60_000);
    const second = store.put(key(2), route, 60_000);
    await Promise.resolve();
    await store.put(key(3), route, 60_000);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(store.getDiagnostics()).toMatchObject({ activeWrites: 2, rejectedConcurrency: 1 });
    await expect(store.get(key(4))).resolves.toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
    releaseWrites();
    await Promise.all([first, second]);
    // A successful foreground GET may schedule a best-effort COUNT on the
    // next microtask. Its independent SQL slot is released asynchronously.
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(store.getDiagnostics()).toMatchObject({ active: 0, activeWrites: 0, maxActive: 3 });
    const phases = getRouteEnrichmentTelemetry().getSnapshot().phases;
    expect(phases.dbReadSettlement.measured).toBe(true);
    expect(phases.dbWriteSettlement.measured).toBe(true);
  });

  it("does not open the foreground circuit when optional COUNT maintenance fails", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("synthetic_count_failure"));
    getPrismaMock.mockReturnValue({
      raw: { sql: () => ({ returnsRow: () => ({ build: () => ({}) }) }) },
      runtime: () => ({ query }),
    });
    const store = new PostgresRouteCache();
    await expect(store.get("flight-route:ABC123:CSA123:2026-10-10")).resolves.toBeNull();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(query).toHaveBeenCalledTimes(2);
    expect(getRouteEnrichmentTelemetry().getSnapshot().phases.dbMaintenanceSettlement.errors).toBeGreaterThan(0);
    expect(getRouteEnrichmentTelemetry().getSnapshot().phases.dbMaintenanceCount.errors).toBeGreaterThan(0);
    expect(store.getDiagnostics()).toMatchObject({
      retryAfter: 0, active: 0, failureStreak: 0, failures: 1,
    });
    await expect(store.get("flight-route:ABC124:CSA123:2026-10-10")).resolves.toBeNull();
    expect(query).toHaveBeenCalledTimes(3);
  });
});
