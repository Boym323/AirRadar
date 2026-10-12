import type { FlightRoute } from "@/lib/aircraft/types";
import { getPrisma } from "@/lib/server/db";
import { getRouteEnrichmentTelemetry } from "@/lib/server/route-enrichment-telemetry";

/** Optional read-through PostgreSQL cache. Apply deploy/sql/route-enrichment-cache-v2.sql first. */
export interface RouteCacheStore {
  get(key: string): Promise<FlightRoute | null>;
  put(key: string, route: FlightRoute, ttlMs: number): Promise<void>;
}
const MAX_JSON_LENGTH = 8_192;
const TIMEOUT_MS = 750;
const FAILURE_BACKOFF_MS = 30_000;
const MAX_FAILURE_BACKOFF_MS = 5 * 60_000;
const MAX_ACTIVE = 4;
const MAX_ACTIVE_WRITES = 2;
// Maintenance work must never contend with a foreground route lookup.
type OperationKind = "read" | "write" | "maintenance";

/** Process-local, bounded reason counters. No query text, credentials, keys or IDs. */
type DbRouteDiagnostics = {
  timeouts: number; queryFailures: number; connectionFailures: number;
  bypassBackoff: number; bypassConcurrency: number; bypassUnconfigured: number;
  lastFailureAt: string | null; lastErrorKind: "timeout" | "query" | "connection" | null;
};
const globalRouteDb = globalThis as typeof globalThis & { airRadarRouteDbReasons?: DbRouteDiagnostics };
export function getRouteDbReasonDiagnostics(): DbRouteDiagnostics {
  const state = globalRouteDb.airRadarRouteDbReasons ??= {
    timeouts: 0, queryFailures: 0, connectionFailures: 0,
    bypassBackoff: 0, bypassConcurrency: 0, bypassUnconfigured: 0,
    lastFailureAt: null, lastErrorKind: null,
  };
  return { ...state };
}
function routeDbReason(): DbRouteDiagnostics {
  getRouteDbReasonDiagnostics();
  return globalRouteDb.airRadarRouteDbReasons!;
}

const KEY = /^flight-route:[A-F0-9~]{6,7}:([A-Z0-9]{2,10}):\d{4}-\d{2}-\d{2}$/;
const SOURCES = new Set(["adsbdb", "adsblol-routeset"]);

function validAirport(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const v = value as { icaoCode?: unknown; latitude?: unknown; longitude?: unknown };
  return typeof v.icaoCode === "string" && /^[A-Z]{4}$/.test(v.icaoCode)
    && typeof v.latitude === "number" && Number.isFinite(v.latitude) && Math.abs(v.latitude) <= 90
    && typeof v.longitude === "number" && Number.isFinite(v.longitude) && Math.abs(v.longitude) <= 180;
}
export function validPersistedRoute(value: unknown): value is FlightRoute {
  if (!value || typeof value !== "object") return false;
  const r = value as Partial<FlightRoute>;
  return typeof r.callsign === "string" && /^[A-Z0-9]{2,10}$/.test(r.callsign)
    && SOURCES.has(String(r.source))
    && typeof r.origin === "string" && /^[A-Z]{4}$/.test(r.origin)
    && typeof r.destination === "string" && /^[A-Z]{4}$/.test(r.destination)
    && r.origin !== r.destination && validAirport(r.originAirport) && validAirport(r.destinationAirport);
}
export function routeMatchesCacheKey(key: string, route: FlightRoute): boolean {
  const match = KEY.exec(key);
  return !!match && match[1] === route.callsign;
}
export function decodeCachedRoute(json: string, key: string): FlightRoute | null {
  if (json.length > MAX_JSON_LENGTH) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    return validPersistedRoute(parsed) && routeMatchesCacheKey(key, parsed) ? parsed : null;
  } catch { return null; }
}
async function bounded<T>(operation: Promise<T>, onTimeout: () => void): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timeout = setTimeout(() => { onTimeout(); reject(new Error("route_db_timeout")); }, TIMEOUT_MS);
      timeout.unref?.();
    })]);
  } finally { if (timeout) clearTimeout(timeout); }
}

/** Fail-soft raw SQL over the EXISTING Prisma database connection; no DDL at runtime. */
export class PostgresRouteCache implements RouteCacheStore {
  private retryAfter = 0;
  private active = 0;
  private activeWrites = 0;
  private halfOpenProbe = false;
  private failureStreak = 0;
  private lastCleanup = 0;
  private lastCountAttempt = 0;
  private readonly stats = { hits: 0, misses: 0, writes: 0, failures: 0, bypassed: 0, rejectedConcurrency: 0, callerTimeouts: 0, completedAfterCallerTimeout: 0, maxActive: 0, probeAttempts: 0, probeFailures: 0 };
  private circuitOpenedAt: number | null = null;
  getDiagnostics() {
    return { ...this.stats, active: this.active, activeWrites: this.activeWrites, retryAfter: this.retryAfter,
      circuitOpenedAt: this.circuitOpenedAt, halfOpenProbe: this.halfOpenProbe, failureStreak: this.failureStreak };
  }

  private syncTelemetry(): void {
    const now = Date.now();
    getRouteEnrichmentTelemetry().setSqlDiagnostics({
      active: this.active, activeWrites: this.activeWrites, maxActive: this.stats.maxActive,
      rejected: this.stats.rejectedConcurrency,
      probeAttempts: this.stats.probeAttempts, probeFailures: this.stats.probeFailures,
      failureStreak: this.failureStreak, halfOpenProbe: this.halfOpenProbe,
      callerTimeouts: this.stats.callerTimeouts,
      completedAfterCallerTimeout: this.stats.completedAfterCallerTimeout,
      circuit: {
        state: this.retryAfter > 0 || this.halfOpenProbe ? "open" : "closed",
        openSince: this.circuitOpenedAt === null ? null : new Date(this.circuitOpenedAt).toISOString(),
        openDurationMs: this.circuitOpenedAt === null ? null : Math.max(0, now - this.circuitOpenedAt),
      },
      circuitOpenUntilMs: this.retryAfter > 0 ? Math.max(now + 1, this.retryAfter) : (this.halfOpenProbe ? now + TIMEOUT_MS : null),
    });
  }

  /**
   * Optional cache calls fail soft. Keep timed-out SQL counted as active until
   * it really settles (the Prisma runtime has no proven cancellation API).
   * After a fault, admit exactly one half-open probe, never a reconnect burst.
   */
  private openCircuit(): void {
    const now = Date.now();
    this.failureStreak = Math.min(this.failureStreak + 1, 5);
    this.retryAfter = now + Math.min(MAX_FAILURE_BACKOFF_MS, FAILURE_BACKOFF_MS * 2 ** (this.failureStreak - 1));
    this.circuitOpenedAt ??= now;
    this.halfOpenProbe = false;
    this.syncTelemetry();
  }

  private async run<T>(
    fallback: T, query: (database: NonNullable<ReturnType<typeof getPrisma>>) => Promise<T>,
    kind: OperationKind = "read", onTimeout?: () => void,
  ): Promise<T> {
    const now = Date.now();
    const recovering = this.retryAfter !== 0 && now >= this.retryAfter;
    const unavailable = now < this.retryAfter || this.halfOpenProbe
      || (recovering && (this.active > 0 || kind === "maintenance"));
    const saturated = this.active >= MAX_ACTIVE
      || (kind === "write" && this.activeWrites >= MAX_ACTIVE_WRITES)
      || (kind === "maintenance" && this.active > 0);
    if (unavailable || saturated) {
      const diagnostics = routeDbReason();
      if (unavailable) diagnostics.bypassBackoff += 1;
      else {
        diagnostics.bypassConcurrency += 1;
        this.stats.rejectedConcurrency++;
      }
      this.stats.bypassed++;
      getRouteEnrichmentTelemetry().record("dbBypassed");
      this.syncTelemetry();
      return fallback;
    }
    if (recovering) {
      this.halfOpenProbe = true;
      this.stats.probeAttempts++;
      this.syncTelemetry();
    }
    let db: ReturnType<typeof getPrisma>;
    try { db = getPrisma(); }
    catch {
      const diagnostics = routeDbReason();
      diagnostics.connectionFailures += 1;
      diagnostics.lastFailureAt = new Date().toISOString();
      diagnostics.lastErrorKind = "connection";
      this.stats.failures++;
      if (recovering) this.stats.probeFailures++;
      getRouteEnrichmentTelemetry().record("dbError");
      this.openCircuit();
      return fallback;
    }
    if (!db) {
      routeDbReason().bypassUnconfigured += 1;
      getRouteEnrichmentTelemetry().record("dbBypassed");
      if (recovering) {
        this.retryAfter = 0;
        this.circuitOpenedAt = null;
        this.halfOpenProbe = false;
        this.failureStreak = 0;
      }
      this.syncTelemetry();
      return fallback;
    }
    this.active++;
    if (kind === "write") this.activeWrites++;
    this.stats.maxActive = Math.max(this.stats.maxActive, this.active);
    this.syncTelemetry();
    const started = Date.now();
    let callerTimedOut = false;
    // DB-call elapsed includes pool acquisition and network delay, not only SQL.
    // A Promise.race timeout is NOT SQL cancellation.
    const operation = Promise.resolve().then(() => query(db));
    const complete = (successful: boolean) => {
      if (successful) getRouteEnrichmentTelemetry().recordDbLatency(Date.now() - started);
      if (callerTimedOut) this.stats.completedAfterCallerTimeout++;
      this.active--;
      if (kind === "write") this.activeWrites--;
      this.syncTelemetry();
    };
    void operation.then(() => complete(true), () => complete(false));
    try {
      const result = await bounded(operation, () => { callerTimedOut = true; onTimeout?.(); });
      if (recovering) {
        this.retryAfter = 0;
        this.circuitOpenedAt = null;
        this.halfOpenProbe = false;
      }
      // Reset exponential backoff only after a timely successful call.
      if (recovering || this.retryAfter === 0) this.failureStreak = 0;
      this.syncTelemetry();
      return result;
    } catch (error) {
      const diagnostics = routeDbReason();
      const timedOut = error instanceof Error && error.message === "route_db_timeout";
      if (timedOut) {
        diagnostics.timeouts += 1;
        this.stats.callerTimeouts++;
        getRouteEnrichmentTelemetry().recordPhase("callerTimeout", TIMEOUT_MS, "timeout");
      } else diagnostics.queryFailures += 1;
      diagnostics.lastFailureAt = new Date().toISOString();
      diagnostics.lastErrorKind = timedOut ? "timeout" : "query";
      this.stats.failures++;
      if (recovering) this.stats.probeFailures++;
      getRouteEnrichmentTelemetry().record("dbError");
      this.openCircuit();
      return fallback;
    }
  }

  async get(key: string): Promise<FlightRoute | null> {
    if (!KEY.test(key)) return null;
    let queried = false;
    let postgresAttempted = false;
    let postgresTimedOut = false;
    const postgresRequestStarted = Date.now();
    const raw = await this.run<string | null>(null, async (db) => {
      postgresAttempted = true;
      const rows = await db.runtime().query(db.raw.sql`
        SELECT "routeJson" FROM "public"."routeEnrichmentCache"
        WHERE "cacheKey" = ${key} AND "expiresAtMs" > ${BigInt(Date.now())}
        LIMIT 1
      `.returnsRow({ routeJson: "pg/text@1" }).build());
      queried = true;
      return rows[0]?.routeJson ?? null;
    }, "read", () => { postgresTimedOut = true; });
    if (postgresAttempted) getRouteEnrichmentTelemetry().recordPhase(
      "postgresCacheRequest", Date.now() - postgresRequestStarted, postgresTimedOut ? "timeout" : (queried ? "ok" : "error"),
    );
    const processingStarted = Date.now();
    const route = raw ? decodeCachedRoute(raw, key) : null;
    getRouteEnrichmentTelemetry().recordPhase("resultProcessing", Date.now() - processingStarted, "ok");
    if (queried) {
      if (route) { this.stats.hits++; getRouteEnrichmentTelemetry().record("dbHit"); }
      else { this.stats.misses++; getRouteEnrichmentTelemetry().record("dbMiss"); }
      this.refreshCount();
    }
    return route;
  }

  async put(key: string, route: FlightRoute, ttlMs: number): Promise<void> {
    if (!validPersistedRoute(route) || !routeMatchesCacheKey(key, route)
      || !Number.isFinite(ttlMs) || ttlMs <= 0) return;
    const routeJson = JSON.stringify(route);
    const source = route.source;
    if (!source || routeJson.length > MAX_JSON_LENGTH) return;
    const now = Date.now();
    const storedAt = BigInt(now);
    const expiresAt = BigInt(now + Math.floor(ttlMs));
    const requestStarted = Date.now();
    let attempted = false;
    let timedOut = false;
    const wrote = await this.run(false, async (db) => {
      attempted = true;
      await db.runtime().execute(db.raw.sql`
        INSERT INTO "public"."routeEnrichmentCache"
          ("cacheKey", "source", "routeJson", "storedAtMs", "expiresAtMs")
        VALUES (${key}, ${source}, ${routeJson}, ${storedAt}, ${expiresAt})
        ON CONFLICT ("cacheKey") DO UPDATE
        SET "source" = EXCLUDED."source", "routeJson" = EXCLUDED."routeJson",
            "storedAtMs" = EXCLUDED."storedAtMs", "expiresAtMs" = EXCLUDED."expiresAtMs"
      `.affectedCount().build());
      return true;
    }, "write", () => { timedOut = true; });
    // A circuit/concurrency bypass is not a failed SQL write: distinguish it
    // from a real attempted operation when interpreting soak telemetry.
    if (attempted) getRouteEnrichmentTelemetry().recordPhase(
      "cacheUpdate", Date.now() - requestStarted, timedOut ? "timeout" : (wrote ? "ok" : "error"),
    );
    if (!wrote) return;
    this.stats.writes++;
    getRouteEnrichmentTelemetry().record("dbWrite");
    this.refreshCount();
    if (now - this.lastCleanup >= 60 * 60_000) { this.lastCleanup = now; void this.prune(); }
  }

  /** Database count is sampled at most once per fifteen minutes, only when idle. */
  private refreshCount(): void {
    const now = Date.now();
    if (now - this.lastCountAttempt < 15 * 60_000 || this.retryAfter > 0) return;
    this.lastCountAttempt = now;
    void this.run<number | null>(null, async (db) => {
      const rows = await db.runtime().query(db.raw.sql`
        SELECT COUNT(*)::integer AS "entries"
        FROM "public"."routeEnrichmentCache"
        WHERE "expiresAtMs" > ${BigInt(Date.now())}
      `.returnsRow({ entries: "pg/int4@1" }).build());
      return rows[0]?.entries ?? null;
    }, "maintenance").then((count) => {
      if (count !== null) getRouteEnrichmentTelemetry().setValidEntries(count);
    });
  }

  private async prune(): Promise<void> {
    const cutoff = BigInt(Date.now());
    await this.run(false, async (db) => {
      await db.runtime().execute(db.raw.sql`
        DELETE FROM "public"."routeEnrichmentCache"
        WHERE "cacheKey" IN (
          SELECT "cacheKey" FROM "public"."routeEnrichmentCache"
          WHERE "expiresAtMs" <= ${cutoff}
          ORDER BY "expiresAtMs" ASC LIMIT 500
        )
      `.affectedCount().build());
      return true;
    }, "maintenance");
  }
}
