import { createHash } from "node:crypto";
import type { RxwCommunication, RxwWaypoint, RxwWaypointPlan } from "@/lib/aircraft/rxw-communications";
import { getPrisma } from "@/lib/server/db";

export const RXW_HISTORY_QUEUE_LIMIT = 256;
export const RXW_HISTORY_BATCH_SIZE = 32;
export const RXW_HISTORY_RESULT_LIMIT = 30;
const MAX_WAYPOINT_BYTES = 8192;
const DAY_MS = 86_400_000;
const RETRY_MS = 60_000;

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

/** Only exact ICAO24 + explicit flight. UID is hashed, never retained verbatim. */
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
    id: createHash("sha256").update(message.stationId + "\0" + message.uid + "\0" + kind).digest("hex"),
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

/** Single-lane, bounded, optional DB writer. Never blocks RXW Socket.IO intake. */
export class RxwRouteHistoryWriter {
  private readonly queue: PersistedRow[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writing = false;
  private retryAfter = 0;
  private lastPrune = 0;
  private readonly counters = { accepted: 0, written: 0, dropped: 0, failures: 0 };
  diagnostics() { return { ...this.counters, pending: this.queue.length, writing: this.writing }; }

  enqueue(message: RxwCommunication, plan: RxwWaypointPlan | null): void {
    if (!isRxwRouteHistoryEnabled()) return;
    const row = buildRxwRouteSnapshot(message, plan);
    if (!row) return;
    if (this.queue.length >= RXW_HISTORY_QUEUE_LIMIT) { this.counters.dropped++; return; }
    this.queue.push(row);
    this.counters.accepted++;
    this.schedule();
  }

  private schedule(): void {
    if (this.timer || this.writing || !this.queue.length) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, Math.max(250, this.retryAfter - Date.now()));
    this.timer.unref?.();
  }

  async flush(): Promise<void> {
    if (this.writing || Date.now() < this.retryAfter) { this.schedule(); return; }
    if (!this.queue.length) return;
    this.writing = true;
    const rows = this.queue.splice(0, RXW_HISTORY_BATCH_SIZE);
    try {
      const db = getPrisma();
      if (!db) throw new Error("db_unavailable");
      // jsonb_to_recordset binds one bounded parameter; no dynamic SQL or raw text.
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
      this.counters.written += rows.length;
      const now = Date.now();
      if (now - this.lastPrune >= 6 * 60 * 60_000) {
        this.lastPrune = now;
        try {
          await db.runtime().execute(db.raw.sql`
            DELETE FROM "public"."RxwRouteSnapshot" WHERE "id" IN (
              SELECT "id" FROM "public"."RxwRouteSnapshot"
              WHERE "observedAtMs" < ${BigInt(now - rxwRouteRetentionDays() * DAY_MS)}
              ORDER BY "observedAtMs" LIMIT 2000
            )
          `.affectedCount().build());
        } catch { /* housekeeping must not affect writes or radar */ }
      }
    } catch {
      // No sensitive payload, query text, identifiers or raw upstream errors in logs.
      this.counters.failures++;
      this.counters.dropped += rows.length;
      this.retryAfter = Date.now() + RETRY_MS;
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
    const rows = await db.runtime().query(db.raw.sql`
      SELECT json_build_object(
        'id', "id", 'icaoHex', "icaoHex", 'flight', "flight",
        'kind', "kind", 'origin', "origin", 'destination', "destination",
        'etaUtc', "etaUtc", 'stationId', "stationId",
        'protocol', "protocol", 'observedAtMs', "observedAtMs"::text,
        'source', "source", 'waypointsJson', "waypointsJson",
        'positionedCount', "positionedCount"
      )::text AS "payload"
      FROM "public"."RxwRouteSnapshot"
      WHERE "icaoHex" = ${flight.icaoHex} AND "flight" = ${flight.callsign}
        AND "observedAtMs" >= ${from} AND "observedAtMs" <= ${to}
        AND "observedAtMs" >= ${cutoff}
      ORDER BY "observedAtMs" DESC LIMIT ${RXW_HISTORY_RESULT_LIMIT}
    `.returnsRow({ payload: "pg/text@1" }).build());
    return rows.flatMap(row => {
      try { const decoded = decodeRxwRouteSnapshot(JSON.parse(row.payload)); return decoded ? [decoded] : []; }
      catch { return []; }
    });
  } catch {
    // Missing migration / PostgreSQL outage is isolated from Flight Story.
    return [];
  }
}
