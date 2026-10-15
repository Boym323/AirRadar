import { createHash } from "node:crypto";
import type { RxwCommunication, RxwWaypoint, RxwWaypointPlan } from "@/lib/aircraft/rxw-communications";
import { getPrisma } from "@/lib/server/db";

export const RXW_HISTORY_QUEUE_LIMIT = 256;
export const RXW_HISTORY_BATCH_SIZE = 32;
export const RXW_HISTORY_RESULT_LIMIT = 30;
const MAX_WAYPOINT_BYTES = 8192;
const DAY_MS = 86_400_000;
const INITIAL_RETRY_MS = 5_000;
const MAX_RETRY_MS = 300_000;
const SEMANTIC_BUCKET_MS = 600_000;
const RECENT_ID_LIMIT = 4096;
const PRUNE_INTERVAL_MS = 6 * 60 * 60_000;

/** Parsed route evidence, NOT an observed ADS-B track or verified active flight plan. */
export interface RxwHistoricalRoute {
  id: string;
  icaoHex: string;
  flight: string;
  kind: "FPN" | "AIRPORT_PAIR";
  origin: string;
  destination: string;
  etaUtc: string | null;
  stationId: string;
  protocol: string;
  observedAt: string;
  source: "rxw-acarshub";
  waypoints: RxwWaypoint[];
  positionedCount: number;
}

interface PersistedRow extends Omit<RxwHistoricalRoute, "observedAt" | "waypoints"> {
  observedAtMs: string;
  waypointsJson: string;
}

export function isRxwRouteHistoryEnabled(): boolean {
  return process.env.RXW_HUB_ENABLED?.trim().toLowerCase() === "true"
    && process.env.RXW_ROUTE_HISTORY_ENABLED?.trim().toLowerCase() === "true";
}

export function rxwRouteRetentionDays(): number {
  const parsed = Number(process.env.RXW_ROUTE_HISTORY_RETENTION_DAYS ?? 30);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 90 ? parsed : 30;
}

function validWaypoint(value: unknown): value is RxwWaypoint {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const p = value as Partial<RxwWaypoint>;
  return typeof p.name === "string" && /^[A-Z0-9,]{2,24}$/.test(p.name)
    && (p.via === null || typeof p.via === "string" && /^[A-Z0-9]{1,10}$/.test(p.via))
    && typeof p.breakBefore === "boolean"
    && ((p.lat === null && p.lon === null)
      || (typeof p.lat === "number" && typeof p.lon === "number"
        && Number.isFinite(p.lat) && Number.isFinite(p.lon)
        && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180));
}

/** Deduplicate identical reports from one station in ten-minute UTC buckets.
 * A changed route/ETA/waypoint produces a new historical observation.
 * No raw upstream UID is included in the stored fingerprint. */
export function buildRxwRouteSnapshot(message: RxwCommunication, plan: RxwWaypointPlan | null): PersistedRow | null {
  const flight = plan?.flight ?? message.reportedRoute?.flight;
  const kind: RxwHistoricalRoute["kind"] = plan ? "FPN" : "AIRPORT_PAIR";
  const origin = plan?.origin ?? message.reportedRoute?.origin;
  const destination = plan?.destination ?? message.reportedRoute?.destination;
  const observedAtMs = Date.parse(message.timestamp);
  if (!flight || !origin || !destination || origin === destination
    || !/^[0-9A-F]{6}$/.test(message.icaoHex)
    || !/^[A-Z0-9]{2,10}$/.test(flight)
    || !/^[A-Z]{3,4}$/.test(origin) || !/^[A-Z]{3,4}$/.test(destination)
    || !Number.isFinite(observedAtMs) || observedAtMs <= 0
    || !message.uid || !message.stationId
    || !plan && !message.reportedRoute) return null;
  if (plan && (plan.icaoHex !== message.icaoHex || plan.status !== "planned"
    || plan.observedAt !== message.timestamp || !Array.isArray(plan.waypoints)
    || plan.waypoints.length < 2 || plan.waypoints.length > 80
    || !plan.waypoints.every(validWaypoint))) return null;
  const points = plan?.waypoints ?? [];
  const waypointsJson = JSON.stringify(points);
  if (waypointsJson.length > MAX_WAYPOINT_BYTES) return null;
  return {
    id: createHash("sha256").update(JSON.stringify([
      message.icaoHex, flight, kind, origin, destination,
      plan ? null : message.reportedRoute?.etaUtc ?? null,
      message.stationId, message.protocol, waypointsJson,
      Math.floor(observedAtMs / SEMANTIC_BUCKET_MS),
    ])).digest("hex"),
    icaoHex: message.icaoHex, flight, kind, origin, destination,
    etaUtc: plan ? null : message.reportedRoute?.etaUtc ?? null,
    stationId: message.stationId, protocol: message.protocol,
    observedAtMs: String(observedAtMs), source: "rxw-acarshub",
    positionedCount: points.filter(p => p.lat !== null && p.lon !== null).length,
    waypointsJson,
  };
}

/** Fail closed for malformed DB rows, including legacy/raw injected JSON. */
export function decodeRxwRouteSnapshot(value: unknown): RxwHistoricalRoute | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const r = value as Partial<PersistedRow>;
  if (typeof r.id !== "string" || !/^[0-9a-f]{64}$/.test(r.id)
    || typeof r.icaoHex !== "string" || !/^[0-9A-F]{6}$/.test(r.icaoHex)
    || typeof r.flight !== "string" || !/^[A-Z0-9]{2,10}$/.test(r.flight)
    || (r.kind !== "FPN" && r.kind !== "AIRPORT_PAIR")
    || typeof r.origin !== "string" || !/^[A-Z]{3,4}$/.test(r.origin)
    || typeof r.destination !== "string" || !/^[A-Z]{3,4}$/.test(r.destination)
    || r.origin === r.destination || r.source !== "rxw-acarshub"
    || typeof r.stationId !== "string" || r.stationId.length > 64
    || typeof r.protocol !== "string" || r.protocol.length > 24
    || typeof r.waypointsJson !== "string" || r.waypointsJson.length > MAX_WAYPOINT_BYTES
    || typeof r.observedAtMs !== "string" || !/^\d{12,13}$/.test(r.observedAtMs)
    || typeof r.positionedCount !== "number" || !Number.isInteger(r.positionedCount)
    || (r.etaUtc !== null && (typeof r.etaUtc !== "string" || !/^([01]\d|2[0-3]):[0-5]\dZ$/.test(r.etaUtc)))) return null;
  let waypoints: unknown;
  try { waypoints = JSON.parse(r.waypointsJson); } catch { return null; }
  if (!Array.isArray(waypoints) || waypoints.length > 80 || !waypoints.every(validWaypoint)) return null;
  const points = waypoints as RxwWaypoint[];
  if (r.kind === "FPN" && points.length < 2 || r.kind === "AIRPORT_PAIR" && points.length !== 0
    || points.filter(p => p.lat !== null && p.lon !== null).length !== r.positionedCount) return null;
  const ms = Number(r.observedAtMs);
  if (!Number.isSafeInteger(ms) || ms <= 0) return null;
  return {
    id: r.id, icaoHex: r.icaoHex, flight: r.flight,
    kind: r.kind, origin: r.origin, destination: r.destination,
    etaUtc: r.etaUtc, stationId: r.stationId,
    protocol: r.protocol, observedAt: new Date(ms).toISOString(),
    source: "rxw-acarshub", waypoints: points, positionedCount: r.positionedCount,
  };
}

/** Optional single-lane writer: O(1) dedup, bounded retry, no ingest awaits. */
export class RxwRouteHistoryWriter {
  private readonly queue = new Map<string, PersistedRow>();
  private readonly inFlight = new Set<string>();
  private readonly recent = new Map<string, true>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pruneTimer: ReturnType<typeof setTimeout> | null = null;
  private writing = false;
  private retryAfter = 0;
  private failuresInRow = 0;
  private lastPrune = 0;
  private readonly counters = {
    accepted: 0, written: 0, deduplicated: 0, dropped: 0,
    failures: 0, pruneRuns: 0, pruneFailures: 0,
  };

  diagnostics() {
    return { ...this.counters, pending: this.queue.size, inFlight: this.inFlight.size,
      writing: this.writing, retryAfterAt: this.retryAfter > Date.now()
        ? new Date(this.retryAfter).toISOString() : null };
  }

  enqueue(message: RxwCommunication, plan: RxwWaypointPlan | null): void {
    if (!isRxwRouteHistoryEnabled()) return;
    const row = buildRxwRouteSnapshot(message, plan);
    if (!row) return;
    if (this.recent.has(row.id) || this.queue.has(row.id) || this.inFlight.has(row.id)) {
      this.counters.deduplicated++;
      return;
    }
    // Includes in-flight rows: memory remains bounded during a stalled DB call.
    if (this.queue.size + this.inFlight.size >= RXW_HISTORY_QUEUE_LIMIT) {
      this.counters.dropped++;
      return;
    }
    this.queue.set(row.id, row);
    this.counters.accepted++;
    this.schedule();
  }

  private rememberCommitted(rows: readonly PersistedRow[]): void {
    for (const row of rows) {
      this.recent.delete(row.id);
      this.recent.set(row.id, true);
    }
    while (this.recent.size > RECENT_ID_LIMIT) {
      const oldest = this.recent.keys().next().value;
      if (oldest === undefined) break;
      this.recent.delete(oldest);
    }
  }

  private schedule(): void {
    if (this.timer || this.writing || !this.queue.size) return;
    const delay = Math.max(this.queue.size >= RXW_HISTORY_BATCH_SIZE ? 10 : 250, this.retryAfter - Date.now());
    this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, delay);
    this.timer.unref?.();
  }

  async flush(): Promise<void> {
    if (this.writing) return;
    if (!isRxwRouteHistoryEnabled()) {
      this.counters.dropped += this.queue.size;
      this.queue.clear();
      return;
    }
    if (Date.now() < this.retryAfter) { this.schedule(); return; }
    if (!this.queue.size) return;

    this.writing = true;
    const rows: PersistedRow[] = [];
    for (const [id, row] of this.queue) {
      this.queue.delete(id);
      this.inFlight.add(id);
      rows.push(row);
      if (rows.length >= RXW_HISTORY_BATCH_SIZE) break;
    }
    try {
      const db = getPrisma();
      if (!db) throw new Error("db_unavailable");
      // One bounded parameter and statement for the entire batch.
      const payload = JSON.stringify(rows);
      await db.runtime().execute(db.raw.sql`
        INSERT INTO "public"."RxwRouteSnapshot"
          ("id","icaoHex","flight","kind","origin","destination","etaUtc",
           "waypointsJson","positionedCount","stationId","protocol","observedAtMs","source")
        SELECT x."id",x."icaoHex",x."flight",x."kind",x."origin",x."destination",
          x."etaUtc",x."waypointsJson",x."positionedCount",x."stationId",
          x."protocol",x."observedAtMs",x."source"
        FROM jsonb_to_recordset(${payload}::jsonb) AS x(
          "id" text, "icaoHex" text, "flight" text, "kind" text,
          "origin" text, "destination" text, "etaUtc" text,
          "waypointsJson" text, "positionedCount" integer, "stationId" text,
          "protocol" text, "observedAtMs" bigint, "source" text
        )
        ON CONFLICT ("id") DO NOTHING
      `.affectedCount().build());
      // Acknowledged records; a cross-restart conflict may be a DB no-op.
      this.counters.written += rows.length;
      this.rememberCommitted(rows);
      this.failuresInRow = 0;
      this.retryAfter = 0;
    } catch {
      // Preserve failed rows first, then newer entries; never log sensitive data.
      this.counters.failures++;
      this.failuresInRow = Math.min(8, this.failuresInRow + 1);
      this.retryAfter = Date.now() + Math.min(MAX_RETRY_MS, INITIAL_RETRY_MS * 2 ** (this.failuresInRow - 1));
      const merged = new Map<string, PersistedRow>();
      for (const row of rows) merged.set(row.id, row);
      for (const [id, row] of this.queue) merged.set(id, row);
      this.queue.clear();
      for (const [id, row] of merged) this.queue.set(id, row);
    } finally {
      for (const row of rows) this.inFlight.delete(row.id);
      this.writing = false;
      this.schedule();
      if (!this.failuresInRow && !this.queue.size) this.schedulePrune();
    }
  }

  /**
   * Best effort during SIGTERM, after RXW stops receiving, before closing DB.
   * No new timers are allowed to cause a second concurrent flush.
   */
  async drainForShutdown(): Promise<void> {
    for (let batch = 0; batch < Math.ceil(RXW_HISTORY_QUEUE_LIMIT / RXW_HISTORY_BATCH_SIZE); batch++) {
      if (this.timer) { clearTimeout(this.timer); this.timer = null; }
      if (this.writing || !this.queue.size || Date.now() < this.retryAfter) break;
      await this.flush();
    }
  }

  /** Retention maintenance is deferred until the ingestion write lane is idle. */
  private schedulePrune(): void {
    if (this.pruneTimer || this.writing || this.queue.size
      || Date.now() - this.lastPrune < PRUNE_INTERVAL_MS) return;
    this.pruneTimer = setTimeout(() => { this.pruneTimer = null; void this.pruneIdle(); }, 2000);
    this.pruneTimer.unref?.();
  }

  private async pruneIdle(): Promise<void> {
    if (this.writing || this.queue.size || !isRxwRouteHistoryEnabled()
      || Date.now() - this.lastPrune < PRUNE_INTERVAL_MS) return;
    this.writing = true;
    this.lastPrune = Date.now();
    try {
      const db = getPrisma();
      if (!db) return;
      await db.runtime().execute(db.raw.sql`
        DELETE FROM "public"."RxwRouteSnapshot" WHERE "id" IN (
          SELECT "id" FROM "public"."RxwRouteSnapshot"
          WHERE "observedAtMs" < ${BigInt(Date.now() - rxwRouteRetentionDays() * DAY_MS)}
          ORDER BY "observedAtMs" LIMIT 2000
        )
      `.affectedCount().build());
      this.counters.pruneRuns++;
    } catch {
      this.counters.pruneFailures++;
    } finally {
      this.writing = false;
      this.schedule();
    }
  }
}
const shared = globalThis as typeof globalThis & { airradarRxwRouteWriter?: RxwRouteHistoryWriter };
export function getRxwRouteHistoryWriter(): RxwRouteHistoryWriter {
  shared.airradarRxwRouteWriter ??= new RxwRouteHistoryWriter();
  return shared.airradarRxwRouteWriter;
}

type FlightWindow = {
  icaoHex: string; callsign: string | null; startTime: string;
  endTime: string | null; lastSeenAt: string;
};

/** Reads only one exact airframe+flight and a bounded UTC instance window. */
export async function listHistoricalRxwRoutes(flight: FlightWindow): Promise<RxwHistoricalRoute[]> {
  if (!isRxwRouteHistoryEnabled() || !/^[0-9A-F]{6}$/.test(flight.icaoHex)
    || !flight.callsign || !/^[A-Z0-9]{2,10}$/.test(flight.callsign)) return [];
  const start = Date.parse(flight.startTime);
  const last = Date.parse(flight.endTime ?? flight.lastSeenAt);
  if (!Number.isFinite(start) || !Number.isFinite(last) || last < start) return [];
  const from = BigInt(Math.max(0, start - 60 * 60_000));
  const to = BigInt(Math.min(last + 10 * 60_000, start + 72 * 60 * 60_000));
  const cutoff = BigInt(Date.now() - rxwRouteRetentionDays() * DAY_MS);
  try {
    const db = getPrisma();
    if (!db) return [];
    // Typed indexed columns avoid a JSON builder on PostgreSQL and JSON.parse in Node.
    const rows = await db.runtime().query(db.raw.sql`
      SELECT "id", "icaoHex", "flight", "kind", "origin", "destination",
        "etaUtc", "stationId", "protocol", "observedAtMs"::text AS "observedAtMs",
        "source", "waypointsJson", "positionedCount"
      FROM "public"."RxwRouteSnapshot"
      WHERE "icaoHex" = ${flight.icaoHex} AND "flight" = ${flight.callsign}
        AND "observedAtMs" >= ${from} AND "observedAtMs" <= ${to}
        AND "observedAtMs" >= ${cutoff}
      ORDER BY "observedAtMs" DESC LIMIT ${RXW_HISTORY_RESULT_LIMIT}
    `.returnsRow({
      id: "pg/text@1", icaoHex: "pg/text@1", flight: "pg/text@1",
      kind: "pg/text@1", origin: "pg/text@1", destination: "pg/text@1",
      etaUtc: "pg/text@1", stationId: "pg/text@1", protocol: "pg/text@1",
      observedAtMs: "pg/text@1", source: "pg/text@1",
      waypointsJson: "pg/text@1", positionedCount: "pg/int4@1",
    }).build());
    const decoded: RxwHistoricalRoute[] = [];
    for (const row of rows) {
      const route = decodeRxwRouteSnapshot(row);
      if (route) decoded.push(route);
    }
    return decoded;
  } catch {
    // Missing migration / PostgreSQL outage is isolated from Flight Story.
    return [];
  }
}
