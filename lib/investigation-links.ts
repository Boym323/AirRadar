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

export interface NavigationReferenceInvestigationState {
  id: string | null;
  route?: string | null;
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

function safeNavIdentifier(value: string | null): string | null {
  const normalized = value?.trim().toUpperCase() ?? "";
  return /^[A-Z0-9]{2,8}$/.test(normalized) ? normalized : null;
}

function safeAtsRouteDesignator(value: string | null): string | null {
  const normalized = value?.trim().toUpperCase() ?? "";
  return /^[A-Z0-9]{1,8}$/.test(normalized) ? normalized : null;
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

export function investigationHref(pathname: string, query: string): string {
  return query ? `${pathname}?${query}` : pathname;
}
