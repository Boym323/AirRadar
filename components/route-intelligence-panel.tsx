import type { ReactNode } from "react";
import { formatNumber, t } from "@/lib/i18n";
import type {
  ProcedureMatchViewDTO,
  RouteAdherence,
  RouteIntelligenceViewDTO,
  RoutePhase,
  RoutePointViewDTO,
} from "@/lib/route-intelligence";

function valueOrUnknown(value: string | null | undefined): string {
  return value?.trim() || t.routeIntelligence.unknown;
}

function numberOrUnknown(value: number | null, digits = 0, suffix = ""): string {
  return value === null || !Number.isFinite(value)
    ? t.routeIntelligence.unknown
    : `${formatNumber(value, digits)}${suffix}`;
}

function statusLabel(status: RouteIntelligenceViewDTO["status"]): string {
  switch (status) {
    case "RESOLVED": return t.routeIntelligence.resolved;
    case "PARTIAL": return t.routeIntelligence.partial;
    case "UNRESOLVED": return t.routeIntelligence.unresolved;
    case "NO_ROUTE": return t.routeIntelligence.noRoute;
    default: return t.routeIntelligence.unknown;
  }
}

function phaseLabel(phase: RoutePhase): string {
  switch (phase) {
    case "SID": return t.routeIntelligence.sid;
    case "EN_ROUTE": return t.routeIntelligence.enRoute;
    case "STAR": return t.routeIntelligence.star;
    case "CONNECTOR": return t.routeIntelligence.connector;
    case "UNKNOWN": return t.routeIntelligence.unknown;
    default: return t.routeIntelligence.unknown;
  }
}

function adherenceLabel(adherence: RouteAdherence): string {
  switch (adherence) {
    case "ON_ROUTE": return t.routeIntelligence.onRoute;
    case "NEAR_ROUTE": return t.routeIntelligence.nearRoute;
    case "OFF_ROUTE": return t.routeIntelligence.offRoute;
    case "UNKNOWN": return t.routeIntelligence.unknown;
    default: return t.routeIntelligence.unknown;
  }
}

function sourceKindLabel(kind: RouteIntelligenceViewDTO["elements"][number]["source"]["kind"]): string {
  switch (kind) {
    case "PUBLISHED_SID": return t.routeIntelligence.publishedSid;
    case "PUBLISHED_STAR": return t.routeIntelligence.publishedStar;
    case "PUBLISHED_ATS": return t.routeIntelligence.publishedAts;
    case "FILED_DCT": return t.routeIntelligence.filedDct;
    case "FILED_ROUTE": return t.routeIntelligence.filedRoute;
    case "SCHEMATIC": return t.routeIntelligence.schematic;
  }
}

function pointLabel(point: RoutePointViewDTO | null): string {
  return valueOrUnknown(point?.name);
}

function endpoint(route: RouteIntelligenceViewDTO, side: "origin" | "destination"): RoutePointViewDTO | null {
  const ordered = route.elements.filter((element) => element.status !== "DISCONTINUITY");
  if (side === "origin") return ordered[0]?.from ?? ordered[0]?.to ?? null;
  const last = ordered.at(-1);
  return last?.to ?? last?.from ?? null;
}

function procedureMatch(route: RouteIntelligenceViewDTO, type: "SID" | "STAR"): ProcedureMatchViewDTO | null {
  const elements = route.elements.filter((element) => element.kind === (type === "SID" ? "PUBLISHED_SID" : "PUBLISHED_STAR"));
  if (!elements.length) return null;
  const index = type === "SID" ? 0 : Math.max(0, route.procedureMatches.length - 1);
  return route.procedureMatches[index] ?? null;
}

function procedureLabel(route: RouteIntelligenceViewDTO, type: "SID" | "STAR"): string {
  const element = route.elements.find((candidate) => candidate.kind === (type === "SID" ? "PUBLISHED_SID" : "PUBLISHED_STAR"));
  const match = procedureMatch(route, type);
  if (!element) return t.routeIntelligence.unavailable;
  const designator = valueOrUnknown(element.label);
  if (match?.status === "FILED") return `${t.routeIntelligence.filed} · ${designator}`;
  if (match?.status === "INFERRED_HIGH" || match?.status === "INFERRED_MEDIUM") return `${t.routeIntelligence.probable} · ${designator}`;
  if (match?.status === "UNRESOLVED" || element.status !== "RESOLVED") return `${t.routeIntelligence.unresolved} · ${designator}`;
  return designator;
}

function runwayLabel(route: RouteIntelligenceViewDTO): string {
  const { runway } = route;
  if (runway.conflict) return `${t.routeIntelligence.reported}: ${valueOrUnknown(runway.reportedRunway)} · ${t.routeIntelligence.probable}: ${valueOrUnknown(runway.inferredRunway)} · ${t.routeIntelligence.conflict}`;
  if (runway.reportedRunway) return `${t.routeIntelligence.reported}: ${runway.reportedRunway}`;
  if (runway.inferredRunway) return `${t.routeIntelligence.probable}: ${runway.inferredRunway}`;
  return t.routeIntelligence.unknown;
}

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return <div className="detail-item"><span className="detail-item-label">{label}</span><strong className="detail-item-value">{value}</strong></div>;
}

function DetailSection({ title, children, secondary = false }: { title: string; children: ReactNode; secondary?: boolean }) {
  return <section className={`detail-section route-intelligence-section${secondary ? " route-intelligence-secondary" : ""}`}><h3>{title}</h3><div className="detail-grid">{children}</div></section>;
}

export function RouteIntelligencePanel({ route, compact = false }: { route: RouteIntelligenceViewDTO | null; compact?: boolean }) {
  if (!route) return null;
  const origin = endpoint(route, "origin");
  const destination = endpoint(route, "destination");
  const current = route.currentElement;
  const currentFromTo = current
    ? `${pointLabel(current.from)} → ${pointLabel(current.to)}`
    : t.routeIntelligence.unavailable;
  const progressPercent = route.routeProgress === null || !Number.isFinite(route.routeProgress)
    ? null
    : Math.max(0, Math.min(100, route.routeProgress * 100));
  const unresolved = route.elements.filter((element) => element.status !== "RESOLVED");
  const sources = [...new Map(route.elements.map((element) => [
    `${element.source.provider ?? ""}:${element.source.reference ?? ""}`,
    [element.source.provider, element.source.reference].filter(Boolean).join(" · ") || sourceKindLabel(element.source.kind),
  ])).values()];

  return <section className={`route-intelligence-v2${compact ? " route-intelligence-v2-compact" : ""}`} aria-labelledby="route-intelligence-v2-title">
    <header className="route-intelligence-v2-heading">
      <div><span className="detail-eyebrow">{t.routeIntelligence.title}</span><h2 id="route-intelligence-v2-title">{origin ? pointLabel(origin) : t.routeIntelligence.unknown} <span aria-hidden="true">→</span> {destination ? pointLabel(destination) : t.routeIntelligence.unknown}</h2></div>
      <span className="route-intelligence-status">{statusLabel(route.status)}</span>
    </header>

    <DetailSection title={t.routeIntelligence.primaryRoute}>
      <DetailItem label={t.routeIntelligence.phase} value={phaseLabel(route.currentPhase)} />
      <DetailItem label={t.routeIntelligence.sid} value={procedureLabel(route, "SID")} />
      <DetailItem label={t.routeIntelligence.currentElement} value={current?.label || currentFromTo} />
      <DetailItem label={t.routeIntelligence.currentFromTo} value={currentFromTo} />
      <DetailItem label={t.routeIntelligence.star} value={procedureLabel(route, "STAR")} />
      <DetailItem label={t.routeIntelligence.runway} value={runwayLabel(route)} />
      <DetailItem label={t.routeIntelligence.nextWaypoint} value={`${pointLabel(route.nextPoint)}${route.distanceToNext === null ? "" : ` · ${numberOrUnknown(route.distanceToNext, 1, " NM")}`}`} />
      <DetailItem label={t.routeIntelligence.progress} value={progressPercent === null ? t.routeIntelligence.unavailable : `${formatNumber(progressPercent, 0)} %`} />
      {!compact && <DetailItem label={t.routeIntelligence.routeAdherence} value={adherenceLabel(route.routeAdherence)} />}
    </DetailSection>

    <DetailSection title={t.routeIntelligence.coverage} secondary={compact}>
      <DetailItem label={t.routeIntelligence.atsCoverage} value={numberOrUnknown(route.coverage.ats.percent, 0, " %")} />
      <DetailItem label={t.routeIntelligence.reconstructionCoverage} value={numberOrUnknown(route.coverage.reconstruction.percent, 0, " %")} />
      {!compact && <DetailItem label={t.routeIntelligence.crossTrack} value={numberOrUnknown(route.crossTrackDeviation, 1, " NM")} />}
      {!compact && <DetailItem label={t.routeIntelligence.routeAdherence} value={adherenceLabel(route.routeAdherence)} />}
    </DetailSection>

    {(!compact || unresolved.length > 0) && <DetailSection title={t.routeIntelligence.provenance} secondary>
      {!compact && <DetailItem label={t.routeIntelligence.routeId} value={valueOrUnknown(route.routeId)} />}
      <DetailItem label={t.routeIntelligence.sourceMetadata} value={sources.length ? sources.join(" · ") : t.routeIntelligence.unknown} />
      {unresolved.length > 0 && <DetailItem label={t.routeIntelligence.unresolvedParts} value={unresolved.map((element) => element.unresolvedReason || element.label || sourceKindLabel(element.source.kind)).join(" · ")} />}
    </DetailSection>}

    <p className="detail-disclaimer route-intelligence-disclaimer">{t.routeIntelligence.disclaimer}</p>
  </section>;
}
