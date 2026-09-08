import "temporal-polyfill/full/global";
import type { ReceiverReceptionRecord, ReceiverReceptionRecordsResponse } from "@/lib/aircraft/types";
import type { ReceiverDailyReceptionRecord } from "@/lib/server/statistics";
import { getPrisma } from "@/lib/server/db";

export const RECEPTION_RECORD_LIMIT = 10;

export interface ReceiverDailyReceptionRecordRow {
  date: string;
  maxDistanceKm: number;
  maxDistanceIcaoHex: string | null;
  maxDistanceRegistration: string | null;
  maxDistanceAt: Temporal.Instant | Date | null;
  maxDistanceBearing: number | null;
}

function cleanValue(value: string | null | undefined): string | null {
  const cleaned = value?.trim();
  return cleaned || null;
}

function dateFromValue(value: Temporal.Instant | Date | null): Date | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value.epochMilliseconds);
  return Number.isFinite(date.getTime()) ? date : null;
}

function validHex(value: string | null | undefined): string | null {
  const hex = cleanValue(value)?.toUpperCase() ?? "";
  return /^[0-9A-F]{6}$/.test(hex) ? hex : null;
}

function recordFromCandidate(candidate: ReceiverDailyReceptionRecordRow | ReceiverDailyReceptionRecord): ReceiverReceptionRecord | null {
  const publicRecord = "icaoHex" in candidate;
  const distanceKm = publicRecord ? candidate.distanceKm : candidate.maxDistanceKm;
  const icaoHex = publicRecord ? validHex(candidate.icaoHex) : validHex(candidate.maxDistanceIcaoHex);
  const bearing = publicRecord ? candidate.bearing : candidate.maxDistanceBearing;
  const recordedAt = publicRecord ? new Date(candidate.recordedAt) : dateFromValue(candidate.maxDistanceAt);
  if (!candidate.date || !Number.isFinite(distanceKm) || distanceKm <= 0 || !icaoHex
    || typeof bearing !== "number" || !Number.isFinite(bearing) || bearing < 0 || bearing >= 360 || !recordedAt) return null;
  return {
    date: candidate.date,
    distanceKm,
    icaoHex,
    registration: publicRecord ? cleanValue(candidate.registration) : cleanValue(candidate.maxDistanceRegistration),
    recordedAt: recordedAt.toISOString(),
    bearing,
  };
}

function preferRecord(current: ReceiverReceptionRecord | undefined, next: ReceiverReceptionRecord): ReceiverReceptionRecord {
  if (!current || next.distanceKm > current.distanceKm) return next;
  if (next.distanceKm < current.distanceKm) return current;
  return next.recordedAt >= current.recordedAt ? next : current;
}

export function buildReceptionRecords(
  rows: ReceiverDailyReceptionRecordRow[],
  today: ReceiverDailyReceptionRecord | null,
  source: ReceiverReceptionRecordsResponse["source"],
): ReceiverReceptionRecordsResponse {
  const persisted = rows.flatMap((row) => {
    const record = recordFromCandidate(row);
    return record ? [record] : [];
  });
  const byDate = new Map<string, ReceiverReceptionRecord>();
  for (const record of persisted) byDate.set(record.date, preferRecord(byDate.get(record.date), record));
  const current = today ? recordFromCandidate(today) : null;
  if (current) byDate.set(current.date, preferRecord(byDate.get(current.date), current));

  const records = [...byDate.values()].sort((a, b) => b.distanceKm - a.distanceKm
    || b.recordedAt.localeCompare(a.recordedAt)
    || a.icaoHex.localeCompare(b.icaoHex));
  const currentDate = current?.date ?? today?.date ?? null;
  return {
    source,
    today: currentDate ? records.find((record) => record.date === currentDate) ?? null : null,
    lifetime: records[0] ?? null,
    top: records.slice(0, RECEPTION_RECORD_LIMIT),
    historicalRecordCount: persisted.length,
  };
}

/**
 * Returns daily maximum-distance records whose new V1 bearing field is
 * present. Legacy daily rows remain queryable for statistics, but are not
 * presented as reception records because their direction cannot be recovered.
 */
export async function getReceptionRecords(today: ReceiverDailyReceptionRecord | null): Promise<ReceiverReceptionRecordsResponse> {
  const database = getPrisma();
  if (!database) return buildReceptionRecords([], today, "memory");
  try {
    const rows = await database.orm.public.ReceiverDailyStats
      .where((row) => row.maxDistanceBearing.gte(0))
      .orderBy((row) => row.maxDistanceKm.desc())
      .limit(RECEPTION_RECORD_LIMIT)
      .all();
    return buildReceptionRecords(rows, today, "postgres");
  } catch (error) {
    console.error("AirRadar reception records load failed", error);
    return buildReceptionRecords([], today, "unavailable");
  }
}
