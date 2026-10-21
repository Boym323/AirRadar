import { load } from "cheerio";
import type { ActualAirspaceActivation, PlannedAirspaceWindow, PlannedAirspaceWindowSource } from "./types";

export const CZ_AUP_INDEX_URL = "https://aup.rlp.cz/";
export const CZ_ACTIVATION_INDEX_URL = "https://aim.rlp.cz/?lang=cz&p=act-area";
export const CZ_ACTIVATION_DATA_BASE_URL = "https://aim.rlp.cz/data/activation/";

export interface CzAupIndex {
  aupUrl: string | null;
  uupUrls: string[];
  sourceUpdatedAt: string | null;
}

interface ParsedPlanRow {
  sequence: number;
  designator: string;
  lowerLimit: string;
  upperLimit: string;
  fromClock: string;
  toClock: string;
  responsibleUnit: string | null;
  activity: string | null;
}

export interface ParsedCzPlanPage {
  validityStart: Date;
  validityEnd: Date;
  issuedAt: Date | null;
  rows: ParsedPlanRow[];
}

export interface CzActualActivationIndex {
  fileName: string | null;
  sourceUrl: string | null;
  previewUrl: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
}

const PLAN_ROW_PATTERN = /^(\d+)\.\s+(\S+)\s+(\S+)\s+(\S+)\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})\s+(\S+)(?:\s+(.*))?$/;
const VALIDITY_PATTERN = /\bOD\s+(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\s+(\d{2}:\d{2})\s+DO\s+(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\s+(\d{2}:\d{2})\b/i;
const ISSUED_PATTERN = /Datum\s+a\s+cas\s+vydani:\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\s+(\d{2}:\d{2}:\d{2})/i;
const UPDATE_PATTERN = /Aktualizace\s+dat:\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\s+(\d{2}:\d{2}:\d{2})\s*UTC/i;
const ACTUAL_FILE_PATTERN = /^activation\.(\d{4})(\d{2})(\d{2})-(\d{2})_aup\.json$/i;

function utcDate(year: number, month: number, day: number, clock: string): Date {
  const [hour, minute, second = 0] = clock.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
}

function toIsoFromMatch(match: RegExpMatchArray | null): string | null {
  if (!match) return null;
  return utcDate(Number(match[3]), Number(match[2]), Number(match[1]), match[4]).toISOString();
}

function absoluteUrl(href: string, baseUrl: string): string | null {
  try {
    const url = new URL(href, baseUrl);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizedBodyText(html: string): string {
  const $ = load(html);
  return $("body").text()
    .replaceAll("\r", "")
    .replaceAll("\u00a0", " ")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export function canonicalCzechAirspaceDesignator(value: string): string {
  const designator = value.trim().toUpperCase();
  if (/^LK(?:TSA|TRA)\d+[A-Z]?$/.test(designator)) return designator;
  if (/^(?:TSA|TRA)\d+[A-Z]?$/.test(designator)) return `LK${designator}`;
  return designator;
}

export function parseCzAupIndex(html: string, baseUrl = CZ_AUP_INDEX_URL): CzAupIndex {
  const $ = load(html);
  let aupUrl: string | null = null;
  const uupUrls: string[] = [];

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href")?.trim();
    if (!href) return;
    const label = $(element).text().replace(/\s+/g, " ").trim().toUpperCase();
    const resolved = absoluteUrl(href, baseUrl);
    if (!resolved) return;
    const path = new URL(resolved).pathname.toLowerCase();
    if (!aupUrl && (label.includes("AUP") || path.includes("/aup_")) && !path.includes("/uup_")) aupUrl = resolved;
    if ((label.includes("UUP") || path.includes("/uup_")) && !uupUrls.includes(resolved)) uupUrls.push(resolved);
  });

  const text = normalizedBodyText(html);
  return {
    aupUrl,
    uupUrls,
    sourceUpdatedAt: toIsoFromMatch(text.match(UPDATE_PATTERN)),
  };
}

function parseValidity(text: string): { start: Date; end: Date } {
  const match = text.match(VALIDITY_PATTERN);
  if (!match) throw new Error("Czech AUP/UUP validity window not found");
  return {
    start: utcDate(Number(match[3]), Number(match[2]), Number(match[1]), match[4]),
    end: utcDate(Number(match[7]), Number(match[6]), Number(match[5]), match[8]),
  };
}

function parsePlanRows(text: string): ParsedPlanRow[] {
  const lines = text.split("\n");
  const sectionStart = lines.findIndex((line) => /^C\//i.test(line));
  if (sectionStart < 0) return [];
  let sectionEnd = lines.findIndex((line, index) => index > sectionStart && /^D\//i.test(line));
  if (sectionEnd < 0) sectionEnd = lines.length;

  const rows: ParsedPlanRow[] = [];
  for (const line of lines.slice(sectionStart + 1, sectionEnd)) {
    const match = line.match(PLAN_ROW_PATTERN);
    if (!match) continue;
    rows.push({
      sequence: Number(match[1]),
      designator: match[2].toUpperCase(),
      lowerLimit: match[3].toUpperCase(),
      upperLimit: match[4].toUpperCase(),
      fromClock: match[5],
      toClock: match[6],
      responsibleUnit: match[7] === "---" ? null : match[7],
      activity: match[8]?.trim() || null,
    });
  }
  return rows;
}

export function parseCzPlanPage(html: string): ParsedCzPlanPage {
  const text = normalizedBodyText(html);
  const validity = parseValidity(text);
  const issuedMatch = text.match(ISSUED_PATTERN);
  return {
    validityStart: validity.start,
    validityEnd: validity.end,
    issuedAt: issuedMatch ? utcDate(Number(issuedMatch[3]), Number(issuedMatch[2]), Number(issuedMatch[1]), issuedMatch[4]) : null,
    rows: parsePlanRows(text),
  };
}

function clockWithinAupWindow(validityStart: Date, clock: string): Date {
  const [hour, minute] = clock.split(":").map(Number);
  const date = new Date(validityStart);
  if (hour < 6) date.setUTCDate(date.getUTCDate() + 1);
  date.setUTCHours(hour, minute, 0, 0);
  return date;
}

function rowToWindow(
  row: ParsedPlanRow,
  validityStart: Date,
  now: Date,
  source: PlannedAirspaceWindowSource,
  sourceReference: string,
): PlannedAirspaceWindow {
  const startsAt = clockWithinAupWindow(validityStart, row.fromClock);
  let endsAt = clockWithinAupWindow(validityStart, row.toClock);
  if (endsAt.getTime() < startsAt.getTime()) endsAt = new Date(endsAt.getTime() + 24 * 60 * 60_000);
  return {
    sequence: row.sequence,
    designator: row.designator,
    canonicalDesignator: canonicalCzechAirspaceDesignator(row.designator),
    lowerLimit: row.lowerLimit,
    upperLimit: row.upperLimit,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    responsibleUnit: row.responsibleUnit,
    activity: row.activity,
    plannedNow: startsAt.getTime() <= now.getTime() && now.getTime() < endsAt.getTime(),
    source,
    sourceReference,
  };
}

export function buildCurrentCzPlan(
  aup: ParsedCzPlanPage,
  aupReference: string,
  uups: Array<{ page: ParsedCzPlanPage; reference: string }>,
  now = new Date(),
): PlannedAirspaceWindow[] {
  const rows = new Map<number, { row: ParsedPlanRow; source: PlannedAirspaceWindowSource; reference: string }>();
  for (const row of aup.rows) rows.set(row.sequence, { row, source: "AUP", reference: aupReference });

  for (const uup of uups) {
    for (const row of uup.page.rows) {
      if (/\bCNL\b/i.test(row.activity ?? "")) {
        rows.delete(row.sequence);
        continue;
      }
      rows.set(row.sequence, { row, source: "UUP", reference: uup.reference });
    }
  }

  return [...rows.values()]
    .map(({ row, source, reference }) => rowToWindow(row, aup.validityStart, now, source, reference))
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt) || left.sequence - right.sequence);
}

function actualPeriodFromFileName(fileName: string): { start: Date; end: Date } | null {
  const match = fileName.match(ACTUAL_FILE_PATTERN);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const start = utcDate(year, month, day, "06:00");
  const end = new Date(start.getTime() + 24 * 60 * 60_000);
  return { start, end };
}

export function parseCzActualActivationIndex(html: string, baseUrl = "https://aim.rlp.cz/"): CzActualActivationIndex {
  const $ = load(html);
  let fileName: string | null = null;
  let sourceUrl: string | null = null;
  let previewUrl: string | null = null;

  $("a[href]").each((_, element) => {
    if (fileName) return;
    const label = $(element).text().trim();
    const href = $(element).attr("href")?.trim();
    const candidate = label.match(ACTUAL_FILE_PATTERN)?.[0] ?? href?.split("/").pop()?.match(ACTUAL_FILE_PATTERN)?.[0] ?? null;
    if (!candidate || !href) return;
    const resolved = absoluteUrl(href, baseUrl);
    if (!resolved) return;
    fileName = candidate;
    sourceUrl = resolved;
  });

  if (fileName) {
    $("a[href]").each((_, element) => {
      if (previewUrl) return;
      const href = $(element).attr("href")?.trim();
      if (!href || !href.includes("act-display") || !href.includes(fileName!)) return;
      previewUrl = absoluteUrl(href, baseUrl);
    });
    previewUrl ??= `${baseUrl}?actfilename=${encodeURIComponent(fileName)}&lang=cz&p=act-display`;
  }

  const period = fileName ? actualPeriodFromFileName(fileName) : null;
  return {
    fileName,
    sourceUrl: sourceUrl ?? (fileName ? `${CZ_ACTIVATION_DATA_BASE_URL}${encodeURIComponent(fileName)}` : null),
    previewUrl,
    periodStart: period?.start ?? null,
    periodEnd: period?.end ?? null,
  };
}

function parseActualDateTime(value: string): Date | null {
  const normalized = value.trim();
  const match = normalized.match(/^(\d{4})[-.](\d{2})[-.](\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  return utcDate(Number(match[1]), Number(match[2]), Number(match[3]), `${match[4]}:${match[5]}:${match[6] ?? "00"}`);
}

export function parseCzActualActivationPreview(html: string): ActualAirspaceActivation[] {
  const $ = load(html);
  const records: ActualAirspaceActivation[] = [];
  $("tr").each((_, row) => {
    const cells = $(row).find("th,td").map((__, cell) => $(cell).text().replace(/\s+/g, " ").trim()).get();
    if (cells.length < 6) return;
    const designator = cells[0]?.trim().toUpperCase();
    if (!designator || /^(?:AIRSPACE|PROSTOR|IDENT)/i.test(designator)) return;
    const startsAt = parseActualDateTime(cells[2]);
    const endsAt = parseActualDateTime(cells[3]);
    if (!startsAt || !endsAt) return;
    records.push({
      designator,
      canonicalDesignator: canonicalCzechAirspaceDesignator(designator),
      name: cells[1] || null,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      lowerLimit: cells[4] || "UNKNOWN",
      upperLimit: cells[5] || "UNKNOWN",
    });
  });
  return records;
}
