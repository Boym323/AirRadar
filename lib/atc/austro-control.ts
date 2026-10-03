import { load } from "cheerio";
import { createHash } from "node:crypto";
import { aviationCoordinateToDecimal } from "./cz-geometry";
import type { AtcImportDocument, AtcImportSector, ImportAltitude } from "./import-format";
import type { Coordinate } from "./types";
import { getAirRadarUserAgent } from "@/lib/server/user-agent";

export const AUSTRO_CONTROL_ENTRY_URL = "https://eaip.austrocontrol.at/";
export const AUSTRO_CONTROL_HOST = "eaip.austrocontrol.at";
export const AUSTRO_CONTROL_SOURCE_NAME = "Austro Control AIP";
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_PDF_BYTES = 32 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"] as const;
const DMS = /(\d{2,3})\s+(\d{2})\s+(\d{2}(?:[.,]\d+)?)([NS])\s+(\d{2,3})\s+(\d{2})\s+(\d{2}(?:[.,]\d+)?)([EW])/g;

export interface AustroControlPublication {
  effectiveFrom: string;
  effectiveUntil: string | null;
  baseUrl: string;
  current: boolean;
}

export interface AustroControlDiscovery {
  provider: "AUSTRO_CONTROL";
  countryCode: "AT";
  current: AustroControlPublication | null;
  future: AustroControlPublication | null;
  latestAmendment: string | null;
  latestAiracAmendment: string | null;
}

export interface AustroControlSource {
  discovery: AustroControlDiscovery;
  enr21Url: string;
  enr22Url: string;
  enr31Url: string;
  enr32Url: string;
  enr33Url: string;
  enr41Url: string;
  enr44Url: string;
}

export function austroControlMetadataFromPublicationHtml(html: string): { latestAmendment: string | null; latestAiracAmendment: string | null } {
  const latestAmendment = /latest AMDT:\s*<[^>]*>\s*(\d+)/i.exec(html)?.[1] ?? /latest AMDT:\s*(\d+)/i.exec(html)?.[1] ?? null;
  const latestAiracAmendment = /latest AIRAC AMDT:\s*<[^>]*>\s*(\d+)/i.exec(html)?.[1] ?? /latest AIRAC AMDT:\s*(\d+)/i.exec(html)?.[1] ?? null;
  return { latestAmendment, latestAiracAmendment };
}

function boundedText(response: Response, limit: number): Promise<string> {
  const length = Number(response.headers.get("content-length") ?? "0");
  if (length > limit) throw new Error(`Austro Control response exceeds ${limit} bytes`);
  return response.text().then((text) => {
    if (new TextEncoder().encode(text).byteLength > limit) throw new Error(`Austro Control response exceeds ${limit} bytes`);
    return text;
  });
}

function dateFromLabel(value: string): string | null {
  const match = /^(\d{2})\s+([A-Z]{3})\s+(\d{4})$/i.exec(value.trim());
  if (!match) return null;
  const month = MONTHS.indexOf(match[2].toUpperCase() as typeof MONTHS[number]);
  if (month < 0) return null;
  const date = new Date(Date.UTC(Number(match[3]), month, Number(match[1])));
  return date.getUTCDate() === Number(match[1]) ? date.toISOString().slice(0, 10) : null;
}

function parseUntil(value: string): string | null {
  if (/^UFN$/i.test(value.trim())) return null;
  const date = dateFromLabel(value);
  if (!date) return null;
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

export function austroControlPublicationFromUrl(url: string, current = false): AustroControlPublication | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== AUSTRO_CONTROL_HOST) return null;
    const match = /\/lo\/(\d{2})(\d{2})(\d{2})\//i.exec(parsed.pathname);
    if (!match) return null;
    const effectiveFrom = `20${match[1]}-${match[2]}-${match[3]}`;
    if (!/^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(effectiveFrom)) return null;
    return { effectiveFrom, effectiveUntil: null, baseUrl: new URL(`/lo/${match[1]}${match[2]}${match[3]}/`, parsed).toString(), current };
  } catch { return null; }
}

export function discoverAustroControlPublications(html: string, now = new Date()): AustroControlDiscovery {
  const $ = load(html);
  const publications: AustroControlPublication[] = [];
  $("tr").each((_index, row) => {
    const cells = $(row).find("td").map((_i, cell) => $(cell).text().replace(/\s+/g, " ").trim()).get();
    const href = $(row).find("a[href]").attr("href");
    if (cells.length < 3 || !href) return;
    const effectiveFrom = dateFromLabel(cells[0]);
    if (!effectiveFrom) return;
    const url = new URL(href, AUSTRO_CONTROL_ENTRY_URL).toString();
    const publication = austroControlPublicationFromUrl(url, row.attribs?.class === "current");
    if (!publication) return;
    publication.effectiveFrom = effectiveFrom;
    publication.effectiveUntil = parseUntil(cells[1]);
    publications.push(publication);
  });
  const unique = [...new Map(publications.map((item) => [item.baseUrl, item])).values()].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const timestamp = now.getTime();
  const current = unique.find((item) => Date.parse(`${item.effectiveFrom}T00:00:00Z`) <= timestamp && (!item.effectiveUntil || timestamp < Date.parse(`${item.effectiveUntil}T00:00:00Z`))) ?? null;
  const future = unique.find((item) => Date.parse(`${item.effectiveFrom}T00:00:00Z`) > timestamp) ?? null;
  return { provider: "AUSTRO_CONTROL", countryCode: "AT", current, future, latestAmendment: null, latestAiracAmendment: null };
}

export function austroControlPdfUrls(publication: AustroControlPublication): Pick<AustroControlSource, "enr21Url" | "enr22Url" | "enr31Url" | "enr32Url" | "enr33Url" | "enr41Url" | "enr44Url"> {
  const part = (name: string) => new URL(`PART_2/LO_${name}_en.pdf`, publication.baseUrl).toString();
  return { enr21Url: part("ENR_2_1"), enr22Url: part("ENR_2_2"), enr31Url: part("ENR_3_1"), enr32Url: part("ENR_3_2"), enr33Url: part("ENR_3_3"), enr41Url: part("ENR_4_1"), enr44Url: part("ENR_4_4") };
}

export async function discoverAustroControl(options: { now?: Date; fetchImpl?: typeof fetch } = {}): Promise<AustroControlDiscovery> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(AUSTRO_CONTROL_ENTRY_URL, { redirect: "follow", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { Accept: "text/html", "User-Agent": getAirRadarUserAgent("Austro-Control-AIP-discovery") } });
  if (!response.ok) throw new Error(`Austro Control discovery HTTP ${response.status}`);
  const discovery = discoverAustroControlPublications(await boundedText(response, MAX_HTML_BYTES), options.now);
  const publication = discovery.current ?? discovery.future;
  if (publication) {
    try {
      const page = await fetchImpl(new URL("index.htm", publication.baseUrl), { redirect: "follow", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { Accept: "text/html", "User-Agent": getAirRadarUserAgent("Austro-Control-AIP-metadata") } });
      if (page.ok) Object.assign(discovery, austroControlMetadataFromPublicationHtml(await boundedText(page, MAX_HTML_BYTES)));
    } catch { /* discovery remains usable without optional amendment metadata */ }
  }
  return discovery;
}

export async function fetchAustroControlSource(options: { now?: Date; fetchImpl?: typeof fetch } = {}): Promise<AustroControlSource> {
  const discovery = await discoverAustroControl(options);
  if (!discovery.current) throw new Error("No currently effective Austro Control AIP publication was discovered");
  return { discovery, ...austroControlPdfUrls(discovery.current) };
}

export async function fetchAustroControlPdf(url: string, fetchImpl: typeof fetch = fetch): Promise<Uint8Array> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== AUSTRO_CONTROL_HOST) throw new Error("Refusing non-authoritative Austro Control PDF URL");
  const response = await fetchImpl(url, { redirect: "follow", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { Accept: "application/pdf", "User-Agent": getAirRadarUserAgent("Austro-Control-AIP-PDF") } });
  if (!response.ok) throw new Error(`Austro Control PDF HTTP ${response.status}`);
  const type = response.headers.get("content-type")?.toLowerCase() ?? "";
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_PDF_BYTES || !bytes.slice(0, 5).every((value, index) => value === "%PDF-".charCodeAt(index))) throw new Error("Austro Control response is not a bounded PDF");
  if (type && !type.includes("pdf") && !type.includes("octet-stream")) throw new Error(`Austro Control PDF content type rejected: ${type}`);
  return bytes;
}

export async function extractAustroControlPdfText(bytes: Uint8Array): Promise<string> {
  if (bytes.byteLength > MAX_PDF_BYTES || String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") throw new Error("Invalid PDF input");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => "str" in item ? item.str : "").join(" "));
  }
  return pages.join("\n").replace(/\s+/g, " ").trim();
}

export function parseAustrianAltitude(value: string): ImportAltitude | null {
  const text = value.replace(/\s+/g, " ").trim().toUpperCase();
  if (text === "GND" || text === "SFC") return "SFC";
  if (text === "UNL") return "UNL";
  const fl = /^FL\s*(\d{1,3})$/.exec(text);
  if (fl) return `FL${Number(fl[1])}`;
  const feet = /^(\d[\d ]*)\s*FT\s*(AMSL|AGL)$/.exec(text);
  if (feet) return feet[2] === "AGL" ? `${Number(feet[1].replace(/ /g, ""))} AGL` : Number(feet[1].replace(/ /g, ""));
  return null;
}

function pair(value: string): Coordinate {
  const match = /(\d{2,3}\s+\d{2}\s+\d{2}(?:[.,]\d+)?[NS])\s+(\d{2,3}\s+\d{2}\s+\d{2}(?:[.,]\d+)?[EW])/.exec(value);
  if (!match) throw new Error("Austrian AIP coordinate pair missing");
  return [aviationCoordinateToDecimal(match[2]), aviationCoordinateToDecimal(match[1])];
}

export interface AustrianAtcParseOptions { effectiveDate: string; sourceReference: string; boundaryResolver?: (start: Coordinate, end: Coordinate, name: string) => Coordinate[]; verifiedAt?: Date; }
export interface AustrianAtcDiagnostic { name: string; status: "accepted" | "skipped"; reason: string | null; geometry: "direct" | "state-boundary" | "unsupported"; }

export function parseAustrianEnr21(text: string, options: AustrianAtcParseOptions): { document: AtcImportDocument; diagnostics: AustrianAtcDiagnostic[] } {
  const normalized = text.replace(/\s+/g, " ").replace(/\bAIRAC AMDT\s+\d+\b/gi, "");
  const entries = [...normalized.matchAll(/(?=(?:FIR WIEN|TMA\s+[A-Z0-9]+\s*\d*|CTA\s+[A-Z0-9]+))/g)].map((match, index, all) => normalized.slice(match.index ?? 0, all[index + 1]?.index ?? normalized.length));
  const sectors: AtcImportSector[] = [];
  const diagnostics: AustrianAtcDiagnostic[] = [];
  for (const entry of entries) {
    const name = /^(FIR WIEN|TMA\s+[A-Z0-9]+\s*\d*|CTA\s+[A-Z0-9]+)/i.exec(entry)?.[1]?.trim() ?? "";
    if (!name) continue;
    const coordinateMatches = [...entry.matchAll(DMS)];
    const coords = coordinateMatches.map((match) => pair(match[0]));
    if (coords.length < 3) { diagnostics.push({ name, status: "skipped", reason: "missing deterministic lateral coordinates", geometry: "unsupported" }); continue; }
    const boundarySegments = [...entry.matchAll(/along State Boundary to/gi)].length;
    let polygon = coords;
    let geometry: AustrianAtcDiagnostic["geometry"] = "direct";
    try {
      if (boundarySegments) {
        polygon = [coords[0]];
        for (let i = 1; i < coords.length; i += 1) {
          const previous = coordinateMatches[i - 1];
          const current = coordinateMatches[i];
          const between = entry.slice((previous.index ?? 0) + previous[0].length, current.index ?? entry.length);
          if (/along State Boundary to/i.test(between)) {
            if (!options.boundaryResolver) throw new Error("official BEV state-boundary resolver unavailable");
            polygon.push(...(options.boundaryResolver(coords[i - 1], coords[i], name)).slice(1));
            geometry = "state-boundary";
          } else polygon.push(coords[i]);
        }
      }
      if (polygon[0][0] !== polygon.at(-1)![0] || polygon[0][1] !== polygon.at(-1)![1]) polygon.push(polygon[0]);
      if (polygon.length < 4) throw new Error("invalid polygon ring");
      const limitMatch = /((?:FL\s*\d{1,3}|\d[\d ]*\s*FT\s*(?:AMSL|AGL)|GND|UNL)\s*\/\s*(?:FL\s*\d{1,3}|\d[\d ]*\s*FT\s*(?:AMSL|AGL)|GND|UNL))/i.exec(entry);
      const limits = limitMatch?.[1].split("/").map((value) => parseAustrianAltitude(value.trim())) ?? [];
      const sourceVertical = entry.match(/(Upper State Boundary\s*\/\s*GND|FL\s*\d{1,3}\s*\/\s*[^[]+)/i)?.[1]?.trim() ?? null;
      const sector: AtcImportSector = { id: `AT-${name.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`, name, country: "AT", polygons: [polygon], lowerAltitude: limits[1] ?? null, upperAltitude: limits[0] ?? null, airspaceType: /FIR/i.test(name) ? "FIR" : /CTA/i.test(name) ? "CTA" : "TMA", airspaceClass: /\[([A-G])\]/i.exec(entry)?.[1]?.toUpperCase() ?? null, remarks: sourceVertical ? `Vertical limits (source): ${sourceVertical}; full class/vertical stack retained in source PDF.` : null, service: /ACC WIEN/i.test(entry) ? "ACC" : null, atcCallsign: /WIEN RADAR/i.test(entry) ? "WIEN RADAR" : null, primaryFrequencyMhz: null, alternateFrequencies: [], sourceReference: options.sourceReference, lastVerifiedAt: (options.verifiedAt ?? new Date()).toISOString(), validFrom: options.effectiveDate, validTo: null };
      sectors.push(sector); diagnostics.push({ name, status: "accepted", reason: null, geometry });
    } catch (error) { diagnostics.push({ name, status: "skipped", reason: error instanceof Error ? error.message : String(error), geometry: "unsupported" }); }
  }
  if (!entries.length) throw new Error("Austro Control ENR 2.1 contained no recognizable airspace entries");
  return { document: { schemaVersion: 1, source: { name: AUSTRO_CONTROL_SOURCE_NAME, reference: options.sourceReference, effectiveDate: options.effectiveDate, lastVerifiedAt: (options.verifiedAt ?? new Date()).toISOString() }, sectors, transmitters: [] }, diagnostics };
}

export function sha256(value: Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
