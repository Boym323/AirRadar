import type { NavigationIntegrityAuditCategory, NavigationIntegrityConfidence } from "@/lib/navigation-integrity/types";

export type InvestigationWindow = "5m" | "15m" | "30m" | "60m";
export type InvestigationSource = "ALL" | "LOCAL" | "NETWORK";
export type InvestigationSeverity = "ALL" | "REDUCED" | "DEGRADED" | "SEVERE";
export type InvestigationConfidence = "ALL" | NavigationIntegrityConfidence;
export type InvestigationHistoryRange = "24h" | "7d" | "30d";

export interface NavigationIntegrityInvestigationState {
  window: InvestigationWindow;
  source: InvestigationSource;
  minAltitude: string;
  maxAltitude: string;
  severity: InvestigationSeverity;
  confidence: InvestigationConfidence;
  category: "ALL" | NavigationIntegrityAuditCategory;
  history: InvestigationHistoryRange;
}

export interface AirspaceInvestigationState {
  sector: string | null;
  windowMinutes: 1 | 5 | 15;
}

export interface FlightCompareInvestigationState {
  a: number | null;
  b: number | null;
}

export interface AirportCompareInvestigationState {
  a: string | null;
  b: string | null;
  period: "24h" | "7d";
}

export interface NavigationReferenceInvestigationState {
  id: string | null;
  route?: string | null;
}

export interface ProcedureInvestigationState {
  airport: string | null;
  type: "ALL" | "SID" | "STAR";
  designator: string;
}

export interface SectorDetailInvestigationState {
  historyHours: 1 | 6 | 24;
}

const NAV_WINDOWS = new Set<InvestigationWindow>(["5m", "15m", "30m", "60m"]);
const NAV_SOURCES = new Set<InvestigationSource>(["ALL", "LOCAL", "NETWORK"]);
const NAV_SEVERITIES = new Set<InvestigationSeverity>(["ALL", "REDUCED", "DEGRADED", "SEVERE"]);
const NAV_CONFIDENCE = new Set<InvestigationConfidence>(["ALL", "LOW", "MEDIUM", "HIGH"]);
const NAV_CATEGORIES = new Set<NavigationIntegrityAuditCategory>([
  "LIKELY_VALID_SIGNAL",
  "WEAK_EVIDENCE",
  "BASELINE_IMMATURE",
  "AIRCRAFT_SPECIFIC",
  "SOURCE_ARTIFACT",
  "CELL_EDGE_EFFECT",
  "ALTITUDE_TRANSITION",
  "STALE_DATA",
  "UNKNOWN",
]);
const HISTORY_RANGES = new Set<InvestigationHistoryRange>(["24h", "7d", "30d"]);

function paramsFrom(search: string): URLSearchParams {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
}

function safeAltitude(value: string | null): string {
  if (value === null || !/^\d{1,5}$/.test(value)) return "";
  const numeric = Number(value);
  return numeric >= 0 && numeric <= 60_000 ? String(numeric) : "";
}

function safePositiveInt(value: string | null): number | null {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) ? numeric : null;
}

function safeIcao(value: string | null): string | null {
  const normalized = value?.trim().toUpperCase() ?? "";
  return /^[A-Z0-9]{4}$/.test(normalized) ? normalized : null;
}

function safeAirportIcao(value: string | null): string | null {
  const normalized = value?.trim().toUpperCase() ?? "";
  return /^[A-Z]{4}$/.test(normalized) ? normalized : null;
}

function safeNavIdentifier(value: string | null): string | null {
  const normalized = value?.trim().toUpperCase() ?? "";
  return /^[A-Z0-9]{2,8}$/.test(normalized) ? normalized : null;
}

function safeAtsRouteDesignator(value: string | null): string | null {
  const normalized = value?.trim().toUpperCase() ?? "";
  return /^[A-Z0-9]{1,8}$/.test(normalized) ? normalized : null;
}

function safeProcedureDesignator(value: string | null): string {
  const normalized = value?.trim().toUpperCase() ?? "";
  return normalized && /^[A-Z0-9]{1,16}$/.test(normalized) ? normalized : "";
}

export function parseNavigationIntegrityInvestigation(search: string): NavigationIntegrityInvestigationState {
  const params = paramsFrom(search);
  const windowValue = params.get("window") as InvestigationWindow | null;
  const sourceValue = params.get("source") as InvestigationSource | null;
  const severityValue = params.get("severity") as InvestigationSeverity | null;
  const confidenceValue = params.get("confidence") as InvestigationConfidence | null;
  const categoryValue = params.get("type") as NavigationIntegrityAuditCategory | null;
  const historyValue = params.get("history") as InvestigationHistoryRange | null;
  let minAltitude = safeAltitude(params.get("minAltitude"));
  let maxAltitude = safeAltitude(params.get("maxAltitude"));
  if (minAltitude && maxAltitude && Number(minAltitude) > Number(maxAltitude)) {
    minAltitude = "";
    maxAltitude = "";
  }
  return {
    window: windowValue && NAV_WINDOWS.has(windowValue) ? windowValue : "15m",
    source: sourceValue && NAV_SOURCES.has(sourceValue) ? sourceValue : "ALL",
    minAltitude,
    maxAltitude,
    severity: severityValue && NAV_SEVERITIES.has(severityValue) ? severityValue : "ALL",
    confidence: confidenceValue && NAV_CONFIDENCE.has(confidenceValue) ? confidenceValue : "ALL",
    category: categoryValue && NAV_CATEGORIES.has(categoryValue) ? categoryValue : "ALL",
    history: historyValue && HISTORY_RANGES.has(historyValue) ? historyValue : "24h",
  };
}

export function buildNavigationIntegrityInvestigation(state: NavigationIntegrityInvestigationState): string {
  const params = new URLSearchParams();
  if (state.window !== "15m") params.set("window", state.window);
  if (state.source !== "ALL") params.set("source", state.source);
  if (state.minAltitude) params.set("minAltitude", state.minAltitude);
  if (state.maxAltitude) params.set("maxAltitude", state.maxAltitude);
  if (state.severity !== "ALL") params.set("severity", state.severity);
  if (state.confidence !== "ALL") params.set("confidence", state.confidence);
  if (state.category !== "ALL") params.set("type", state.category);
  if (state.history !== "24h") params.set("history", state.history);
  return params.toString();
}

export function parseAirspaceInvestigation(search: string): AirspaceInvestigationState {
  const params = paramsFrom(search);
  const sectorValue = (params.get("sector") ?? "").trim();
  const sector = /^[A-Za-z0-9_.:-]{1,64}$/.test(sectorValue) ? sectorValue : null;
  const rawWindow = params.get("window");
  const windowMinutes = rawWindow === "1m" ? 1 : rawWindow === "15m" ? 15 : 5;
  return { sector, windowMinutes };
}

export function buildAirspaceInvestigation(state: AirspaceInvestigationState): string {
  const params = new URLSearchParams();
  if (state.sector) params.set("sector", state.sector);
  if (state.windowMinutes !== 5) params.set("window", `${state.windowMinutes}m`);
  return params.toString();
}

export function parseFlightCompareInvestigation(search: string): FlightCompareInvestigationState {
  const params = paramsFrom(search);
  const a = safePositiveInt(params.get("a"));
  const b = safePositiveInt(params.get("b"));
  return { a, b: b !== a ? b : null };
}

export function buildFlightCompareInvestigation(state: FlightCompareInvestigationState): string {
  const params = new URLSearchParams();
  if (state.a !== null) params.set("a", String(state.a));
  if (state.b !== null && state.b !== state.a) params.set("b", String(state.b));
  return params.toString();
}

export function parseAirportCompareInvestigation(search: string): AirportCompareInvestigationState {
  const params = paramsFrom(search);
  const a = safeIcao(params.get("a"));
  const b = safeIcao(params.get("b"));
  const period = params.get("period") === "7d" ? "7d" : "24h";
  return { a, b: b !== a ? b : null, period };
}

export function buildAirportCompareInvestigation(state: AirportCompareInvestigationState): string {
  const params = new URLSearchParams();
  if (state.a) params.set("a", state.a);
  if (state.b && state.b !== state.a) params.set("b", state.b);
  if (state.period !== "24h") params.set("period", state.period);
  return params.toString();
}


export function parseNavigationReferenceInvestigation(search: string): NavigationReferenceInvestigationState {
  const params = paramsFrom(search);
  return {
    id: safeNavIdentifier(params.get("id")),
    route: safeAtsRouteDesignator(params.get("route")),
  };
}

export function buildNavigationReferenceInvestigation(state: NavigationReferenceInvestigationState): string {
  const params = new URLSearchParams();
  const id = safeNavIdentifier(state.id);
  const route = safeAtsRouteDesignator(state.route ?? null);
  if (id) params.set("id", id);
  if (route) params.set("route", route);
  return params.toString();
}

export function parseProcedureInvestigation(search: string): ProcedureInvestigationState {
  const params = paramsFrom(search);
  const rawType = params.get("type")?.trim().toUpperCase();
  return {
    airport: safeAirportIcao(params.get("airport")),
    type: rawType === "SID" || rawType === "STAR" ? rawType : "ALL",
    designator: safeProcedureDesignator(params.get("designator")),
  };
}

export function buildProcedureInvestigation(state: ProcedureInvestigationState): string {
  const params = new URLSearchParams();
  const airport = safeAirportIcao(state.airport);
  const designator = safeProcedureDesignator(state.designator);
  if (airport) params.set("airport", airport);
  if (state.type === "SID" || state.type === "STAR") params.set("type", state.type);
  if (designator) params.set("designator", designator);
  return params.toString();
}

export function parseSectorDetailInvestigation(search: string): SectorDetailInvestigationState {
  const value = paramsFrom(search).get("history");
  return { historyHours: value === "1h" ? 1 : value === "24h" ? 24 : 6 };
}

export function buildSectorDetailInvestigation(state: SectorDetailInvestigationState): string {
  const params = new URLSearchParams();
  if (state.historyHours !== 6) params.set("history", `${state.historyHours}h`);
  return params.toString();
}

export function investigationHref(pathname: string, query: string): string {
  return query ? `${pathname}?${query}` : pathname;
}
