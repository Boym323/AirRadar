import type { FlightRoute } from "@/lib/aircraft/types";
import { getPrisma } from "@/lib/server/db";

/** Optional read-through PostgreSQL cache. Apply deploy/sql/route-enrichment-cache-v2.sql first. */
export interface RouteCacheStore {
  get(key: string): Promise<FlightRoute | null>;
  put(key: string, route: FlightRoute, ttlMs: number): Promise<void>;
}
const MAX_JSON_LENGTH = 8_192;
const TIMEOUT_MS = 750;
const FAILURE_BACKOFF_MS = 30_000;
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
async function bounded<T>(operation: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error("route_db_timeout")), TIMEOUT_MS);
      timeout.unref?.();
    })]);
  } finally { if (timeout) clearTimeout(timeout); }
}

/** Fail-soft raw SQL over the EXISTING Prisma database connection; no DDL at runtime. */
export class PostgresRouteCache implements RouteCacheStore {
  private retryAfter = 0;
  private active = 0;
  private lastCleanup = 0;
  private readonly stats = { hits: 0, misses: 0, writes: 0, failures: 0, bypassed: 0 };
  getDiagnostics() { return { ...this.stats, active: this.active, retryAfter: this.retryAfter }; }

  private async run<T>(
    fallback: T, query: (database: NonNullable<ReturnType<typeof getPrisma>>) => Promise<T>,
  ): Promise<T> {
    if (Date.now() < this.retryAfter || this.active >= 4) { this.stats.bypassed++; return fallback; }
    let db: ReturnType<typeof getPrisma>;
    try { db = getPrisma(); }
    catch { this.stats.failures++; this.retryAfter = Date.now() + FAILURE_BACKOFF_MS; return fallback; }
    if (!db) return fallback;
    this.active++;
    try { return await bounded(query(db)); }
    catch { this.stats.failures++; this.retryAfter = Date.now() + FAILURE_BACKOFF_MS; return fallback; }
    finally { this.active--; }
  }

  async get(key: string): Promise<FlightRoute | null> {
    if (!KEY.test(key)) return null;
    const raw = await this.run<string | null>(null, async (db) => {
      const rows = await db.runtime().query(db.raw.sql`
        SELECT "routeJson" FROM "public"."routeEnrichmentCache"
        WHERE "cacheKey" = ${key} AND "expiresAtMs" > ${BigInt(Date.now())}
        LIMIT 1
      `.returnsRow({ routeJson: "pg/text@1" }).build());
      return rows[0]?.routeJson ?? null;
    });
    const route = raw ? decodeCachedRoute(raw, key) : null;
    if (route) this.stats.hits++; else this.stats.misses++;
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
    const wrote = await this.run(false, async (db) => {
      await db.runtime().execute(db.raw.sql`
        INSERT INTO "public"."routeEnrichmentCache"
          ("cacheKey", "source", "routeJson", "storedAtMs", "expiresAtMs")
        VALUES (${key}, ${source}, ${routeJson}, ${storedAt}, ${expiresAt})
        ON CONFLICT ("cacheKey") DO UPDATE
        SET "source" = EXCLUDED."source", "routeJson" = EXCLUDED."routeJson",
            "storedAtMs" = EXCLUDED."storedAtMs", "expiresAtMs" = EXCLUDED."expiresAtMs"
      `.affectedCount().build());
      return true;
    });
    if (!wrote) return;
    this.stats.writes++;
    if (now - this.lastCleanup >= 60 * 60_000) { this.lastCleanup = now; void this.prune(); }
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
    });
  }
}
