import { randomUUID } from "node:crypto";
import { getPrisma } from "@/lib/server/db";
import {
  normalizeAlertV1Matcher,
  validateAlertV1Geofence,
  type AlertV1Config,
  type AlertV1Fleet,
  type AlertV1FleetMatcher,
  type AlertV1Geofence,
  type AlertV1Rule,
} from "@/lib/server/alerts-fleets-v1";

type Row = Record<string, unknown>;
type Table = {
  where: (filter: Record<string, unknown>) => Table;
  orderBy: (value: unknown) => Table;
  limit: (value: number) => Table;
  all: () => Promise<Row[]>;
  first: () => Promise<Row | undefined>;
  create: (value: Row) => Promise<Row>;
  update: (value: Row) => Promise<Row>;
  delete: () => Promise<unknown>;
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
function json(value: unknown): string { return JSON.stringify(value); }
function parseJson<T>(value: unknown, fallback: T): T { try { return typeof value === "string" ? JSON.parse(value) as T : fallback; } catch { return fallback; } }

export interface AlertV1OccurrenceInput {
  id: string; ruleId: string; sourceType: string; sourceKey: string; trigger: string;
  aircraftIcao: string; registration?: string | null; callsign?: string | null;
  flightId?: number | null; flightEventId?: number | null; geofenceId?: string | null;
  occurredAt: string; payload: Record<string, unknown>; channels: string[];
}

export class AlertV1OccurrenceInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AlertV1OccurrenceInvariantError";
  }
}

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

export function validateAlertV1OccurrenceInput(input: Pick<AlertV1OccurrenceInput, "sourceType" | "flightEventId">): void {
  if (input.sourceType === "FLIGHT_EVENT" && (input.flightEventId === null || input.flightEventId === undefined || !Number.isInteger(input.flightEventId) || input.flightEventId <= 0)) {
    throw new AlertV1OccurrenceInvariantError("FLIGHT_EVENT occurrence requires canonical flightEventId");
  }
}

function fleetFromRow(row: Row, matchers: AlertV1FleetMatcher[]): AlertV1Fleet {
  return { id: String(row.id), name: String(row.name), description: typeof row.description === "string" ? row.description : undefined, enabled: row.enabled !== false, matchers };
}

export class AlertsFleetsRepository {
  private cache: AlertV1Config | null = null;

  invalidate(): void { this.cache = null; }

  async loadConfig(force = false): Promise<AlertV1Config> {
    if (!force && this.cache) return this.cache;
    const fleetTable = table("AlertFleet");
    const geoTable = table("AlertGeofence");
    const ruleTable = table("AlertRule");
    if (!fleetTable || !geoTable || !ruleTable) return { fleets: [], geofences: [], rules: [] };
    const [fleetRows, geoRows, ruleRows] = await Promise.all([
      fleetTable.where({ enabled: true }).all(), geoTable.where({ enabled: true }).all(), ruleTable.where({ enabled: true }).all(),
    ]);
    const matcherTable = table("AlertFleetMatcher");
    const matchers = matcherTable ? await matcherTable.where({ enabled: true }).all() : [];
    const byFleet = new Map<string, AlertV1FleetMatcher[]>();
    for (const row of matchers) {
      const item: AlertV1FleetMatcher = { id: String(row.id), enabled: row.enabled !== false, type: String(row.type) as AlertV1FleetMatcher["type"], value: String(row.value) };
      const list = byFleet.get(String(row.fleetId)) ?? []; list.push(item); byFleet.set(String(row.fleetId), list);
    }
    const nextConfig: AlertV1Config = {
      fleets: fleetRows.map((row) => fleetFromRow(row, byFleet.get(String(row.id)) ?? [])),
      geofences: geoRows.map((row) => ({ id: String(row.id), name: String(row.name), centerLat: Number(row.centerLat), centerLon: Number(row.centerLon), radiusMeters: Number(row.radiusMeters), enabled: row.enabled !== false })),
      rules: ruleRows.map((row) => ({
        id: String(row.id), name: String(row.name), enabled: row.enabled !== false,
        target: row.targetKind === "FLEET" && row.fleetId ? { kind: "FLEET", fleetId: String(row.fleetId) } : { kind: "ALL_AIRCRAFT" },
        trigger: String(row.trigger) as AlertV1Rule["trigger"], ...parseJson<Record<string, unknown>>(row.triggerConfig, {}),
        channels: parseJson<string[]>(row.channelsJson, []).filter((channel): channel is "IN_APP" | "PUSHOVER" => channel === "IN_APP" || channel === "PUSHOVER"), cooldownMs: typeof row.cooldownMs === "number" ? row.cooldownMs : undefined,
        ...(row.geofenceId ? { geofenceId: String(row.geofenceId) } : {}),
      })),
    };
    this.cache = nextConfig;
    return nextConfig;
  }

  async listFleets(): Promise<AlertV1Fleet[]> {
    const config = await this.loadConfig(true); return config.fleets;
  }

  async saveFleet(input: { id?: string; name: string; description?: string | null; enabled?: boolean }): Promise<AlertV1Fleet> {
    const fleets = table("AlertFleet"); if (!fleets) throw new Error("database not configured");
    const id = input.id ?? randomUUID(); const at = now();
    const existing = input.id ? await fleets.where({ id }).first() : undefined;
    const values = { id, name: input.name.trim(), description: input.description?.trim() || null, enabled: input.enabled !== false, updatedAt: at, ...(existing ? {} : { createdAt: at }) };
    const row = existing ? await fleets.where({ id }).update(values) : await fleets.create(values);
    this.invalidate(); return fleetFromRow(row, []);
  }

  async setFleetEnabled(id: string, enabled: boolean): Promise<void> { const t = table("AlertFleet"); if (!t) throw new Error("database not configured"); await t.where({ id }).update({ enabled, updatedAt: now() }); this.invalidate(); }
  async deleteFleet(id: string): Promise<void> { const t = table("AlertFleet"); if (!t) throw new Error("database not configured"); await t.where({ id }).delete(); this.invalidate(); }

  async saveMatcher(input: { id?: string; fleetId: string; type: AlertV1FleetMatcher["type"]; value: string; enabled?: boolean }): Promise<AlertV1FleetMatcher> {
    const t = table("AlertFleetMatcher"); if (!t) throw new Error("database not configured");
    const id = input.id ?? randomUUID(); const value = normalizeAlertV1Matcher(input.type, input.value); const existing = input.id ? await t.where({ id: input.id }).first() : undefined;
    const row = existing ? await t.where({ id: input.id! }).update({ type: input.type, value, enabled: input.enabled !== false }) : await t.create({ id, fleetId: input.fleetId, type: input.type, value, enabled: input.enabled !== false, createdAt: now() });
    this.invalidate(); return { id: String(row.id), enabled: row.enabled !== false, type: String(row.type) as AlertV1FleetMatcher["type"], value: String(row.value) };
  }
  async deleteMatcher(id: string): Promise<void> { const t = table("AlertFleetMatcher"); if (!t) throw new Error("database not configured"); await t.where({ id }).delete(); this.invalidate(); }

  async listGeofences(): Promise<AlertV1Geofence[]> { const t = table("AlertGeofence"); if (!t) return []; return (await t.where({}).all()).map((row) => ({ id: String(row.id), name: String(row.name), centerLat: Number(row.centerLat), centerLon: Number(row.centerLon), radiusMeters: Number(row.radiusMeters), enabled: row.enabled !== false })); }
  async saveGeofence(input: Omit<AlertV1Geofence, "id"> & { id?: string }): Promise<AlertV1Geofence> {
    validateAlertV1Geofence(input); const t = table("AlertGeofence"); if (!t) throw new Error("database not configured"); const id = input.id ?? randomUUID(); const existing = input.id ? await t.where({ id }).first() : undefined; const values = { id, name: input.name.trim(), centerLat: input.centerLat, centerLon: input.centerLon, radiusMeters: input.radiusMeters, enabled: input.enabled !== false, updatedAt: now(), ...(existing ? {} : { createdAt: now() }) }; const row = existing ? await t.where({ id }).update(values) : await t.create(values); this.invalidate(); return { id: String(row.id), name: String(row.name), centerLat: Number(row.centerLat), centerLon: Number(row.centerLon), radiusMeters: Number(row.radiusMeters), enabled: row.enabled !== false };
  }
  async deleteGeofence(id: string): Promise<void> { const t = table("AlertGeofence"); if (!t) throw new Error("database not configured"); await t.where({ id }).delete(); this.invalidate(); }

  async listRules(): Promise<AlertV1Rule[]> { const config = await this.loadConfig(true); return config.rules; }
  async saveRule(input: { id?: string; name: string; enabled?: boolean; target: AlertV1Rule["target"]; trigger: AlertV1Rule["trigger"]; triggerConfig?: Record<string, unknown>; channels: string[]; geofenceId?: string | null; cooldownMs?: number | null }): Promise<AlertV1Rule> {
    const t = table("AlertRule"); if (!t) throw new Error("database not configured");
    if (input.target.kind !== "ALL_AIRCRAFT" && input.target.kind !== "FLEET") throw new Error("invalid target");
    if (!["FLIGHT_EVENT", "SQUAWK", "GEOFENCE_ENTER", "GEOFENCE_EXIT"].includes(input.trigger)) throw new Error("invalid trigger");
    const config = await this.loadConfig(true); const fleetId = input.target.kind === "FLEET" ? input.target.fleetId : null; if (fleetId && !config.fleets.some((fleet) => fleet.id === fleetId)) throw new Error("fleet not found"); if (input.geofenceId && !config.geofences.some((geo) => geo.id === input.geofenceId)) throw new Error("geofence not found");
    if (input.trigger === "FLIGHT_EVENT" && !Array.isArray(input.triggerConfig?.flightEventTypes)) throw new Error("flight event types are required");
    if (input.trigger === "SQUAWK" && (!Array.isArray(input.triggerConfig?.squawks) || input.triggerConfig.squawks.some((code) => typeof code !== "string" || !/^(7500|7600|7700)$/.test(code)))) throw new Error("squawks must be 7500, 7600, or 7700");
    if ((input.trigger === "GEOFENCE_ENTER" || input.trigger === "GEOFENCE_EXIT") && !input.geofenceId) throw new Error("geofence is required");
    if (!input.channels.every((channel) => channel === "IN_APP" || channel === "PUSHOVER")) throw new Error("invalid channel");
    const id = input.id ?? randomUUID(); const existing = input.id ? await t.where({ id }).first() : undefined; const at = now(); const row = existing ? await t.where({ id }).update({ name: input.name.trim(), enabled: input.enabled !== false, targetKind: input.target.kind, fleetId: input.target.kind === "FLEET" ? input.target.fleetId : null, trigger: input.trigger, triggerConfig: json(input.triggerConfig ?? {}), channelsJson: json(input.channels), geofenceId: input.geofenceId ?? null, cooldownMs: input.cooldownMs ?? null, updatedAt: at }) : await t.create({ id, name: input.name.trim(), enabled: input.enabled !== false, targetKind: input.target.kind, fleetId: input.target.kind === "FLEET" ? input.target.fleetId : null, trigger: input.trigger, triggerConfig: json(input.triggerConfig ?? {}), channelsJson: json(input.channels), geofenceId: input.geofenceId ?? null, cooldownMs: input.cooldownMs ?? null, activatedAt: at, createdAt: at, updatedAt: at }); this.invalidate(); const fresh = await this.loadConfig(true); return fresh.rules.find((rule) => rule.id === String(row.id))!;
  }
  async deleteRule(id: string): Promise<void> { const t = table("AlertRule"); if (!t) throw new Error("database not configured"); await t.where({ id }).delete(); this.invalidate(); }
  async setRuleEnabled(id: string, enabled: boolean): Promise<void> { const t = table("AlertRule"); if (!t) throw new Error("database not configured"); await t.where({ id }).update({ enabled, updatedAt: now() }); this.invalidate(); }

  async recordOccurrence(input: AlertV1OccurrenceInput): Promise<{ created: boolean; id: string }> {
    validateAlertV1OccurrenceInput(input);
    const database = getPrisma(); if (!database) return { created: false, id: input.id };
    const channels = [...new Set(input.channels)];
    try {
      await database.transaction(async (transaction) => {
        const schema = transaction.orm.public as unknown as { AlertOccurrence: Table; AlertDelivery: Table; FlightEvent: Table };
        if (input.sourceType === "FLIGHT_EVENT" && !(await schema.FlightEvent.where({ id: input.flightEventId }).first())) {
          throw new AlertV1OccurrenceInvariantError(`FlightEvent ${input.flightEventId} does not exist`);
        }
        await schema.AlertOccurrence.create({ id: input.id, ruleId: input.ruleId, sourceType: input.sourceType, sourceKey: input.sourceKey, trigger: input.trigger, aircraftIcao: input.aircraftIcao, registration: input.registration ?? null, callsign: input.callsign ?? null, flightId: input.flightId ?? null, flightEventId: input.flightEventId ?? null, geofenceId: input.geofenceId ?? null, occurredAt: Temporal.Instant.fromEpochMilliseconds(Date.parse(input.occurredAt)), payloadJson: json(input.payload), createdAt: now() });
        for (const channel of channels) await schema.AlertDelivery.create({ id: randomUUID(), occurrenceId: input.id, channel, status: "PENDING", attemptCount: 0, nextAttemptAt: now(), createdAt: now(), updatedAt: now() });
      });
      return { created: true, id: input.id };
    } catch (error) { if (/unique|duplicate|constraint/i.test(String(error))) return { created: false, id: input.id }; throw error; }
  }

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
