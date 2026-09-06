export type ImportAltitude = number | "SFC" | "UNL" | `FL${number}`;

export interface AtcImportSource {
  name: string;
  reference: string;
  effectiveDate: string;
  lastVerifiedAt: string;
}

export interface AtcImportFrequency {
  frequencyMhz: number;
  label?: string | null;
}

export interface AtcImportSector {
  id: string;
  name: string;
  atcCallsign?: string | null;
  service?: string | null;
  country?: string | null;
  polygons: number[][][];
  lowerAltitude?: ImportAltitude | null;
  upperAltitude?: ImportAltitude | null;
  lowerAltitudeFt?: number | null;
  upperAltitudeFt?: number | null;
  primaryFrequencyMhz?: number | null;
  alternateFrequencies?: AtcImportFrequency[];
  sourceReference?: string;
  lastVerifiedAt?: string;
  validFrom?: string | null;
  validTo?: string | null;
}

export interface AtcImportTransmitter {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  service?: string | null;
  frequencyMhz: number;
  notes?: string | null;
  sourceReference?: string;
  lastVerifiedAt?: string;
  validFrom?: string | null;
  validTo?: string | null;
}

export interface AtcImportDocument {
  schemaVersion: 1;
  source: AtcImportSource;
  sectors: AtcImportSector[];
  transmitters: AtcImportTransmitter[];
}

export interface NormalizedAtcFrequency {
  frequencyMhz: number;
  label: string | null;
}

export interface NormalizedAtcSector {
  id: string;
  name: string;
  atcCallsign: string | null;
  service: string | null;
  country: string | null;
  polygons: number[][][];
  lowerAltitudeFt: number | null;
  upperAltitudeFt: number | null;
  primaryFrequencyMhz: number | null;
  alternateFrequencies: NormalizedAtcFrequency[];
  source: string;
  sourceReference: string;
  lastVerifiedAt: string;
  validFrom: string | null;
  validTo: string | null;
}

export interface NormalizedAtcTransmitter {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  service: string | null;
  frequencyMhz: number;
  notes: string | null;
  source: string;
  sourceReference: string;
  lastVerifiedAt: string;
  validFrom: string | null;
  validTo: string | null;
}

export interface NormalizedAtcImport {
  schemaVersion: 1;
  source: {
    name: string;
    reference: string;
    effectiveDate: string;
    lastVerifiedAt: string;
  };
  sectors: NormalizedAtcSector[];
  transmitters: NormalizedAtcTransmitter[];
}

export interface ExistingAtcSectorRecord {
  id: string;
  name: string;
  polygonJson: string;
  lowerAltitudeFt: number | null;
  upperAltitudeFt: number | null;
  atcCallsign: string | null;
  service: string | null;
  primaryFrequencyMhz: number | null;
  alternateFrequenciesJson: string | null;
  country: string | null;
  source: string;
  sourceReference: string;
  validFrom: unknown;
  validTo: unknown;
  lastVerifiedAt: unknown;
}

export interface ExistingAtcTransmitterRecord {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  service: string | null;
  frequencyMhz: number;
  notes: string | null;
  source: string;
  sourceReference: string;
  validFrom: unknown;
  validTo: unknown;
  lastVerifiedAt: unknown;
}

export interface AtcImportPlan {
  sectors: { added: string[]; updated: string[]; unchanged: string[]; obsolete: string[] };
  transmitters: { added: string[]; updated: string[]; unchanged: string[]; obsolete: string[] };
}

export class AtcImportValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`ATC import validation failed:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
    this.name = "AtcImportValidationError";
  }
}

function comparableDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === "string" ? value : String(value);
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : text;
}

function parsedJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameSector(row: ExistingAtcSectorRecord, sector: NormalizedAtcSector): boolean {
  return row.name === sector.name
    && sameJson(parsedJson(row.polygonJson), sector.polygons)
    && row.lowerAltitudeFt === sector.lowerAltitudeFt
    && row.upperAltitudeFt === sector.upperAltitudeFt
    && row.atcCallsign === sector.atcCallsign
    && row.service === sector.service
    && row.primaryFrequencyMhz === sector.primaryFrequencyMhz
    && sameJson(parsedJson(row.alternateFrequenciesJson), sector.alternateFrequencies)
    && row.country === sector.country
    && row.source === sector.source
    && row.sourceReference === sector.sourceReference
    && comparableDate(row.validFrom) === sector.validFrom
    && comparableDate(row.validTo) === sector.validTo
    && comparableDate(row.lastVerifiedAt) === sector.lastVerifiedAt;
}

function sameTransmitter(row: ExistingAtcTransmitterRecord, transmitter: NormalizedAtcTransmitter): boolean {
  return row.name === transmitter.name
    && row.latitude === transmitter.latitude
    && row.longitude === transmitter.longitude
    && row.service === transmitter.service
    && row.frequencyMhz === transmitter.frequencyMhz
    && row.notes === transmitter.notes
    && row.source === transmitter.source
    && row.sourceReference === transmitter.sourceReference
    && comparableDate(row.validFrom) === transmitter.validFrom
    && comparableDate(row.validTo) === transmitter.validTo
    && comparableDate(row.lastVerifiedAt) === transmitter.lastVerifiedAt;
}

function importActions<T extends { id: string }, R extends { id: string; source: string }>(
  incoming: T[],
  existing: R[],
  same: (row: R, item: T) => boolean,
  source: string,
): { added: string[]; updated: string[]; unchanged: string[]; obsolete: string[] } {
  const existingById = new Map(existing.map((row) => [row.id, row]));
  const incomingIds = new Set(incoming.map((item) => item.id));
  const actions = { added: [], updated: [], unchanged: [], obsolete: [] } as { added: string[]; updated: string[]; unchanged: string[]; obsolete: string[] };
  for (const item of incoming) {
    const row = existingById.get(item.id);
    if (!row) actions.added.push(item.id);
    else if (same(row, item)) actions.unchanged.push(item.id);
    else actions.updated.push(item.id);
  }
  actions.obsolete = existing.filter((row) => row.source === source && !incomingIds.has(row.id)).map((row) => row.id).sort();
  return actions;
}

export function planAtcImport(
  dataset: NormalizedAtcImport,
  existing: { sectors: ExistingAtcSectorRecord[]; transmitters: ExistingAtcTransmitterRecord[] },
): AtcImportPlan {
  return {
    sectors: importActions(dataset.sectors, existing.sectors, sameSector, dataset.source.name),
    transmitters: importActions(dataset.transmitters, existing.transmitters, sameTransmitter, dataset.source.name),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown, path: string, issues: string[], required = false): string | null {
  if (typeof value !== "string" || value.trim() === "") {
    if (required) issues.push(`${path} must be a non-empty string`);
    return null;
  }
  return value.trim();
}

function optionalString(value: unknown, path: string, issues: string[]): string | null {
  if (value === undefined || value === null) return null;
  return stringValue(value, path, issues);
}

function finiteNumber(value: unknown, path: string, issues: string[]): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issues.push(`${path} must be a finite number`);
    return null;
  }
  return value;
}

function coordinate(value: unknown, path: string, issues: string[]): [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2) {
    issues.push(`${path} must be [longitude, latitude]`);
    return null;
  }
  const longitude = finiteNumber(value[0], `${path}[0]`, issues);
  const latitude = finiteNumber(value[1], `${path}[1]`, issues);
  if (longitude === null || latitude === null) return null;
  if (longitude < -180 || longitude > 180) issues.push(`${path}[0] longitude must be between -180 and 180`);
  if (latitude < -90 || latitude > 90) issues.push(`${path}[1] latitude must be between -90 and 90`);
  return [longitude, latitude];
}

function parseDate(value: unknown, path: string, issues: string[], endOfDay = false): string | null {
  const text = stringValue(value, path, issues, true);
  if (!text) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text);
  const parsed = Date.parse(dateOnly && endOfDay ? `${text}T23:59:59.999Z` : dateOnly ? `${text}T00:00:00.000Z` : text);
  if (!Number.isFinite(parsed)) {
    issues.push(`${path} must be an ISO date or timestamp`);
    return null;
  }
  return new Date(parsed).toISOString();
}

function optionalDate(value: unknown, path: string, issues: string[], endOfDay = false): string | null {
  if (value === undefined || value === null) return null;
  return parseDate(value, path, issues, endOfDay);
}

function altitude(value: unknown, path: string, issues: string[], boundary: "lower" | "upper"): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0 || value > 100000) issues.push(`${path} must be an integer between 0 and 100000 ft`);
    return Number.isInteger(value) && value >= 0 && value <= 100000 ? value : null;
  }
  if (typeof value !== "string") {
    issues.push(`${path} must be a number, SFC, FLxxx or UNL`);
    return null;
  }
  const normalized = value.trim().toUpperCase();
  if (normalized === "SFC") {
    if (boundary === "upper") issues.push(`${path} cannot use SFC as an upper limit`);
    return boundary === "lower" ? 0 : null;
  }
  if (normalized === "UNL") {
    if (boundary === "lower") issues.push(`${path} cannot use UNL as a lower limit`);
    return null;
  }
  const flightLevel = /^FL\s*(\d{1,3})$/.exec(normalized);
  if (!flightLevel) {
    issues.push(`${path} must be a number, SFC, FLxxx or UNL`);
    return null;
  }
  const feet = Number(flightLevel[1]) * 100;
  if (feet > 100000) issues.push(`${path} exceeds the supported altitude limit`);
  return feet <= 100000 ? feet : null;
}

function frequency(value: unknown, path: string, issues: string[]): number | null {
  const result = finiteNumber(value, path, issues);
  if (result === null) return null;
  if (result < 108 || result > 137) issues.push(`${path} must be between 108.000 and 137.000 MHz`);
  if (Math.abs(result * 1000 - Math.round(result * 1000)) > 1e-7) issues.push(`${path} must have at most three decimal places`);
  return result >= 108 && result <= 137 && Math.abs(result * 1000 - Math.round(result * 1000)) <= 1e-7 ? result : null;
}

function textOrNull(value: unknown, path: string, issues: string[]): string | null {
  return value === undefined || value === null ? null : optionalString(value, path, issues);
}

function polygons(value: unknown, path: string, issues: string[]): number[][][] {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(`${path} must contain at least one polygon ring`);
    return [];
  }
  return value.flatMap((rawRing, ringIndex) => {
    if (!Array.isArray(rawRing) || rawRing.length < 3) {
      issues.push(`${path}[${ringIndex}] must contain at least three coordinates`);
      return [];
    }
    const ring = rawRing.flatMap((rawCoordinate, coordinateIndex) => {
      const parsed = coordinate(rawCoordinate, `${path}[${ringIndex}][${coordinateIndex}]`, issues);
      return parsed ? [parsed] : [];
    });
    if (ring.length < 3) return [];
    let area = 0;
    for (let index = 0; index < ring.length; index += 1) {
      const current = ring[index];
      const next = ring[(index + 1) % ring.length];
      area += current[0] * next[1] - next[0] * current[1];
    }
    if (Math.abs(area) < 1e-12) issues.push(`${path}[${ringIndex}] must enclose a non-zero area`);
    return [ring];
  });
}

function resolveAltitude(raw: Record<string, unknown>, key: "lower" | "upper", path: string, issues: string[]): number | null {
  const semanticKey = `${key}Altitude`;
  const legacyKey = `${key}AltitudeFt`;
  if (raw[semanticKey] !== undefined && raw[legacyKey] !== undefined) {
    issues.push(`${path} must use only ${semanticKey} or ${legacyKey}`);
    return null;
  }
  return altitude(raw[semanticKey] ?? raw[legacyKey], `${path}.${raw[semanticKey] !== undefined ? semanticKey : legacyKey}`, issues, key);
}

function frequencies(raw: Record<string, unknown>, path: string, issues: string[]): { primary: number | null; alternates: NormalizedAtcFrequency[] } {
  const primary = raw.primaryFrequencyMhz === undefined || raw.primaryFrequencyMhz === null
    ? null
    : frequency(raw.primaryFrequencyMhz, `${path}.primaryFrequencyMhz`, issues);
  const rawAlternates = raw.alternateFrequencies ?? [];
  if (!Array.isArray(rawAlternates)) {
    issues.push(`${path}.alternateFrequencies must be an array`);
    return { primary, alternates: [] };
  }
  const seen = new Set<number>(primary === null ? [] : [primary]);
  const alternates = rawAlternates.flatMap((rawFrequency, index) => {
    if (!isRecord(rawFrequency)) {
      issues.push(`${path}.alternateFrequencies[${index}] must be an object`);
      return [];
    }
    const value = frequency(rawFrequency.frequencyMhz, `${path}.alternateFrequencies[${index}].frequencyMhz`, issues);
    const label = textOrNull(rawFrequency.label, `${path}.alternateFrequencies[${index}].label`, issues);
    if (value === null || seen.has(value)) {
      if (value !== null) issues.push(`${path}.alternateFrequencies[${index}] duplicates another frequency`);
      return [];
    }
    seen.add(value);
    return [{ frequencyMhz: value, label }];
  });
  return { primary, alternates };
}

function idSet(items: Array<{ id: string }>, path: string, issues: string[]): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) issues.push(`${path} contains duplicate stable id ${item.id}`);
    seen.add(item.id);
  }
}

function validRange(from: string | null, to: string | null, path: string, issues: string[]): void {
  if (from && to && Date.parse(from) > Date.parse(to)) issues.push(`${path}.validFrom must be before or equal to validTo`);
}

export function validateAtcImportDocument(value: unknown): NormalizedAtcImport {
  const issues: string[] = [];
  if (!isRecord(value)) throw new AtcImportValidationError(["document must be an object"]);
  if (value.schemaVersion !== 1) issues.push("schemaVersion must be 1");
  if (!isRecord(value.source)) issues.push("source must be an object");
  if (!Array.isArray(value.sectors)) issues.push("sectors must be an array");
  if (!Array.isArray(value.transmitters)) issues.push("transmitters must be an array");
  const rawSource = isRecord(value.source) ? value.source : {};
  const sourceName = stringValue(rawSource.name, "source.name", issues, true) ?? "";
  const sourceReference = stringValue(rawSource.reference, "source.reference", issues, true) ?? "";
  const effectiveDate = parseDate(rawSource.effectiveDate, "source.effectiveDate", issues) ?? "";
  const lastVerifiedAt = parseDate(rawSource.lastVerifiedAt, "source.lastVerifiedAt", issues) ?? "";
  const normalizedSectors: NormalizedAtcSector[] = [];
  const normalizedTransmitters: NormalizedAtcTransmitter[] = [];

  if (Array.isArray(value.sectors)) {
    value.sectors.forEach((rawSector, index) => {
      const path = `sectors[${index}]`;
      if (!isRecord(rawSector)) {
        issues.push(`${path} must be an object`);
        return;
      }
      const id = stringValue(rawSector.id, `${path}.id`, issues, true) ?? "";
      const name = stringValue(rawSector.name, `${path}.name`, issues, true) ?? "";
      const ringData = polygons(rawSector.polygons, `${path}.polygons`, issues);
      const lowerAltitudeFt = resolveAltitude(rawSector, "lower", path, issues);
      const upperAltitudeFt = resolveAltitude(rawSector, "upper", path, issues);
      if (lowerAltitudeFt !== null && upperAltitudeFt !== null && lowerAltitudeFt > upperAltitudeFt) issues.push(`${path} lower altitude must not exceed upper altitude`);
      const parsedFrequencies = frequencies(rawSector, path, issues);
      const validFrom = optionalDate(rawSector.validFrom ?? effectiveDate, `${path}.validFrom`, issues);
      const validTo = optionalDate(rawSector.validTo, `${path}.validTo`, issues, true);
      validRange(validFrom, validTo, path, issues);
      const rowLastVerifiedAt = rawSector.lastVerifiedAt === undefined
        ? lastVerifiedAt
        : parseDate(rawSector.lastVerifiedAt, `${path}.lastVerifiedAt`, issues) ?? "";
      const rowReference = rawSector.sourceReference === undefined
        ? sourceReference
        : stringValue(rawSector.sourceReference, `${path}.sourceReference`, issues, true) ?? "";
      normalizedSectors.push({
        id,
        name,
        atcCallsign: textOrNull(rawSector.atcCallsign, `${path}.atcCallsign`, issues),
        service: textOrNull(rawSector.service, `${path}.service`, issues),
        country: textOrNull(rawSector.country, `${path}.country`, issues),
        polygons: ringData,
        lowerAltitudeFt,
        upperAltitudeFt,
        primaryFrequencyMhz: parsedFrequencies.primary,
        alternateFrequencies: parsedFrequencies.alternates,
        source: sourceName,
        sourceReference: rowReference,
        lastVerifiedAt: rowLastVerifiedAt,
        validFrom,
        validTo,
      });
    });
  }

  if (Array.isArray(value.transmitters)) {
    value.transmitters.forEach((rawTransmitter, index) => {
      const path = `transmitters[${index}]`;
      if (!isRecord(rawTransmitter)) {
        issues.push(`${path} must be an object`);
        return;
      }
      const id = stringValue(rawTransmitter.id, `${path}.id`, issues, true) ?? "";
      const name = stringValue(rawTransmitter.name, `${path}.name`, issues, true) ?? "";
      const latitude = finiteNumber(rawTransmitter.latitude, `${path}.latitude`, issues);
      const longitude = finiteNumber(rawTransmitter.longitude, `${path}.longitude`, issues);
      if (latitude !== null && (latitude < -90 || latitude > 90)) issues.push(`${path}.latitude must be between -90 and 90`);
      if (longitude !== null && (longitude < -180 || longitude > 180)) issues.push(`${path}.longitude must be between -180 and 180`);
      const frequencyMhz = frequency(rawTransmitter.frequencyMhz, `${path}.frequencyMhz`, issues);
      const validFrom = optionalDate(rawTransmitter.validFrom ?? effectiveDate, `${path}.validFrom`, issues);
      const validTo = optionalDate(rawTransmitter.validTo, `${path}.validTo`, issues, true);
      validRange(validFrom, validTo, path, issues);
      const rowLastVerifiedAt = rawTransmitter.lastVerifiedAt === undefined
        ? lastVerifiedAt
        : parseDate(rawTransmitter.lastVerifiedAt, `${path}.lastVerifiedAt`, issues) ?? "";
      const rowReference = rawTransmitter.sourceReference === undefined
        ? sourceReference
        : stringValue(rawTransmitter.sourceReference, `${path}.sourceReference`, issues, true) ?? "";
      if (latitude === null || longitude === null || frequencyMhz === null) return;
      normalizedTransmitters.push({
        id,
        name,
        latitude,
        longitude,
        service: textOrNull(rawTransmitter.service, `${path}.service`, issues),
        frequencyMhz,
        notes: textOrNull(rawTransmitter.notes, `${path}.notes`, issues),
        source: sourceName,
        sourceReference: rowReference,
        lastVerifiedAt: rowLastVerifiedAt,
        validFrom,
        validTo,
      });
    });
  }

  idSet(normalizedSectors, "sectors", issues);
  idSet(normalizedTransmitters, "transmitters", issues);
  if (issues.length) throw new AtcImportValidationError(issues);
  return {
    schemaVersion: 1,
    source: { name: sourceName, reference: sourceReference, effectiveDate, lastVerifiedAt },
    sectors: normalizedSectors,
    transmitters: normalizedTransmitters,
  };
}
