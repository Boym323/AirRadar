import { getPrisma } from "@/lib/server/db";

type Row = Record<string, unknown>;
type Table = {
  where: (filter: Record<string, unknown>) => Table;
  orderBy: (value: unknown) => Table;
  limit: (value: number) => Table;
  all: () => Promise<Row[]>;
  first: () => Promise<Row | undefined>;
  update: (value: Row) => Promise<Row>;
};

type AggregateBuilder = {
  count: () => unknown;
  sum: (field: string) => unknown;
  max: (field: string) => unknown;
};
type AggregateTable = Table & {
  aggregate: (select: (aggregate: AggregateBuilder) => Record<string, unknown>) => Promise<Row>;
  groupBy: (...fields: string[]) => {
    aggregate: (select: (aggregate: AggregateBuilder) => Record<string, unknown>) => Promise<Row[]>;
  };
};
type RetriedPendingTable = AggregateTable & {
  where: (predicate: (row: { attemptCount: { gt(value: number): unknown } }) => unknown) => RetriedPendingTable;
};

function table(name: string): Table | null {
  const database = getPrisma();
  return database ? (database.orm.public as unknown as Record<string, Table>)[name] ?? null : null;
}

function tableFromTransaction(transaction: unknown, name: string): Table {
  return (transaction as { orm: { public: Record<string, Table> } }).orm.public[name]!;
}

function now(): Temporal.Instant { return Temporal.Now.instant(); }
function iso(value: unknown): string { return value instanceof Temporal.Instant ? value.toString() : new Date(String(value)).toISOString(); }
function parseJson<T>(value: unknown, fallback: T): T { try { return typeof value === "string" ? JSON.parse(value) as T : fallback; } catch { return fallback; } }

export interface AlertV1Delivery { id: string; occurrenceId: string; channel: string; status: string; attemptCount: number; nextAttemptAt: string; claimedAt: string | null; sentAt: string | null; lastError: string | null; }
export interface AlertV1DeliveryOccurrence {
  id: string;
  trigger: string;
  aircraftIcao: string;
  registration: string | null;
  callsign: string | null;
  occurredAt: string;
  payload: Record<string, unknown>;
}

export interface AlertV1HistoryRow {
  occurrence: Row;
  ruleName: string | null;
  deliveries: AlertV1Delivery[];
  flightEvent: Row | null;
}

/** Historical occurrence reader and durable delivery queue; no rule mutation surface. */
export class AlertsFleetsRepository {
  async listOccurrences(limit = 50): Promise<Row[]> { const t = table("AlertOccurrence"); return t ? t.orderBy((row: { occurredAt: { desc(): unknown } }) => row.occurredAt.desc()).limit(Math.min(200, Math.max(1, limit))).all() : []; }
  async listOccurrenceHistory(limit = 200): Promise<AlertV1HistoryRow[]> {
    const occurrences = await this.listOccurrences(limit);
    if (!occurrences.length) return [];
    const rules = table("AlertRule") ? await table("AlertRule")!.where({}).all() : [];
    const deliveryTable = table("AlertDelivery");
    const flightEventTable = table("FlightEvent");
    const ruleNames = new Map(rules.map((row) => [String(row.id), typeof row.name === "string" ? row.name : null]));
    return Promise.all(occurrences.map(async (occurrence) => {
      const [deliveryRows, flightEvent] = await Promise.all([
        deliveryTable ? deliveryTable.where({ occurrenceId: String(occurrence.id) }).all() : Promise.resolve([]),
        flightEventTable && occurrence.flightEventId ? flightEventTable.where({ id: occurrence.flightEventId }).first() : Promise.resolve(undefined),
      ]);
      const deliveries = deliveryRows.map((row) => ({ id: String(row.id), occurrenceId: String(row.occurrenceId), channel: String(row.channel), status: String(row.status), attemptCount: Number(row.attemptCount ?? 0), nextAttemptAt: iso(row.nextAttemptAt), claimedAt: row.claimedAt ? iso(row.claimedAt) : null, sentAt: row.sentAt ? iso(row.sentAt) : null, lastError: typeof row.lastError === "string" ? row.lastError.slice(0, 300) : null }));
      return { occurrence, ruleName: ruleNames.get(String(occurrence.ruleId)) ?? null, deliveries, flightEvent: flightEvent ?? null };
    }));
  }
  async listDeliveries(limit = 100): Promise<AlertV1Delivery[]> { const t = table("AlertDelivery"); if (!t) return []; return (await t.orderBy((row: { createdAt: { desc(): unknown } }) => row.createdAt.desc()).limit(Math.min(200, Math.max(1, limit))).all()).map((row) => ({ id: String(row.id), occurrenceId: String(row.occurrenceId), channel: String(row.channel), status: String(row.status), attemptCount: Number(row.attemptCount ?? 0), nextAttemptAt: iso(row.nextAttemptAt), claimedAt: row.claimedAt ? iso(row.claimedAt) : null, sentAt: row.sentAt ? iso(row.sentAt) : null, lastError: typeof row.lastError === "string" ? row.lastError.slice(0, 300) : null })); }

  async deliveryHealthSnapshot(): Promise<{
    queueDepth: number;
    processing: number;
    sent: number;
    failed: number;
    retryPending: number;
    totalAttempts: number;
    terminalFailures: number;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    lastError: string | null;
  }> {
    const t = table("AlertDelivery");
    if (!t) return { queueDepth: 0, processing: 0, sent: 0, failed: 0, retryPending: 0, totalAttempts: 0, terminalFailures: 0, lastSuccessAt: null, lastFailureAt: null, lastError: null };
    const aggregateTable = t as AggregateTable;
    const retriedPendingTable = aggregateTable.where({ status: "PENDING" }) as RetriedPendingTable;
    const sentTable = aggregateTable.where({ status: "SENT" }) as AggregateTable;
    const failedTable = aggregateTable.where({ status: "FAILED" }) as AggregateTable;
    const [statusRows, attemptsRow, retriedPendingRow, successRow, failureRow, latestFailure] = await Promise.all([
      aggregateTable.groupBy("status").aggregate((aggregate) => ({ count: aggregate.count() })),
      aggregateTable.aggregate((aggregate) => ({ totalAttempts: aggregate.sum("attemptCount") })),
      retriedPendingTable.where((row: { attemptCount: { gt(value: number): unknown } }) => row.attemptCount.gt(0)).aggregate((aggregate) => ({ retryPending: aggregate.count() })),
      sentTable.aggregate((aggregate) => ({ lastSuccessAt: aggregate.max("sentAt") })),
      failedTable.aggregate((aggregate) => ({ lastFailureAt: aggregate.max("updatedAt") })),
      failedTable
        .orderBy((row: { updatedAt: { desc(): unknown } }) => row.updatedAt.desc())
        .limit(1)
        .first(),
    ] as const);
    const counts = new Map<string, number>(statusRows.map((row) => [String(row.status), Number(row.count ?? 0)]));
    const failed = counts.get("FAILED") ?? 0;
    const lastFailureAtValue = failureRow.lastFailureAt;
    return {
      queueDepth: counts.get("PENDING") ?? 0,
      processing: counts.get("PROCESSING") ?? 0,
      sent: counts.get("SENT") ?? 0,
      failed,
      retryPending: Number(retriedPendingRow.retryPending ?? 0),
      totalAttempts: Number(attemptsRow.totalAttempts ?? 0),
      terminalFailures: failed,
      lastSuccessAt: successRow.lastSuccessAt ? iso(successRow.lastSuccessAt) : null,
      lastFailureAt: lastFailureAtValue ? iso(lastFailureAtValue) : null,
      lastError: typeof latestFailure?.lastError === "string" ? latestFailure.lastError.slice(0, 300) : null,
    };
  }

  async getOccurrenceForDelivery(id: string): Promise<AlertV1DeliveryOccurrence | null> {
    const t = table("AlertOccurrence");
    if (!t) return null;
    const row = await t.where({ id }).first();
    if (!row) return null;
    return {
      id: String(row.id),
      trigger: String(row.trigger),
      aircraftIcao: String(row.aircraftIcao),
      registration: typeof row.registration === "string" ? row.registration : null,
      callsign: typeof row.callsign === "string" ? row.callsign : null,
      occurredAt: iso(row.occurredAt),
      payload: parseJson<Record<string, unknown>>(row.payloadJson, {}),
    };
  }

  async claimDelivery(nowMs = Date.now()): Promise<AlertV1Delivery | null> {
    const database = getPrisma(); if (!database) return null;
    try {
      return await database.transaction(async (transaction) => {
        // This runtime's ORM update returns the row even when its predicate
        // matched zero rows. A transaction-scoped PostgreSQL advisory lock
        // therefore serializes the candidate read + conditional update across
        // all worker instances, while the transaction still owns the claim.
        const sql = database as unknown as { raw: { sql: (strings: TemplateStringsArray, ...values: unknown[]) => { affectedCount: () => { build: () => unknown } } } };
        const lockPlan = sql.raw.sql`SELECT pg_advisory_xact_lock(784231947)`.affectedCount().build();
        await (transaction as unknown as { execute: (query: unknown) => Promise<unknown> }).execute(lockPlan);
        const locked = tableFromTransaction(transaction, "AlertDelivery");
        const candidates = await locked.where({ status: "PENDING" }).orderBy((row: { nextAttemptAt: { asc(): unknown } }) => row.nextAttemptAt.asc()).limit(20).all();
        const candidate = candidates.find((row) => Date.parse(String(row.nextAttemptAt)) <= nowMs); if (!candidate) return null;
        const claimedAt = Temporal.Instant.fromEpochMilliseconds(nowMs);
        const row = await locked.where({ id: String(candidate.id) }).update({ status: "PROCESSING", claimedAt, attemptCount: Number(candidate.attemptCount ?? 0) + 1, updatedAt: claimedAt });
        return { id: String(row.id), occurrenceId: String(row.occurrenceId), channel: String(row.channel), status: "PROCESSING", attemptCount: Number(row.attemptCount), nextAttemptAt: iso(row.nextAttemptAt), claimedAt: iso(row.claimedAt), sentAt: row.sentAt ? iso(row.sentAt) : null, lastError: null };
      });
    } catch { return null; }
  }
  async markDeliverySent(id: string): Promise<void> { const t = table("AlertDelivery"); if (!t) return; const at = now(); await t.where({ id }).update({ status: "SENT", sentAt: at, claimedAt: null, updatedAt: at, lastError: null }); }
  async markDeliveryFailure(id: string, error: string, retryAt: number | null): Promise<void> { const t = table("AlertDelivery"); if (!t) return; const at = now(); await t.where({ id }).update({ status: retryAt === null ? "FAILED" : "PENDING", nextAttemptAt: Temporal.Instant.fromEpochMilliseconds(retryAt ?? Date.now()), claimedAt: null, updatedAt: at, lastError: error.slice(0, 300) }); }
  async recoverStaleDeliveries(timeoutMs: number): Promise<number> { const t = table("AlertDelivery"); if (!t) return 0; const rows = await t.where({ status: "PROCESSING" }).all(); let recovered = 0; const cutoff = Date.now() - timeoutMs; for (const row of rows) if (row.claimedAt && Date.parse(String(row.claimedAt)) < cutoff) { await t.where({ id: String(row.id), status: "PROCESSING" }).update({ status: "PENDING", claimedAt: null, nextAttemptAt: now(), updatedAt: now(), lastError: "stale claim recovered" }); recovered += 1; } return recovered; }
}

const globalForAlerts = globalThis as unknown as { alertsFleetsRepository?: AlertsFleetsRepository };
export function getAlertsFleetsRepository(): AlertsFleetsRepository { return globalForAlerts.alertsFleetsRepository ??= new AlertsFleetsRepository(); }
