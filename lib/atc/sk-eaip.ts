import { load } from "cheerio";
import { aviationCoordinateToDecimal, densifyArc } from "./cz-geometry";
import type { StateBoundaryProvider, StateBoundaryResolution } from "./cz-boundary";
import type { AtcImportDocument, AtcImportFrequency, AtcImportSector, ImportAltitude } from "./import-format";
import { isSupportedAtcFrequencyMhz } from "./frequency-policy";
import type { Coordinate } from "./types";
import { getAirRadarUserAgent } from "@/lib/server/user-agent";

export const SK_EAIP_SOURCE_NAME = "Slovak eAIP";
export const SK_EAIP_BASE_URL = "https://aim.lps.sk/web/eAIP_SR";
export const SK_EAIP_HOST = "aim.lps.sk";
export const SK_EAIP_ENTRY_URL = "https://aim.lps.sk/web/eAIP_SR/";

const MAX_EAIP_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;
const EMERGENCY_FREQUENCY_MHZ = 121.5;
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"] as const;
const COORDINATE_PAIR_PATTERN = /(\d{6}(?:[.,]\d+)?[NS])\s*(\d{7}(?:[.,]\d+)?[EW])/gi;

export interface SkEaipSource {
  enr21Html: string;
  enr21Url: string;
  effectiveDate: string;
}

export interface SkEaipSectionSource extends SkEaipSource { section: "ENR 2.1" | "ENR 3.1" | "ENR 3.2"; }

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
  arcCenterProvider?: (reference: string) => Coordinate | null;
  nationalBoundaryProvider?: { getNationalPolygon(): Coordinate[] };
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

function arcLength(coordinates: Coordinate[]): number {
  const radians = (value: number) => value * Math.PI / 180;
  return coordinates.slice(1).reduce((sum, coordinate, index) => {
    const previous = coordinates[index];
    const dLat = radians(coordinate[1] - previous[1]);
    const dLon = radians(coordinate[0] - previous[0]);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(previous[1])) * Math.cos(radians(coordinate[1])) * Math.sin(dLon / 2) ** 2;
    return sum + 2 * 6371.0088 * Math.asin(Math.sqrt(Math.min(1, a)));
  }, 0);
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
    // 121.500 MHz is explicitly published as the emergency frequency in the
    // Slovak ENR 2.1 tables. It must not be presented as a sector working or
    // alternate channel by AirRadar.
    if (Math.abs(frequency - EMERGENCY_FREQUENCY_MHZ) < 0.0005) continue;
    if (!isSupportedAtcFrequencyMhz(frequency) || seen.has(key)) continue;
    seen.add(key);
    frequencies.push(frequency);
  }
  return frequencies;
}

function parseAltitude(value: string): ImportAltitude | null {
  const normalized = normalizedText(value).toUpperCase().replace(/\s+/g, " ").replace(/(\d)FT\b/, "$1 FT");
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
  const candidate = value;
  const matches = [...candidate.matchAll(/(?:UNL|GND|SFC|FL\s*\d{1,3}|\d[\d ]*\s*ft\s*(?:AMSL|AGL))/gi)]
    .map((match) => parseAltitude(match[0].trim()))
    .filter((item): item is ImportAltitude => item !== null);
  if (matches.length < 2) {
    const fallback = [...candidate.matchAll(/(UNL|GND|SFC|FL\s*\d{1,3}|\d[\d ]*\s*ft\s*(?:AMSL|AGL))/gi)].map((match) => {
      const raw = match[1].replace(/\s+/g, " ").trim().toUpperCase();
      const flight = /^FL\s*(\d{1,3})$/.exec(raw);
      if (flight) return `FL${Number(flight[1])}` as ImportAltitude;
      if (/^(?:GND|SFC)$/.test(raw)) return "SFC" as ImportAltitude;
      if (raw === "UNL") return "UNL" as ImportAltitude;
      const feet = /^(\d[\d ]*)\s*FT\s*(AMSL|AGL)$/.exec(raw);
      return feet ? (feet[2] === "AGL" ? `${Number(feet[1].replace(/\s/g, ""))} AGL` : Number(feet[1].replace(/\s/g, ""))) as ImportAltitude : null;
    }).filter((item): item is ImportAltitude => item !== null);
    if (fallback.length < 2) return null;
    return { upper: fallback.at(-2)!, lower: fallback.at(-1)! };
  }
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

function textualFirRow(firstCell: string): { name: string; firstCoordinateIndex: number } | null {
  return /^BRATISLAVA FIR\b/i.test(firstCell) ? { name: "BRATISLAVA FIR", firstCoordinateIndex: -1 } : null;
}

function geometryText(firstCell: string, firstCoordinateIndex: number): string {
  const verticalIndex = firstCell.slice(firstCoordinateIndex).search(/(?:Vertical limits and class of airspace\s*:|(?:UNL|GND|SFC|FL\s*\d{1,3}|\d[\d ]*\s*ft\s*(?:AMSL|AGL))\s*\/)/i);
  return verticalIndex >= 0
    ? firstCell.slice(firstCoordinateIndex, firstCoordinateIndex + verticalIndex)
    : firstCell.slice(firstCoordinateIndex);
}

function parseGeometry(text: string, name: string, boundaryProvider?: StateBoundaryProvider, arcCenterProvider?: ParseSkEaipOptions["arcCenterProvider"]): ParsedGeometry {
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
    const arc = /circular arc\s+([\d.,]+)\s*NM\s+around\s+(?:ARP\s+)?([A-Z0-9-]+)\s+to/i.exec(between);
    if (arc) {
      const center = arcCenterProvider?.(arc[2]) ?? null;
      if (!center) throw new Error(`circular arc center ${arc[2]} is not available from an authoritative source`);
      const radiusNm = Number(arc[1].replace(",", "."));
      const clockwise = densifyArc({ start: points[index - 1], end: points[index], center, radiusNm, direction: "CWA" });
      const counterClockwise = densifyArc({ start: points[index - 1], end: points[index], center, radiusNm, direction: "CCA" });
      const clockwiseLength = arcLength(clockwise);
      const counterClockwiseLength = arcLength(counterClockwise);
      if (Math.abs(clockwiseLength - counterClockwiseLength) < 0.001) throw new Error("circular arc direction is ambiguous");
      appendUnique(polygon, (clockwiseLength < counterClockwiseLength ? clockwise : counterClockwise).slice(1));
    } else if (/\bCWA\b|\bCCA\b/i.test(between)) {
      throw new Error("arc direction or center is not unambiguous");
    } else if (/along state boundary/i.test(between)) {
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
  const fir = !concrete ? textualFirRow(firstCell) : null;
  if (!concrete && !fir) return { sector: null, diagnostic: null };
  const name = (concrete ?? fir)!.name;
  // Some LPS versions place the vertical-limit paragraph in a rowspan
  // continuation cell. Parse the whole structural row as a fallback, while
  // keeping geometry anchored to the name/lateral-limits cell.
  const limits = verticalLimits(firstCell) ?? verticalLimits(cells.join(" "));
  const frequencies = frequencyList(cells[3] ?? "");
  if (!limits) {
    return { sector: null, diagnostic: { name, status: "skipped", reason: "vertical limits could not be parsed", geometry: "unsupported", boundaryResolutions: [] } };
  }

  let geometry: ParsedGeometry;
  try {
    if (fir) {
      const polygon = options.nationalBoundaryProvider?.getNationalPolygon();
      if (!polygon) throw new Error("BRATISLAVA FIR requires the official national-boundary geometry provider");
      geometry = { polygon, boundaryResolutions: [], mode: "state-boundary" };
    } else {
      geometry = parseGeometry(geometryText(firstCell, concrete!.firstCoordinateIndex), name, options.boundaryProvider, options.arcCenterProvider);
    }
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
    primaryFrequencyMhz: frequencies[0] ?? null,
    alternateFrequencies: alternateFrequencies(frequencies),
    airspaceType: /\bCTA\s+SECTOR\b/i.test(name) ? "CTA_SECTOR" : /\bFIR\b/i.test(name) ? "FIR" : /\bCTA\b/i.test(name) ? "CTA" : /\bTMA\b/i.test(name) ? "TMA" : /\bCTR\b/i.test(name) ? "CTR" : "OTHER",
    airspaceClass: /Class of airspace\s*:\s*([A-G])\b/i.exec(firstCell)?.[1]?.toUpperCase() ?? null,
    remarks: fir ? normalizedText(firstCell.replace(/^BRATISLAVA FIR\s*/i, "")) : normalizedText(cells[4] ?? "") || null,
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
  $("table tbody").each((_tableIndex, tbody) => {
    const rows = $(tbody).find("tr").toArray();
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      const cells = $(row).find("td").map((_cellIndex, cell) => normalizedText($(cell).text())).get();
      if (!cells.length) continue;
      // LPS uses rowspan for the name/geometry and remarks columns. Frequency
      // rows follow the first row and must be folded into the same observation.
      if (!concreteAirspaceName(cells[0] ?? "") && !textualFirRow(cells[0] ?? "")) continue;
      const merged = [...cells];
      const rowspan = Number($(row).find("td").first().attr("rowspan") ?? "1");
      const end = Number.isFinite(rowspan) && rowspan > 1 ? Math.min(rows.length, rowIndex + rowspan) : rowIndex + 1;
      for (let continuation = rowIndex + 1; continuation < end; continuation += 1) {
        const continuationCells = $(rows[continuation]).find("td").map((_cellIndex, cell) => normalizedText($(cell).text())).get();
        if (continuationCells.length >= 2) merged[3] = `${merged[3] ?? ""} ${continuationCells.at(-1) ?? ""}`;
      }
      const parsed = rowToSector(merged, options);
    if (parsed.diagnostic) diagnostics.push(parsed.diagnostic);
    if (!parsed.sector) continue;
    if (ids.has(parsed.sector.id)) {
      diagnostics.push({ name: parsed.sector.name, status: "skipped", reason: "duplicate stable sector id", geometry: "unsupported", boundaryResolutions: [] });
      continue;
    }
    ids.add(parsed.sector.id);
    sectors.push(parsed.sector);
    }
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

function directoryDate(date: Date): string {
  return `${String(date.getUTCDate()).padStart(2, "0")}${MONTHS[date.getUTCMonth()]}${date.getUTCFullYear()}`;
}

export function skEaipUrlCandidates(now = new Date()): string[] {
  const candidates: string[] = [];
  // The entry page is the authority. If the host does not expose a directory
  // listing, probe one bounded AIRAC-sized date window; this avoids a dated
  // production anchor while still finding an effective Thursday such as the
  // current 03SEP2026 publication.
  for (let offset = 0; offset < 28; offset += 1) {
    const date = new Date(now.getTime() - offset * 24 * 60 * 60_000);
    const token = directoryDate(date);
    for (const suffix of ["", "_amdt"]) {
      candidates.push(`${SK_EAIP_BASE_URL}/AIP_SR_EFF_${token}${suffix}/html/LZ-ENR-2.1-en-SK.html`);
    }
  }
  return candidates;
}

export function skEaipEffectiveUrlsFromMenu(html: string): string[] {
  const $ = load(html);
  const urls = $("a[href]").toArray().map((anchor) => {
    try { return new URL($(anchor).attr("href") ?? "", SK_EAIP_ENTRY_URL).toString(); } catch { return ""; }
  }).filter((url) => skEaipEffectiveDateFromUrl(url) !== null && /LZ-menu-en-SK\.html$/i.test(url));
  return [...new Set(urls)].sort((left, right) => (skEaipEffectiveDateFromUrl(right) ?? "").localeCompare(skEaipEffectiveDateFromUrl(left) ?? ""));
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
  const candidates = new Set<string>();
  try {
    const menuResponse = await fetchImpl(SK_EAIP_ENTRY_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { Accept: "text/html", "User-Agent": getAirRadarUserAgent("Slovak-eAIP-discovery") } });
    if (menuResponse.ok) for (const url of skEaipEffectiveUrlsFromMenu(await menuResponse.text())) candidates.add(url.replace(/LZ-menu-en-SK\.html$/i, "LZ-ENR-2.1-en-SK.html"));
  } catch { /* bounded dated fallback below */ }
  for (const candidate of skEaipUrlCandidates(options.now ?? new Date())) candidates.add(candidate);
  for (const candidate of candidates) {
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

/** Resolve ARP references from the same effective official eAIP publication. */
export async function fetchSkArpCenters(effectiveEnr21Url: string, fetchImpl: typeof fetch = fetch): Promise<Map<string, Coordinate>> {
  const base = effectiveEnr21Url.replace(/LZ-ENR-2\.1-en-SK\.html$/i, "");
  const centers = new Map<string, Coordinate>();
  for (const airport of ["LZIB", "LZPP"]) {
    const url = `${base}LZ-AD-2.${airport}-en-SK.html`;
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { Accept: "text/html", "User-Agent": getAirRadarUserAgent("Slovak-eAIP-arp") } });
    if (!response.ok) throw new Error(`Official ${airport} AD 2 page returned HTTP ${response.status}`);
    const body = normalizedText(load(await response.text())("body").text());
    const match = /ARP coordinates and site at AD\s+(\d{6}[NS])\s+(\d{7}[EW])/i.exec(body);
    if (!match) throw new Error(`Official ${airport} AD 2 page has no parseable ARP coordinates`);
    centers.set(airport, coordinate(match[1], match[2]));
  }
  return centers;
}
