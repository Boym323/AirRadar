import { load } from "cheerio";
import { aviationCoordinateToDecimal } from "./cz-geometry";
import type { StateBoundaryProvider, StateBoundaryResolution } from "./cz-boundary";
import type { AtcImportDocument, AtcImportFrequency, AtcImportSector, ImportAltitude } from "./import-format";
import { isSupportedAtcFrequencyMhz } from "./frequency-policy";
import type { Coordinate } from "./types";
import { getAirRadarUserAgent } from "@/lib/server/user-agent";

export const SK_EAIP_SOURCE_NAME = "Slovak eAIP";
export const SK_EAIP_BASE_URL = "https://aim.lps.sk/web/eAIP_SR";
export const SK_EAIP_HOST = "aim.lps.sk";
export const SK_EAIP_AIRAC_ANCHOR = "2026-09-03";

const MAX_EAIP_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;
const AIRAC_CYCLE_MS = 28 * 24 * 60 * 60_000;
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"] as const;
const COORDINATE_PAIR_PATTERN = /(\d{6}(?:[.,]\d+)?[NS])\s*(\d{7}(?:[.,]\d+)?[EW])/gi;
const ALTITUDE_PATTERN = /(UNL|GND|SFC|FL\s*\d{1,3}|\d[\d ]*\s*ft\s*(?:AMSL|AGL))/gi;

export interface SkEaipSource {
  enr21Html: string;
  enr21Url: string;
  effectiveDate: string;
}

export interface SkEaipDiagnostic {
  name: string;
  status: "accepted" | "skipped";
  reason: string | null;
  geometry: "direct" | "state-boundary" | "unsupported";
  boundaryResolutions: StateBoundaryResolution[];
}

export interface SkEaipParseResult {
  document: AtcImportDocument;
  effectiveDate: string;
  diagnostics: SkEaipDiagnostic[];
}

export interface ParseSkEaipOptions {
  sourceReference: string;
  effectiveDate: string;
  boundaryProvider?: StateBoundaryProvider;
  verifiedAt?: Date;
}

interface ParsedGeometry {
  polygon: Coordinate[];
  boundaryResolutions: StateBoundaryResolution[];
  mode: "direct" | "state-boundary";
}

function normalizedText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function sameCoordinate(left: Coordinate | undefined, right: Coordinate | undefined): boolean {
  return Boolean(left && right && Math.abs(left[0] - right[0]) < 1e-10 && Math.abs(left[1] - right[1]) < 1e-10);
}

function appendUnique(target: Coordinate[], coordinates: Coordinate[]): void {
  for (const coordinate of coordinates) {
    if (!sameCoordinate(target.at(-1), coordinate)) target.push(coordinate);
  }
}

function coordinate(latitude: string, longitude: string): Coordinate {
  return [aviationCoordinateToDecimal(longitude), aviationCoordinateToDecimal(latitude)];
}

function slug(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

export function skSectorId(name: string): string {
  return `SK-${slug(name)}`;
}

function serviceFromUnit(value: string): string | null {
  const unit = normalizedText(value).toUpperCase();
  if (!unit) return null;
  if (/\bACC\b/.test(unit)) return "ACC";
  if (/\bAPP\b/.test(unit)) return "APP";
  if (/\bTWR\b/.test(unit)) return "TWR";
  if (/\bFIC\b/.test(unit)) return "FIS";
  return unit.slice(0, 80);
}

function callsignFromCell(value: string): string | null {
  const text = normalizedText(value);
  if (!text) return null;
  const beforeLanguages = text.split(/\bSK\s*,\s*EN\b/i)[0]?.trim() ?? text;
  const cleaned = beforeLanguages.replace(/\s+\d+\)\s*$/, "").trim();
  return cleaned ? cleaned.slice(0, 120) : null;
}

function frequencyList(value: string): number[] {
  const frequencies: number[] = [];
  const seen = new Set<string>();
  for (const match of value.matchAll(/\b(1(?:1[8-9]|2\d|3[0-6]))[,.](\d{3})\b/g)) {
    const frequency = Number(`${match[1]}.${match[2]}`);
    const key = frequency.toFixed(3);
    if (!isSupportedAtcFrequencyMhz(frequency) || seen.has(key)) continue;
    seen.add(key);
    frequencies.push(frequency);
  }
  return frequencies;
}

function parseAltitude(value: string): ImportAltitude | null {
  const normalized = normalizedText(value).toUpperCase();
  if (normalized === "UNL") return "UNL";
  if (normalized === "GND" || normalized === "SFC") return "SFC";
  const flightLevel = /^FL\s*(\d{1,3})$/.exec(normalized);
  if (flightLevel) return `FL${Number(flightLevel[1])}` as ImportAltitude;
  const feet = /^(\d[\d ]*)\s*FT\s*(AMSL|AGL)$/.exec(normalized);
  if (!feet) return null;
  const amount = Number(feet[1].replace(/\s+/g, ""));
  if (!Number.isFinite(amount) || amount < 0) return null;
  return feet[2] === "AGL" ? `${amount} AGL` as ImportAltitude : amount;
}

function verticalLimits(value: string): { upper: ImportAltitude; lower: ImportAltitude } | null {
  const classIndex = value.search(/Class of airspace\s*:/i);
  const candidate = classIndex >= 0 ? value.slice(0, classIndex) : value;
  const matches = [...candidate.matchAll(ALTITUDE_PATTERN)]
    .map((match) => parseAltitude(match[0]))
    .filter((item): item is ImportAltitude => item !== null);
  if (matches.length < 2) return null;
  return { upper: matches.at(-2)!, lower: matches.at(-1)! };
}

function concreteAirspaceName(firstCell: string): { name: string; firstCoordinateIndex: number } | null {
  COORDINATE_PAIR_PATTERN.lastIndex = 0;
  const first = COORDINATE_PAIR_PATTERN.exec(firstCell);
  if (!first || first.index <= 0) return null;
  const name = normalizedText(firstCell.slice(0, first.index));
  if (!name || !/\b(?:CTA|TMA|FIR|SECTOR)\b/i.test(name)) return null;
  return { name, firstCoordinateIndex: first.index };
}

function geometryText(firstCell: string, firstCoordinateIndex: number): string {
  const verticalIndex = firstCell.slice(firstCoordinateIndex).search(/(?:Vertical limits and class of airspace\s*:|(?:UNL|GND|SFC|FL\s*\d{1,3}|\d[\d ]*\s*ft\s*(?:AMSL|AGL))\s*\/)/i);
  return verticalIndex >= 0
    ? firstCell.slice(firstCoordinateIndex, firstCoordinateIndex + verticalIndex)
    : firstCell.slice(firstCoordinateIndex);
}

function parseGeometry(text: string, name: string, boundaryProvider?: StateBoundaryProvider): ParsedGeometry {
  if (/circular arc|\bCWA\b|\bCCA\b/i.test(text)) {
    throw new Error("circular arc without unambiguous direction is not imported");
  }
  COORDINATE_PAIR_PATTERN.lastIndex = 0;
  const matches = [...text.matchAll(COORDINATE_PAIR_PATTERN)];
  if (matches.length < 3) throw new Error("fewer than three published coordinate points");
  const points = matches.map((match) => coordinate(match[1], match[2]));
  const polygon: Coordinate[] = [points[0]];
  const boundaryResolutions: StateBoundaryResolution[] = [];
  let usedBoundary = false;

  for (let index = 1; index < points.length; index += 1) {
    const previousMatch = matches[index - 1];
    const currentMatch = matches[index];
    const between = text.slice((previousMatch.index ?? 0) + previousMatch[0].length, currentMatch.index ?? 0);
    if (/along state boundary/i.test(between)) {
      if (!boundaryProvider) throw new Error("state-boundary geometry requires an authoritative boundary provider");
      const resolution = boundaryProvider.getBoundarySegment({ start: points[index - 1], end: points[index], hint: name });
      boundaryResolutions.push(resolution);
      appendUnique(polygon, resolution.coordinates);
      usedBoundary = true;
    } else {
      appendUnique(polygon, [points[index]]);
    }
  }

  if (!sameCoordinate(polygon.at(-1), polygon[0])) polygon.push(polygon[0]);
  if (polygon.length < 4) throw new Error("polygon does not contain enough vertices");
  return { polygon, boundaryResolutions, mode: usedBoundary ? "state-boundary" : "direct" };
}

function alternateFrequencies(values: number[]): AtcImportFrequency[] {
  return values.slice(1).map((frequencyMhz) => ({ frequencyMhz }));
}

function rowToSector(cells: string[], options: ParseSkEaipOptions): { sector: AtcImportSector | null; diagnostic: SkEaipDiagnostic | null } {
  const firstCell = normalizedText(cells[0] ?? "");
  const concrete = concreteAirspaceName(firstCell);
  if (!concrete) return { sector: null, diagnostic: null };
  const limits = verticalLimits(firstCell);
  const frequencies = frequencyList(cells[3] ?? "");
  const name = concrete.name;
  if (!limits) {
    return { sector: null, diagnostic: { name, status: "skipped", reason: "vertical limits could not be parsed", geometry: "unsupported", boundaryResolutions: [] } };
  }
  if (!frequencies.length) {
    return { sector: null, diagnostic: { name, status: "skipped", reason: "no supported civil ATC VHF frequency in the published row", geometry: "unsupported", boundaryResolutions: [] } };
  }

  let geometry: ParsedGeometry;
  try {
    geometry = parseGeometry(geometryText(firstCell, concrete.firstCoordinateIndex), name, options.boundaryProvider);
  } catch (error) {
    return {
      sector: null,
      diagnostic: {
        name,
        status: "skipped",
        reason: error instanceof Error ? error.message : String(error),
        geometry: "unsupported",
        boundaryResolutions: [],
      },
    };
  }

  const unit = normalizedText(cells[1] ?? "");
  const callsign = callsignFromCell(cells[2] ?? "");
  const service = serviceFromUnit(unit);
  const sector: AtcImportSector = {
    id: skSectorId(name),
    name,
    atcCallsign: callsign,
    service,
    country: "SK",
    polygons: [geometry.polygon],
    lowerAltitude: limits.lower,
    upperAltitude: limits.upper,
    primaryFrequencyMhz: frequencies[0],
    alternateFrequencies: alternateFrequencies(frequencies),
    sourceReference: options.sourceReference,
    lastVerifiedAt: (options.verifiedAt ?? new Date()).toISOString(),
    validFrom: options.effectiveDate,
    validTo: null,
  };
  return {
    sector,
    diagnostic: { name, status: "accepted", reason: null, geometry: geometry.mode, boundaryResolutions: geometry.boundaryResolutions },
  };
}

export function parseSkEaipEnr21(html: string, options: ParseSkEaipOptions): SkEaipParseResult {
  if (!/^https:\/\/aim\.lps\.sk\/web\/eAIP_SR\//i.test(options.sourceReference)) {
    throw new Error("Refusing non-authoritative Slovak eAIP source reference");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.effectiveDate) || !Number.isFinite(Date.parse(`${options.effectiveDate}T00:00:00Z`))) {
    throw new Error("Invalid Slovak eAIP effective date");
  }
  const $ = load(html);
  const sectors: AtcImportSector[] = [];
  const diagnostics: SkEaipDiagnostic[] = [];
  const ids = new Set<string>();
  $("tr").each((_index, row) => {
    const cells = $(row).find("td").map((_cellIndex, cell) => normalizedText($(cell).text())).get();
    if (!cells.length) return;
    const parsed = rowToSector(cells, options);
    if (parsed.diagnostic) diagnostics.push(parsed.diagnostic);
    if (!parsed.sector) return;
    if (ids.has(parsed.sector.id)) {
      diagnostics.push({ name: parsed.sector.name, status: "skipped", reason: "duplicate stable sector id", geometry: "unsupported", boundaryResolutions: [] });
      return;
    }
    ids.add(parsed.sector.id);
    sectors.push(parsed.sector);
  });
  if (!diagnostics.length) throw new Error("Slovak eAIP ENR 2.1 contained no recognizable concrete ATC rows");
  return {
    effectiveDate: options.effectiveDate,
    diagnostics,
    document: {
      schemaVersion: 1,
      source: {
        name: SK_EAIP_SOURCE_NAME,
        reference: options.sourceReference,
        effectiveDate: options.effectiveDate,
        lastVerifiedAt: (options.verifiedAt ?? new Date()).toISOString(),
      },
      sectors,
      transmitters: [],
    },
  };
}

function airacDateAtOrBefore(now: Date): Date {
  const anchor = Date.parse(`${SK_EAIP_AIRAC_ANCHOR}T00:00:00Z`);
  const cycles = Math.floor((now.getTime() - anchor) / AIRAC_CYCLE_MS);
  return new Date(anchor + cycles * AIRAC_CYCLE_MS);
}

function directoryDate(date: Date): string {
  return `${String(date.getUTCDate()).padStart(2, "0")}${MONTHS[date.getUTCMonth()]}${date.getUTCFullYear()}`;
}

export function skEaipUrlCandidates(now = new Date()): string[] {
  const current = airacDateAtOrBefore(now);
  const candidates: string[] = [];
  for (let offset = 0; offset < 4; offset += 1) {
    const date = new Date(current.getTime() - offset * AIRAC_CYCLE_MS);
    const token = directoryDate(date);
    for (const suffix of ["", "_amdt"]) {
      candidates.push(`${SK_EAIP_BASE_URL}/AIP_SR_EFF_${token}${suffix}/html/LZ-ENR-2.1-en-SK.html`);
    }
  }
  return candidates;
}

export function skEaipEffectiveDateFromUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname.toLowerCase().replace(/\.$/, "") !== SK_EAIP_HOST) return null;
  const match = /\/AIP_SR_EFF_(\d{2})([A-Z]{3})(\d{4})(?:_amdt)?\//i.exec(url.pathname);
  if (!match) return null;
  const month = MONTHS.indexOf(match[2].toUpperCase() as (typeof MONTHS)[number]);
  if (month < 0) return null;
  const date = new Date(Date.UTC(Number(match[3]), month, Number(match[1])));
  if (date.getUTCDate() !== Number(match[1]) || date.getUTCMonth() !== month || date.getUTCFullYear() !== Number(match[3])) return null;
  return date.toISOString().slice(0, 10);
}

export async function fetchCurrentSkEaip(options: { now?: Date; fetchImpl?: typeof fetch } = {}): Promise<SkEaipSource> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const attempts: string[] = [];
  for (const candidate of skEaipUrlCandidates(options.now ?? new Date())) {
    const effectiveDate = skEaipEffectiveDateFromUrl(candidate);
    if (!effectiveDate) continue;
    let response: Response;
    try {
      response = await fetchImpl(candidate, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": getAirRadarUserAgent("Slovak-eAIP-sync"),
        },
      });
    } catch (error) {
      attempts.push(`${candidate}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (!response.ok) {
      attempts.push(`${candidate}: HTTP ${response.status}`);
      continue;
    }
    if (response.url) {
      const final = new URL(response.url);
      if (final.protocol !== "https:" || final.hostname.toLowerCase().replace(/\.$/, "") !== SK_EAIP_HOST) {
        throw new Error("Slovak eAIP redirected to a non-authoritative host");
      }
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_EAIP_BYTES) throw new Error("Slovak eAIP ENR 2.1 exceeds the safety size limit");
    const html = new TextDecoder().decode(bytes);
    if (!/ENR\s*2\.1/i.test(normalizedText(load(html)("body").text()))) {
      attempts.push(`${candidate}: response is not ENR 2.1`);
      continue;
    }
    return { enr21Html: html, enr21Url: candidate, effectiveDate };
  }
  throw new Error(`Unable to fetch current Slovak eAIP ENR 2.1 from official LPS AIM candidates: ${attempts.slice(0, 4).join("; ")}`);
}
