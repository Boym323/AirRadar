import type { CzAtcObjectType, CzEaipSectorDiagnostic } from "./cz-eaip";
import type { ExistingAtcSectorRecord } from "./import-format";

export type CzEaipDiagnosticClassification =
  | "persistable"
  | "source_limitation"
  | "aggregate"
  | "unsupported"
  | "parser_blocker";

export const CZ_EAIP_MISSING_ID_REASON = "missing authoritative stable source identifier";

export interface CzEaipSourceLimitedRow {
  name: string;
  objectType: CzAtcObjectType;
  annotationParam: string;
  evidence: string;
}

/**
 * Explicitly audited current eAIP rows whose source has no durable airspace
 * identifier. Annotation parameters are source evidence only and must never
 * become database IDs.
 */
export const CZ_EAIP_SOURCE_LIMITED_ROWS: readonly CzEaipSourceLimitedRow[] = [
  {
    name: "SECTOR ČECHY WEST",
    objectType: "FIC_SECTOR",
    annotationParam: "TAIRSPACE;Annotation:122550.cze;3063",
    evidence: "ENR 2.1 publishes Annotation 122550.cze;3063 without TXT_NAME or an official airspace code",
  },
  {
    name: "SECTOR ČECHY EAST",
    objectType: "FIC_SECTOR",
    annotationParam: "TAIRSPACE;Annotation:122581.cze;3062",
    evidence: "ENR 2.1 publishes Annotation 122581.cze;3062 without TXT_NAME or an official airspace code",
  },
  {
    name: "TMA ČESKÉ BUDĚJOVICE",
    objectType: "TMA",
    annotationParam: "TAIRSPACE;Annotation:122677.cze;4274",
    evidence: "ENR 2.1 publishes Annotation 122677.cze;4274 without TXT_NAME or an official airspace code",
  },
];

function sameAnnotation(left: string, right: string): boolean {
  return left.toUpperCase() === right.toUpperCase();
}

export function isKnownCzEaipSourceLimitedRow(input: {
  name: string;
  objectType: CzAtcObjectType;
  annotationParams: readonly string[];
}): boolean {
  return CZ_EAIP_SOURCE_LIMITED_ROWS.some((row) => row.name === input.name
    && row.objectType === input.objectType
    && input.annotationParams.some((param) => sameAnnotation(param, row.annotationParam)));
}

export function classifyMissingCzEaipStableId(input: {
  name: string;
  objectType: CzAtcObjectType;
  annotationParams: readonly string[];
}): CzEaipDiagnosticClassification {
  return isKnownCzEaipSourceLimitedRow(input) ? "source_limitation" : "parser_blocker";
}

export interface CzEaipDiagnosticPolicy {
  sourceLimited: CzEaipSectorDiagnostic[];
  parserBlockers: CzEaipSectorDiagnostic[];
  historicalRegressions: CzEaipSectorDiagnostic[];
  historyUnknown: CzEaipSectorDiagnostic[];
  blockingSupportedRows: CzEaipSectorDiagnostic[];
}

function isCzechEaipSector(row: ExistingAtcSectorRecord): boolean {
  return row.sourceReference.includes("aim.rlp.cz");
}

function wasPreviouslyImported(diagnostic: CzEaipSectorDiagnostic, rows: readonly ExistingAtcSectorRecord[]): boolean {
  return rows.some((row) => isCzechEaipSector(row) && row.name === diagnostic.name);
}

/**
 * Apply the import safety policy after parsing. A source limitation is
 * non-blocking only when database history is available and contains no prior
 * Czech eAIP row with the same identity.
 */
export function evaluateCzEaipDiagnosticPolicy(options: {
  diagnostics: readonly CzEaipSectorDiagnostic[];
  databaseAvailable: boolean;
  existingSectors?: readonly ExistingAtcSectorRecord[];
}): CzEaipDiagnosticPolicy {
  const sourceLimited = options.diagnostics.filter((diagnostic) => diagnostic.classification === "source_limitation");
  const parserBlockers = options.diagnostics.filter((diagnostic) => diagnostic.classification === "parser_blocker");
  const historicalRegressions = options.databaseAvailable
    ? sourceLimited.filter((diagnostic) => wasPreviouslyImported(diagnostic, options.existingSectors ?? []))
    : [];
  const historyUnknown = options.databaseAvailable ? [] : sourceLimited;
  return {
    sourceLimited,
    parserBlockers,
    historicalRegressions,
    historyUnknown,
    blockingSupportedRows: [...parserBlockers, ...historicalRegressions, ...historyUnknown],
  };
}
