import { appendFile, mkdir, open, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import type { Aircraft } from "@/lib/aircraft/types";
import { getRuntimeStatePath } from "@/lib/server/runtime-state";
import { getAlertsFleetsRepository, type AlertV1HistoryRow } from "@/lib/server/alerts-fleets-repository";

export type AlertHistoryEventType =
  | "watchlist"
  | "aircraft_appeared"
  | "entered_radius"
  | "new_aircraft"
  | "reception_record"
  | "emergency"
  | "emergency_7500"
  | "emergency_7600"
  | "emergency_7700"
  | "intelligence_approach"
  | "intelligence_landing"
  | "intelligence_takeoff"
  | "intelligence_go_around"
  | "intelligence_holding"
  | "intelligence_diversion"
  | "intelligence_top_of_descent"
  | "predictive_eta"
  | "predictive_runway_change"
  | "data_stale"
  | "receiver_degraded"
  | "weather_proximity";
  // PostgreSQL-backed Alerts & Fleets V1 occurrence.
  // Kept generic so unknown future V1 trigger families still render safely.
export type AlertHistoryEventTypeWithV1 = AlertHistoryEventType | "alert_v1";
export type AlertNotificationStatus = "pending" | "attempted" | "delivered" | "failed" | "center_only" | "disabled";
export type AlertHistoryReason =
  | "watchlisted"
  | "appeared"
  | "entered_radius"
  | "new"
  | "record"
  | "emergency"
  | "squawk_7500"
  | "squawk_7600"
  | "squawk_7700"
  | "approach"
  | "landing"
  | "takeoff"
  | "go_around"
  | "holding"
  | "diversion"
  | "top_of_descent"
  | "eta_threshold"
  | "runway_change"
  | "data_stale"
  | "receiver_degraded"
  | "weather_proximity";
export type AlertHistoryReasonWithV1 = AlertHistoryReason | "alert_v1";
export type AlertHistoryFilter = "all" | "watchlist" | "emergency" | "records" | "intelligence";
export type ReceptionRecordScope = "daily" | "lifetime";

export interface AlertHistoryRecordValue {
  scope: ReceptionRecordScope;
  distanceKm: number;
  bearing: number;
  recordedAt: string;
  previousDistanceKm: number | null;
}

export interface AlertHistoryEntry {
  id: string;
  detectedAt: string;
  type: AlertHistoryEventTypeWithV1;
  reason: AlertHistoryReasonWithV1;
  aircraft: {
    icaoHex: string;
    registration: string | null;
    callsign: string | null;
    aircraftType: string | null;
  };
  ruleIds: string[];
  ruleNames: string[];
  radiusKm: number | null;
  squawk: string | null;
  record: AlertHistoryRecordValue | null;
  notificationStatus: AlertNotificationStatus;
  notificationAttemptedAt: string | null;
  intelligence: {
    eventType: string;
    confidenceLevel: "low" | "medium" | "high";
    airportIcao: string | null;
    sectorId: string | null;
  } | null;
  metadata?: Record<string, string | number | boolean | null>;
  alertV1?: {
    occurrenceId: string;
    ruleId?: string | null;
    sourceType: string;
    sourceKey: string;
    trigger: string;
    ruleName: string | null;
    flightEventId: number | null;
    flightEventType: string | null;
    airportIcao: string | null;
    runway: string | null;
    geofenceId: string | null;
    deliveryStatus: AlertNotificationStatus;
  };
}

export interface AlertHistoryDetection {
  id: string;
  detectedAt: string;
  type: AlertHistoryEventType;
  reason: AlertHistoryReason;
  aircraft: Aircraft;
  ruleIds?: string[];
  ruleNames?: string[];
  radiusKm?: number | null;
  squawk?: string | null;
  record?: AlertHistoryRecordValue;
  intelligence?: AlertHistoryEntry["intelligence"];
  metadata?: AlertHistoryEntry["metadata"];
}

export interface AlertHistoryPage {
  items: AlertHistoryEntry[];
  page: number;
  pageSize: number;
  nextPage: number | null;
}

interface DetectionLine {
  kind: "detected";
  entry: AlertHistoryEntry;
}

interface NotificationLine {
  kind: "notification";
  id: string;
  status: AlertNotificationStatus;
  at: string;
}

export interface AlertHistoryListOptions {
  page?: number;
  pageSize?: number;
  filter?: AlertHistoryFilter;
  ruleIds?: readonly string[];
}

const MAX_PAGE_SIZE = 100;
const MAX_READ_BYTES = 2_000_000;
const MAX_LINE_LENGTH = 8_000;
export const ALERT_LEDGER_MAX_BYTES = 8_000_000;
export const ALERT_LEDGER_RETENTION_BYTES = 2_000_000;

export function getAlertHistoryPath(): string {
  return getRuntimeStatePath("alert-events.jsonl");
}

function cleanText(value: string | null | undefined, maximum = 120): string | null {
  const cleaned = value?.trim().replace(/[\r\n]+/g, " ");
  return cleaned ? cleaned.slice(0, maximum) : null;
}

function cleanStrings(values: string[] | undefined, maximumItems = 20): string[] {
  if (!values) return [];
  return values.slice(0, maximumItems).flatMap((value) => {
    const cleaned = cleanText(value, 120);
    return cleaned ? [cleaned] : [];
  });
}

function validTimestamp(value: string): string {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

function entryFromDetection(detection: AlertHistoryDetection): AlertHistoryEntry {
  const metadata = detection.aircraft.enrichment?.metadata;
  return {
    id: detection.id.slice(0, 180),
    detectedAt: validTimestamp(detection.detectedAt),
    type: detection.type,
    reason: detection.reason,
    aircraft: {
      icaoHex: detection.aircraft.icaoHex.trim().toUpperCase().slice(0, 16),
      registration: cleanText(detection.aircraft.registration ?? metadata?.registration),
      callsign: cleanText(detection.aircraft.callsign),
      aircraftType: cleanText(detection.aircraft.aircraftType ?? metadata?.icaoTypeCode ?? metadata?.aircraftDescription),
    },
    ruleIds: cleanStrings(detection.ruleIds),
    ruleNames: cleanStrings(detection.ruleNames),
    radiusKm: detection.radiusKm !== null && detection.radiusKm !== undefined && Number.isFinite(detection.radiusKm)
      ? Math.max(0, detection.radiusKm)
      : null,
    squawk: cleanText(detection.squawk, 4),
    record: detection.record ? {
      scope: detection.record.scope,
      distanceKm: Number.isFinite(detection.record.distanceKm) ? Math.max(0, detection.record.distanceKm) : 0,
      bearing: Number.isFinite(detection.record.bearing) ? ((detection.record.bearing % 360) + 360) % 360 : 0,
      recordedAt: validTimestamp(detection.record.recordedAt),
      previousDistanceKm: detection.record.previousDistanceKm === null || !Number.isFinite(detection.record.previousDistanceKm)
        ? null
        : Math.max(0, detection.record.previousDistanceKm),
    } : null,
    notificationStatus: "pending",
    notificationAttemptedAt: null,
    intelligence: detection.intelligence ?? null,
    metadata: detection.metadata ?? {},
  };
}

function normalizeLegacyEntry(entry: AlertHistoryEntry): AlertHistoryEntry {
  return {
    ...entry,
    ruleIds: Array.isArray(entry.ruleIds) ? entry.ruleIds : [],
    ruleNames: Array.isArray(entry.ruleNames) ? entry.ruleNames : [],
    radiusKm: typeof entry.radiusKm === "number" && Number.isFinite(entry.radiusKm) ? entry.radiusKm : null,
    squawk: typeof entry.squawk === "string" ? entry.squawk : null,
    intelligence: entry.intelligence && typeof entry.intelligence === "object" ? entry.intelligence : null,
  };
}

function lineFromUnknown(value: unknown): DetectionLine | NotificationLine | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.kind === "detected" && record.entry && typeof record.entry === "object") {
    return { kind: "detected", entry: normalizeLegacyEntry(record.entry as AlertHistoryEntry) };
  }
  if (record.kind === "notification" && typeof record.id === "string"
    && typeof record.status === "string" && typeof record.at === "string") {
    const status = record.status as AlertNotificationStatus;
    if (["pending", "attempted", "delivered", "failed", "center_only", "disabled"].includes(status)) {
      return { kind: "notification", id: record.id, status, at: record.at };
    }
  }
  return null;
}

function matchesRuleIds(entry: AlertHistoryEntry, ruleIds: readonly string[] | undefined): boolean {
  if (ruleIds === undefined) return true;
  if (ruleIds.length === 0) return false;
  const allowed = new Set(ruleIds);
  return entry.ruleIds.some((ruleId) => allowed.has(ruleId));
}

function matchesFilter(entry: AlertHistoryEntry, filter: AlertHistoryFilter): boolean {
  if (filter === "all") return true;
  if (filter === "watchlist") return entry.type === "watchlist" || entry.type === "aircraft_appeared" || entry.type === "entered_radius" || entry.type === "predictive_eta" || entry.type === "predictive_runway_change";
  if (filter === "emergency") return entry.type === "emergency" || entry.type === "emergency_7500" || entry.type === "emergency_7600" || entry.type === "emergency_7700";
  if (filter === "intelligence") return entry.type.startsWith("intelligence_");
  return entry.type === "new_aircraft" || entry.type === "reception_record";
}

function v1DeliveryStatus(row: AlertV1HistoryRow, payload: Record<string, unknown>): AlertNotificationStatus {
  if (!row.deliveries.length) return payload.notificationDeliveryMode === "CENTER_ONLY" ? "center_only" : "disabled";
  if (row.deliveries.some((delivery) => delivery.status === "FAILED")) return "failed";
  if (row.deliveries.some((delivery) => delivery.status === "PROCESSING")) return "attempted";
  if (row.deliveries.every((delivery) => delivery.status === "SENT")) return "delivered";
  return "pending";
}

function entryFromV1(row: AlertV1HistoryRow): AlertHistoryEntry {
  const occurrence = row.occurrence;
  const payload = parseJson<Record<string, unknown>>(occurrence.payloadJson);
  const event = row.flightEvent;
  const flightEventType = typeof event?.type === "string" ? event.type : typeof payload.flightEventType === "string" ? payload.flightEventType : null;
  const deliveryStatus = v1DeliveryStatus(row, payload);
  return {
    id: `alert-v1:${String(occurrence.id)}`,
    detectedAt: validTimestamp(String(occurrence.occurredAt)),
    type: "alert_v1",
    reason: "alert_v1",
    aircraft: { icaoHex: cleanText(String(occurrence.aircraftIcao), 16) ?? "UNKNOWN", registration: cleanText(typeof occurrence.registration === "string" ? occurrence.registration : null), callsign: cleanText(typeof occurrence.callsign === "string" ? occurrence.callsign : null), aircraftType: null },
    ruleIds: typeof occurrence.ruleId === "string" ? [occurrence.ruleId] : [],
    ruleNames: row.ruleName ? [row.ruleName] : [], radiusKm: null, squawk: typeof payload.squawk === "string" ? payload.squawk : null, record: null,
    notificationStatus: deliveryStatus, notificationAttemptedAt: null, intelligence: null,
    alertV1: { occurrenceId: String(occurrence.id), ruleId: typeof occurrence.ruleId === "string" ? occurrence.ruleId : null, sourceType: String(occurrence.sourceType), sourceKey: String(occurrence.sourceKey), trigger: String(occurrence.trigger), ruleName: row.ruleName, flightEventId: typeof occurrence.flightEventId === "number" && Number.isInteger(occurrence.flightEventId) ? occurrence.flightEventId : null, flightEventType, airportIcao: typeof event?.airportIcao === "string" ? event.airportIcao : null, runway: typeof event?.runway === "string" ? event.runway : null, geofenceId: typeof occurrence.geofenceId === "string" ? occurrence.geofenceId : null, deliveryStatus },
  };
}

function parseJson<T>(value: unknown): T {
  try { return typeof value === "string" ? JSON.parse(value) as T : {} as T; } catch { return {} as T; }
}

function pageFromLines(lines: Iterable<unknown>, options: AlertHistoryListOptions): AlertHistoryPage {
  const entries = new Map<string, AlertHistoryEntry>();
  for (const line of lines) {
    const parsed = lineFromUnknown(line);
    if (!parsed) continue;
    if (parsed.kind === "detected") {
      const entry = parsed.entry;
      if (entry && typeof entry.id === "string" && entry.aircraft && typeof entry.detectedAt === "string") entries.set(entry.id, entry);
      continue;
    }
    const entry = entries.get(parsed.id);
    if (!entry) continue;
    entry.notificationStatus = parsed.status;
    entry.notificationAttemptedAt = parsed.at;
  }
  const filter = options.filter ?? "all";
  const all = [...entries.values()]
    .filter((entry) => matchesFilter(entry, filter) && matchesRuleIds(entry, options.ruleIds))
    .sort((a, b) => Date.parse(b.detectedAt) - Date.parse(a.detectedAt) || b.id.localeCompare(a.id));
  const pageSize = Math.min(Math.max(Math.trunc(options.pageSize ?? 25), 1), MAX_PAGE_SIZE);
  const page = Math.max(Math.trunc(options.page ?? 0), 0);
  const items = all.slice(page * pageSize, (page + 1) * pageSize);
  return { items, page, pageSize, nextPage: (page + 1) * pageSize < all.length ? page + 1 : null };
}

/**
 * Small append-only JSONL history. Detection and delivery are separate lines;
 * listing folds the status lines into a bounded, safe public DTO.
 */
export class JsonlAlertHistoryStore {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly path = getAlertHistoryPath(),
    private readonly retention = { maxBytes: ALERT_LEDGER_MAX_BYTES, retentionBytes: ALERT_LEDGER_RETENTION_BYTES },
  ) {}

  recordDetected(detection: AlertHistoryDetection): Promise<void> {
    const line: DetectionLine = { kind: "detected", entry: entryFromDetection(detection) };
    return this.enqueue(line);
  }

  recordNotification(id: string, status: AlertNotificationStatus, at = new Date().toISOString()): Promise<void> {
    const line: NotificationLine = { kind: "notification", id: id.slice(0, 180), status, at: validTimestamp(at) };
    return this.enqueue(line);
  }

  async list(options: AlertHistoryListOptions = {}): Promise<AlertHistoryPage> {
    await this.writeQueue;
    const lines = await this.readTail();
    return pageFromLines(lines, options);
  }

  private enqueue(line: DetectionLine | NotificationLine): Promise<void> {
    const operation = this.writeQueue.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      await appendFile(this.path, `${JSON.stringify(line)}\n`, { encoding: "utf8", mode: 0o600 });
      await this.compactIfNeeded();
    });
    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }

  private async compactIfNeeded(): Promise<void> {
    const handle = await open(this.path, "r");
    let text = "";
    let start = 0;
    try {
      const size = (await handle.stat()).size;
      if (size <= this.retention.maxBytes) return;
      start = Math.max(0, size - this.retention.retentionBytes);
      const buffer = Buffer.alloc(size - start);
      await handle.read(buffer, 0, buffer.length, start);
      text = buffer.toString("utf8");
    } finally {
      await handle.close();
    }
    const firstLineEnd = text.indexOf("\n");
    const retained = start > 0 && firstLineEnd >= 0 ? text.slice(firstLineEnd + 1) : text;
    const temporaryPath = `${this.path}.${process.pid}.compact.tmp`;
    try {
      const temporary = await open(temporaryPath, "wx", 0o600);
      try {
        await temporary.writeFile(retained, "utf8");
        await temporary.sync();
      } finally {
        await temporary.close();
      }
      await rename(temporaryPath, this.path);
    } finally {
      await unlink(temporaryPath).catch(() => undefined);
    }
  }

  private async readTail(): Promise<unknown[]> {
    let handle;
    try {
      handle = await open(this.path, "r");
    } catch {
      return [];
    }
    try {
      const size = (await handle.stat()).size;
      if (size <= 0) return [];
      const start = Math.max(0, size - MAX_READ_BYTES);
      const buffer = Buffer.alloc(size - start);
      await handle.read(buffer, 0, buffer.length, start);
      const text = buffer.toString("utf8");
      const firstLineEnd = text.indexOf("\n");
      const complete = start > 0 ? (firstLineEnd >= 0 ? text.slice(firstLineEnd + 1) : "") : text;
      return complete.split("\n").flatMap((line) => {
        if (!line || line.length > MAX_LINE_LENGTH) return [];
        try { return [JSON.parse(line) as unknown]; } catch { return []; }
      });
    } finally {
      await handle.close();
    }
  }
}

/**
 * Vitest-created state services must not write to either production or
 * checkout state. Each default test engine receives its own memory ledger;
 * JSONL tests inject an isolated temporary path explicitly.
 */
export class MemoryAlertHistoryStore {
  private readonly lines: Array<DetectionLine | NotificationLine> = [];

  async recordDetected(detection: AlertHistoryDetection): Promise<void> {
    this.lines.push({ kind: "detected", entry: entryFromDetection(detection) });
  }

  async recordNotification(id: string, status: AlertNotificationStatus, at = new Date().toISOString()): Promise<void> {
    this.lines.push({ kind: "notification", id: id.slice(0, 180), status, at: validTimestamp(at) });
  }

  async list(options: AlertHistoryListOptions = {}): Promise<AlertHistoryPage> {
    return pageFromLines(this.lines, options);
  }
}

export function createAlertHistoryStore(): JsonlAlertHistoryStore | MemoryAlertHistoryStore {
  const isTestRuntime = process.env.NODE_ENV === "test" || process.env.VITEST === "true";
  return isTestRuntime ? new MemoryAlertHistoryStore() : new JsonlAlertHistoryStore();
}

export async function listAlertHistory(options: AlertHistoryListOptions = {}): Promise<AlertHistoryPage> {
  const legacy = await createAlertHistoryStore().list({ ...options, page: 0, pageSize: MAX_PAGE_SIZE });
  let v1: AlertHistoryEntry[] = [];
  try { v1 = (await getAlertsFleetsRepository().listOccurrenceHistory(200)).map(entryFromV1); } catch { /* PostgreSQL is optional for live radar and history */ }
  const all = [...legacy.items, ...v1]
    .filter((entry) => matchesFilter(entry, options.filter ?? "all") && matchesRuleIds(entry, options.ruleIds))
    .sort((a, b) => Date.parse(b.detectedAt) - Date.parse(a.detectedAt) || b.id.localeCompare(a.id));
  const pageSize = Math.min(Math.max(Math.trunc(options.pageSize ?? 25), 1), MAX_PAGE_SIZE);
  const page = Math.max(Math.trunc(options.page ?? 0), 0);
  const items = all.slice(page * pageSize, (page + 1) * pageSize);
  return { items, page, pageSize, nextPage: (page + 1) * pageSize < all.length ? page + 1 : null };
}
