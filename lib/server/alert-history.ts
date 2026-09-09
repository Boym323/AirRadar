import { appendFile, mkdir, open, stat } from "node:fs/promises";
import { dirname } from "node:path";
import type { Aircraft } from "@/lib/aircraft/types";
import { getRuntimeStatePath } from "@/lib/server/runtime-state";

export type AlertHistoryEventType = "watchlist" | "new_aircraft" | "reception_record" | "emergency";
export type AlertNotificationStatus = "pending" | "attempted" | "delivered" | "failed" | "disabled";
export type AlertHistoryReason = "watchlisted" | "new" | "record" | "emergency";
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
  type: AlertHistoryEventType;
  reason: AlertHistoryReason;
  aircraft: {
    icaoHex: string;
    registration: string | null;
    callsign: string | null;
    aircraftType: string | null;
  };
  record: AlertHistoryRecordValue | null;
  notificationStatus: AlertNotificationStatus;
  notificationAttemptedAt: string | null;
}

export interface AlertHistoryDetection {
  id: string;
  detectedAt: string;
  type: AlertHistoryEventType;
  reason: AlertHistoryReason;
  aircraft: Aircraft;
  record?: AlertHistoryRecordValue;
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

const MAX_PAGE_SIZE = 100;
const MAX_READ_BYTES = 2_000_000;
const MAX_LINE_LENGTH = 8_000;

export function getAlertHistoryPath(): string {
  return getRuntimeStatePath("alert-events.jsonl");
}

function cleanText(value: string | null | undefined, maximum = 120): string | null {
  const cleaned = value?.trim().replace(/[\r\n]+/g, " ");
  return cleaned ? cleaned.slice(0, maximum) : null;
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
  };
}

function lineFromUnknown(value: unknown): DetectionLine | NotificationLine | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.kind === "detected" && record.entry && typeof record.entry === "object") {
    return { kind: "detected", entry: record.entry as AlertHistoryEntry };
  }
  if (record.kind === "notification" && typeof record.id === "string"
    && typeof record.status === "string" && typeof record.at === "string") {
    const status = record.status as AlertNotificationStatus;
    if (["pending", "attempted", "delivered", "failed", "disabled"].includes(status)) {
      return { kind: "notification", id: record.id, status, at: record.at };
    }
  }
  return null;
}

function pageFromLines(lines: Iterable<unknown>, options: { page?: number; pageSize?: number }): AlertHistoryPage {
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
  const all = [...entries.values()].sort((a, b) => Date.parse(b.detectedAt) - Date.parse(a.detectedAt) || b.id.localeCompare(a.id));
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

  constructor(private readonly path = getAlertHistoryPath()) {}

  recordDetected(detection: AlertHistoryDetection): Promise<void> {
    const line: DetectionLine = { kind: "detected", entry: entryFromDetection(detection) };
    return this.enqueue(line);
  }

  recordNotification(id: string, status: AlertNotificationStatus, at = new Date().toISOString()): Promise<void> {
    const line: NotificationLine = { kind: "notification", id: id.slice(0, 180), status, at: validTimestamp(at) };
    return this.enqueue(line);
  }

  async list(options: { page?: number; pageSize?: number } = {}): Promise<AlertHistoryPage> {
    await this.writeQueue;
    const lines = await this.readTail();
    return pageFromLines(lines, options);
  }

  private enqueue(line: DetectionLine | NotificationLine): Promise<void> {
    const operation = this.writeQueue.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      await appendFile(this.path, `${JSON.stringify(line)}\n`, { encoding: "utf8", mode: 0o600 });
    });
    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }

  private async readTail(): Promise<unknown[]> {
    let size: number;
    try {
      size = (await stat(this.path)).size;
    } catch {
      return [];
    }
    if (size <= 0) return [];
    const start = Math.max(0, size - MAX_READ_BYTES);
    const handle = await open(this.path, "r");
    try {
      const buffer = Buffer.alloc(size - start);
      await handle.read(buffer, 0, buffer.length, start);
      const text = buffer.toString("utf8");
      const complete = start > 0 ? text.slice(text.indexOf("\n") + 1) : text;
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

  async list(options: { page?: number; pageSize?: number } = {}): Promise<AlertHistoryPage> {
    return pageFromLines(this.lines, options);
  }
}

export function createAlertHistoryStore(): JsonlAlertHistoryStore | MemoryAlertHistoryStore {
  const isTestRuntime = process.env.NODE_ENV === "test" || process.env.VITEST === "true";
  return isTestRuntime ? new MemoryAlertHistoryStore() : new JsonlAlertHistoryStore();
}

export async function listAlertHistory(options: { page?: number; pageSize?: number } = {}): Promise<AlertHistoryPage> {
  return createAlertHistoryStore().list(options);
}
