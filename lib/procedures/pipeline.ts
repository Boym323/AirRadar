import { load, type Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import type {
  Procedure,
  ProcedureDiscontinuity,
  ProcedureGeometry,
  ProcedureLeg,
  ProcedureLegType,
  ProcedurePoint,
  ProcedurePointKind,
  ProcedureRunwayApplicability,
  ProcedureSource,
  ProcedureType,
  RouteCoordinate,
} from "@/lib/route-intelligence/contracts";

export const PROCEDURE_DATASET_SCHEMA_VERSION = 1;

export interface ProcedureDatasetDocument {
  schemaVersion: number;
  source: ProcedureSource;
  procedures: Procedure[];
  counts: { procedures: number; legs: number; points: number; discontinuities: number };
}

export interface ProcedureParseOptions {
  airportIcao: string;
  source: ProcedureSource;
}

export class ProcedureValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Procedure dataset validation failed:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
    this.name = "ProcedureValidationError";
  }
}

export class ProcedureParseError extends Error {
  constructor(readonly issues: string[]) {
    super(`Official procedure source parse failed:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
    this.name = "ProcedureParseError";
  }
}

const ICAO = /^[A-Z]{4}$/;
const RUNWAY = /^\d{2}[LRC]?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const POINT_KINDS = new Set<ProcedurePointKind>(["FIX", "NAVAID", "AIRPORT", "RUNWAY", "UNKNOWN"]);
const LEG_TYPES = new Set<ProcedureLegType>(["DIRECT", "COURSE_TO_FIX", "TRACK", "ARC", "HOLD", "DISCONTINUITY", "UNKNOWN"]);

function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object"; }
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function validDate(value: unknown): value is string { return typeof value === "string" && DATE.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)); }
function validTimestamp(value: unknown): value is string { return typeof value === "string" && ISO_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value)); }
function validCoordinate(value: unknown): value is RouteCoordinate {
  return record(value) && finite(value.lat) && value.lat >= -90 && value.lat <= 90 && finite(value.lon) && value.lon >= -180 && value.lon <= 180;
}

function validateSource(value: unknown, path: string, issues: string[]): value is ProcedureSource {
  if (!record(value)) { issues.push(`${path} must be an object`); return false; }
  if (!(value.countryCode === null || (typeof value.countryCode === "string" && /^[A-Z]{2}$/.test(value.countryCode)))) issues.push(`${path}.countryCode is invalid`);
  if (!text(value.provider)) issues.push(`${path}.provider is required`);
  if (!text(value.reference)) issues.push(`${path}.reference is required`);
  if (!validDate(value.effectiveDate)) issues.push(`${path}.effectiveDate is required and must be YYYY-MM-DD`);
  if (!(value.airacCycle === null || text(value.airacCycle))) issues.push(`${path}.airacCycle is invalid`);
  if (!(value.amendment === null || text(value.amendment))) issues.push(`${path}.amendment is invalid`);
  if (!(value.retrievedAt === null || validTimestamp(value.retrievedAt))) issues.push(`${path}.retrievedAt is invalid`);
  return issues.length === 0;
}

function validatePoint(value: unknown, path: string, issues: string[]): value is ProcedurePoint {
  if (!record(value)) { issues.push(`${path} must be an object`); return false; }
  if (!text(value.id)) issues.push(`${path}.id is required`);
  if (!text(value.name)) issues.push(`${path}.name is required`);
  if (!POINT_KINDS.has(value.kind as ProcedurePointKind)) issues.push(`${path}.kind is invalid`);
  if (!(value.coordinates === null || validCoordinate(value.coordinates))) issues.push(`${path}.coordinates is invalid`);
  if (!(value.sourceReference === null || text(value.sourceReference))) issues.push(`${path}.sourceReference is invalid`);
  return true;
}

function validateGeometry(value: unknown, path: string, issues: string[]): value is ProcedureGeometry {
  if (!record(value)) { issues.push(`${path} must be an object`); return false; }
  if (!(value.type === "LINE" || value.type === "ARC" || value.type === "HOLD" || value.type === "UNKNOWN")) issues.push(`${path}.type is invalid`);
  if (!Array.isArray(value.coordinates) || !value.coordinates.every(validCoordinate)) issues.push(`${path}.coordinates is invalid`);
  if (!(value.center === null || validCoordinate(value.center))) issues.push(`${path}.center is invalid`);
  if (!(value.radiusNm === null || (finite(value.radiusNm) && value.radiusNm > 0 && value.radiusNm <= 1000))) issues.push(`${path}.radiusNm is invalid`);
  if (value.type === "LINE" && Array.isArray(value.coordinates) && value.coordinates.length < 2) issues.push(`${path}.LINE requires two coordinates`);
  return true;
}

function validateRunway(value: unknown, path: string, issues: string[]): value is ProcedureRunwayApplicability {
  if (!record(value)) { issues.push(`${path} must be an object`); return false; }
  if (!(value.kind === "ALL" || value.kind === "INCLUDE" || value.kind === "EXCLUDE" || value.kind === "UNKNOWN")) issues.push(`${path}.kind is invalid`);
  if (!Array.isArray(value.runwayDesignators) || !value.runwayDesignators.every((item) => typeof item === "string" && RUNWAY.test(item))) issues.push(`${path}.runwayDesignators is invalid`);
  if ((value.kind === "ALL" || value.kind === "UNKNOWN") && Array.isArray(value.runwayDesignators) && value.runwayDesignators.length > 0) issues.push(`${path} cannot list runways for ${value.kind}`);
  if ((value.kind === "INCLUDE" || value.kind === "EXCLUDE") && Array.isArray(value.runwayDesignators) && value.runwayDesignators.length === 0) issues.push(`${path} must list a runway for ${value.kind}`);
  return true;
}

function validateLeg(value: unknown, path: string, points: Map<string, ProcedurePoint>, sequences: Set<number>, issues: string[]): value is ProcedureLeg {
  if (!record(value)) { issues.push(`${path} must be an object`); return false; }
  if (!Number.isInteger(value.sequence) || (value.sequence as number) < 1 || sequences.has(value.sequence as number)) issues.push(`${path}.sequence is duplicated or invalid`);
  else sequences.add(value.sequence as number);
  if (!LEG_TYPES.has(value.type as ProcedureLegType)) issues.push(`${path}.type is invalid`);
  for (const side of ["from", "to"] as const) {
    const pointValue = value[side];
    if (!(pointValue === null || validatePoint(pointValue, `${path}.${side}`, issues))) continue;
    if (pointValue !== null && !points.has(pointValue.id as string)) issues.push(`${path}.${side} references a dangling point ${String(pointValue.id)}`);
  }
  if (!(value.geometry === null || validateGeometry(value.geometry, `${path}.geometry`, issues))) { /* issue recorded */ }
  if (!(value.courseDeg === null || (finite(value.courseDeg) && value.courseDeg >= 0 && value.courseDeg < 360))) issues.push(`${path}.courseDeg is invalid`);
  if (!(value.sourceReference === null || text(value.sourceReference))) issues.push(`${path}.sourceReference is invalid`);
  if (value.type === "DISCONTINUITY" && (value.from !== null || value.to !== null || value.geometry !== null)) issues.push(`${path} discontinuity must not invent geometry`);
  return true;
}

function validateDiscontinuity(value: unknown, path: string, pointIds: Set<string>, legSequences: Set<number>, sequences: Set<number>, issues: string[]): value is ProcedureDiscontinuity {
  if (!record(value)) { issues.push(`${path} must be an object`); return false; }
  if (!Number.isInteger(value.sequence) || (value.sequence as number) < 1 || sequences.has(value.sequence as number)) issues.push(`${path}.sequence is duplicated or invalid`);
  else sequences.add(value.sequence as number);
  for (const side of ["afterLegSequence", "beforeLegSequence"] as const) if (!(value[side] === null || (Number.isInteger(value[side]) && legSequences.has(value[side] as number)))) issues.push(`${path}.${side} is a dangling reference`);
  for (const side of ["afterPointId", "beforePointId"] as const) if (!(value[side] === null || (text(value[side]) && pointIds.has(value[side] as string)))) issues.push(`${path}.${side} is a dangling reference`);
  if (value.afterLegSequence === null && value.beforeLegSequence === null && value.afterPointId === null && value.beforePointId === null) issues.push(`${path} must identify one side of the discontinuity`);
  if (!(value.reason === null || typeof value.reason === "string")) issues.push(`${path}.reason is invalid`);
  if (!(value.sourceReference === null || text(value.sourceReference))) issues.push(`${path}.sourceReference is invalid`);
  return true;
}

export function validateProcedureDataset(value: unknown): ProcedureDatasetDocument {
  const issues: string[] = [];
  if (!record(value) || value.schemaVersion !== PROCEDURE_DATASET_SCHEMA_VERSION || !record(value.source) || !Array.isArray(value.procedures) || !record(value.counts)) {
    throw new ProcedureValidationError(["schemaVersion, source, procedures, and counts are required"]);
  }
  const dataset = value as { schemaVersion: number; source: unknown; procedures: unknown[]; counts: Record<string, unknown> };
  validateSource(dataset.source, "source", issues);
  const procedureIds = new Set<string>();
  for (const [index, procedure] of dataset.procedures.entries()) {
    const prefix = `procedures[${index}]`;
    if (!record(procedure)) { issues.push(`${prefix} must be an object`); continue; }
    const rawProcedure = procedure as Record<string, unknown>;
    const legs = Array.isArray(rawProcedure.legs) ? rawProcedure.legs : [];
    const discontinuities = Array.isArray(rawProcedure.discontinuities) ? rawProcedure.discontinuities : [];
    if (!text(rawProcedure.id) || procedureIds.has(rawProcedure.id as string)) issues.push(`${prefix}.id is missing or duplicated`); else procedureIds.add(rawProcedure.id as string);
    if (!ICAO.test(String(rawProcedure.airportIcao))) issues.push(`${prefix}.airportIcao is invalid`);
    if (!(rawProcedure.type === "SID" || rawProcedure.type === "STAR")) issues.push(`${prefix}.type is invalid`);
    if (!text(rawProcedure.designator)) issues.push(`${prefix}.designator is required`);
    if (!(rawProcedure.transition === null || text(rawProcedure.transition))) issues.push(`${prefix}.transition is invalid`);
    validateRunway(rawProcedure.runwayApplicability, `${prefix}.runwayApplicability`, issues);
    if (!Array.isArray(rawProcedure.legs)) issues.push(`${prefix}.legs must be an array`);
    if (!Array.isArray(rawProcedure.discontinuities)) issues.push(`${prefix}.discontinuities must be an array`);
    const points = new Map<string, ProcedurePoint>();
    for (const leg of legs) for (const side of ["from", "to"] as const) {
      const pointValue = record(leg) ? leg[side] : null;
      if (pointValue !== null && validatePoint(pointValue, `${prefix}.legs.${side}`, issues)) {
        const existing = points.get(pointValue.id as string);
        if (existing && JSON.stringify(existing) !== JSON.stringify(pointValue)) issues.push(`${prefix} has conflicting point ${String(pointValue.id)}`);
        else points.set(pointValue.id as string, pointValue);
      }
    }
    const legSequences = new Set<number>();
    for (const [legIndex, leg] of legs.entries()) validateLeg(leg, `${prefix}.legs[${legIndex}]`, points, legSequences, issues);
    const discontinuitySequences = new Set<number>();
    for (const [discontinuityIndex, discontinuity] of discontinuities.entries()) validateDiscontinuity(discontinuity, `${prefix}.discontinuities[${discontinuityIndex}]`, new Set(points.keys()), legSequences, discontinuitySequences, issues);
    const orderedLegs = legs.filter(record).map((leg) => leg.sequence as number);
    if (orderedLegs.some((sequence, index) => index > 0 && sequence <= orderedLegs[index - 1])) issues.push(`${prefix}.legs must be ordered by sequence`);
    if (!(rawProcedure.remarks === undefined || rawProcedure.remarks === null || typeof rawProcedure.remarks === "string")) issues.push(`${prefix}.remarks is invalid`);
  }
  if (dataset.counts.procedures !== dataset.procedures.length) issues.push("counts.procedures does not match procedures");
  const pointCount = dataset.procedures.reduce<number>((sum, procedure) => sum + ((procedure as unknown as Procedure).legs ?? []).flatMap((leg) => [leg.from, leg.to]).filter(Boolean).length, 0);
  const legCount = dataset.procedures.reduce<number>((sum, procedure) => sum + ((procedure as unknown as Procedure).legs ?? []).length, 0);
  const discontinuityCount = dataset.procedures.reduce<number>((sum, procedure) => sum + ((procedure as unknown as Procedure).discontinuities ?? []).length, 0);
  if (dataset.counts.legs !== legCount || dataset.counts.points !== pointCount || dataset.counts.discontinuities !== discontinuityCount) issues.push("dataset counts do not match content");
  if (issues.length) throw new ProcedureValidationError(issues);
  return value as unknown as ProcedureDatasetDocument;
}

function parseJsonSource(raw: string): Procedure[] | null {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!record(value) || !Array.isArray(value.procedures)) return null;
  return value.procedures as Procedure[];
}

function attr(element: Cheerio<AnyNode> | null, name: string): string | null {
  return element?.attr(`data-${name}`)?.trim() || null;
}

function coordinateFromAttrs(element: Cheerio<AnyNode> | null): RouteCoordinate | null {
  const latitude = attr(element, "lat");
  const longitude = attr(element, "lon");
  if (latitude === null || longitude === null) return null;
  const lat = Number(latitude);
  const lon = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

function parseStructuredHtml(raw: string, options: ProcedureParseOptions): Procedure[] {
  const $ = load(raw);
  const groups = new Map<string, { type: ProcedureType; designator: string; transition: string | null; runway: ProcedureRunwayApplicability; rows: ReturnType<typeof $>[] }>();
  $("[data-procedure-type][data-procedure-designator]").each((_index, node) => {
    const row = $(node);
    const type = attr(row, "procedure-type")?.toUpperCase();
    const designator = attr(row, "procedure-designator")?.toUpperCase();
    if (type !== "SID" && type !== "STAR" || !designator) return;
    const runwayValues = (attr(row, "runways") ?? "").split(/[ ,]+/).filter(Boolean).map((runway) => runway.toUpperCase());
    const key = `${type}:${designator}:${attr(row, "transition")?.toUpperCase() ?? ""}:${runwayValues.join(",")}`;
    const existing = groups.get(key) ?? { type, designator, transition: attr(row, "transition")?.toUpperCase() ?? null, runway: runwayValues.length ? { kind: "INCLUDE" as const, runwayDesignators: runwayValues } : { kind: "UNKNOWN" as const, runwayDesignators: [] }, rows: [] };
    existing.rows.push(row);
    groups.set(key, existing);
  });
  return [...groups.values()].map((group) => {
    const points = new Map<string, ProcedurePoint>();
    const legs: ProcedureLeg[] = [];
    const discontinuities: ProcedureDiscontinuity[] = [];
    for (const row of group.rows) {
      const sequence = Number(attr(row, "leg-sequence"));
      const isDiscontinuity = attr(row, "discontinuity") === "true" || attr(row, "leg-type")?.toUpperCase() === "DISCONTINUITY";
      const point = (side: "from" | "to"): ProcedurePoint | null => {
        const id = attr(row, `${side}-point-id`);
        if (!id) return null;
        const existing = points.get(id);
        if (existing) return existing;
        const element = row.find(`[data-point-id="${id}"]`).first();
        const result: ProcedurePoint = { id, name: (attr(element, "point-name") ?? element.text().trim()) || id, kind: (attr(element, "point-kind")?.toUpperCase() as ProcedurePointKind) || "UNKNOWN", coordinates: coordinateFromAttrs(element), sourceReference: attr(element, "source-reference") };
        points.set(id, result);
        return result;
      };
      if (!Number.isInteger(sequence) || sequence < 1) throw new ProcedureParseError([`Procedure ${group.designator} contains a leg without a positive sequence`]);
      if (isDiscontinuity) {
        discontinuities.push({ sequence, afterLegSequence: sequence - 1 || null, beforeLegSequence: sequence + 1, afterPointId: null, beforePointId: null, reason: row.text().trim() || null, sourceReference: attr(row, "source-reference") });
        legs.push({ sequence, type: "DISCONTINUITY", from: null, to: null, geometry: null, courseDeg: null, sourceReference: attr(row, "source-reference") });
        continue;
      }
      const geometryCoordinates = row.find("[data-geometry-lat][data-geometry-lon]").toArray().map((element) => ({ lat: Number($(element).attr("data-geometry-lat")), lon: Number($(element).attr("data-geometry-lon")) })).filter(validCoordinate);
      const geometryType = attr(row, "geometry-type")?.toUpperCase() as ProcedureGeometry["type"] | undefined;
      legs.push({ sequence, type: (attr(row, "leg-type")?.toUpperCase() as ProcedureLegType) || "UNKNOWN", from: point("from"), to: point("to"), geometry: geometryType ? { type: geometryType, coordinates: geometryCoordinates, center: null, radiusNm: null } : null, courseDeg: attr(row, "course-deg") === null ? null : Number(attr(row, "course-deg")), sourceReference: attr(row, "source-reference") });
    }
    const id = `${options.airportIcao}-${group.type}-${group.designator}-${group.transition ?? "COMMON"}-${group.runway.runwayDesignators.join("-") || "ALL"}`;
    return { id, airportIcao: options.airportIcao, designator: group.designator, type: group.type, transition: group.transition, runwayApplicability: group.runway, legs: legs.sort((a, b) => a.sequence - b.sequence), discontinuities: discontinuities.sort((a, b) => a.sequence - b.sequence), source: options.source };
  });
}

function parseEaipSemanticHtml(raw: string, options: ProcedureParseOptions): Procedure[] {
  const $ = load(raw);
  const parsed: Procedure[] = [];
  $("div[id*='AD-2.22'] tr").each((_index, node) => {
    const row = $(node);
    const tokens = row.find(".SD").toArray().map((element) => {
      const value = $(element).text().replace(/\s+/g, " ").trim();
      const parameter = $(element).next(".sdParams").text().trim();
      return { value, parameter };
    }).filter((token) => token.value && token.parameter);
    const procedureToken = tokens.find((token) => /^(TSID|TSTAR);TXT_DESIG;/.test(token.parameter));
    const procedureParts = procedureToken?.parameter.split(";");
    const type = procedureParts?.[0] === "TSID" ? "SID" : procedureParts?.[0] === "TSTAR" ? "STAR" : null;
    if (!type || !procedureToken) return;
    const pointTokens = tokens.filter((token) => /^(TDESIGNATED_POINT|TNAVAID);CODE_ID;/.test(token.parameter));
    const points: ProcedurePoint[] = [];
    const pointIds = new Set<string>();
    for (const token of pointTokens) {
      const parts = token.parameter.split(";");
      const sourceId = parts[2] ?? token.value;
      const id = `${parts[0] === "TNAVAID" ? "NAV" : "DP"}:${sourceId}`;
      if (pointIds.has(id)) continue;
      pointIds.add(id);
      points.push({ id, name: token.value.toUpperCase(), kind: parts[0] === "TNAVAID" ? "NAVAID" : "FIX", coordinates: null, sourceReference: row.attr("id") ? `${options.source.reference}#${row.attr("id")}` : options.source.reference });
    }
    if (points.length < 2) return;
    const designator = procedureToken.value.toUpperCase();
    const sourceReference = row.attr("id") ? `${options.source.reference}#${row.attr("id")}` : options.source.reference;
    const legs: ProcedureLeg[] = points.slice(1).map((to, index) => ({ sequence: index + 1, type: "UNKNOWN", from: points[index], to, geometry: null, courseDeg: null, sourceReference }));
    const remarks = row.clone().find(".SD, .sdParams").remove().end().text().replace(/\s+/g, " ").trim() || null;
    parsed.push({ id: `${options.airportIcao}-${type}-${designator}`, airportIcao: options.airportIcao, designator, type, transition: null, runwayApplicability: { kind: "UNKNOWN", runwayDesignators: [] }, legs, discontinuities: [], source: options.source, remarks });
  });
  return [...new Map(parsed.map((procedure) => [procedure.id, procedure])).values()];
}

export function parseOfficialProcedureSource(raw: string, options: ProcedureParseOptions): ProcedureDatasetDocument {
  if (!ICAO.test(options.airportIcao)) throw new ProcedureParseError([`Invalid airport ICAO ${options.airportIcao}`]);
  const procedures = parseJsonSource(raw) ?? (() => {
    const structured = parseStructuredHtml(raw, options);
    return structured.length ? structured : parseEaipSemanticHtml(raw, options);
  })();
  if (!procedures.length) throw new ProcedureParseError(["No structured SID/STAR procedures found; chart OCR and unverified transcriptions are not accepted"]);
  const source = options.source;
  const dataset: ProcedureDatasetDocument = { schemaVersion: PROCEDURE_DATASET_SCHEMA_VERSION, source, procedures, counts: { procedures: procedures.length, legs: procedures.reduce((sum, procedure) => sum + procedure.legs.length, 0), points: procedures.reduce((sum, procedure) => sum + procedure.legs.flatMap((leg) => [leg.from, leg.to]).filter(Boolean).length, 0), discontinuities: procedures.reduce((sum, procedure) => sum + procedure.discontinuities.length, 0) } };
  return validateProcedureDataset(dataset);
}

export function mergeProcedureDatasets(documents: ProcedureDatasetDocument[]): ProcedureDatasetDocument {
  if (!documents.length) throw new ProcedureValidationError(["At least one procedure dataset is required"]);
  const procedures = documents.flatMap((document) => document.procedures);
  const source = documents[0].source;
  return validateProcedureDataset({ schemaVersion: PROCEDURE_DATASET_SCHEMA_VERSION, source, procedures, counts: { procedures: procedures.length, legs: procedures.reduce((sum, procedure) => sum + procedure.legs.length, 0), points: procedures.reduce((sum, procedure) => sum + procedure.legs.flatMap((leg) => [leg.from, leg.to]).filter(Boolean).length, 0), discontinuities: procedures.reduce((sum, procedure) => sum + procedure.discontinuities.length, 0) } });
}
