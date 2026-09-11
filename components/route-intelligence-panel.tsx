import { useSyncExternalStore, type ReactNode } from "react";
import { formatNumber, t } from "@/lib/i18n";
import {
  getRouteIntelligenceUpdateSnapshot,
  subscribeRouteIntelligenceUpdates,
} from "@/lib/route-intelligence";
import type { RouteIntelligenceResult } from "@/lib/route-intelligence";

function statusLabel(result: RouteIntelligenceResult): string {
  switch (result.status) {
    case "MATCHED": return t.routeIntelligence.matched;
    case "PARTIAL": return t.routeIntelligence.partial;
    case "UNRESOLVED": return t.routeIntelligence.unresolved;
    case "NO_ROUTE": return t.routeIntelligence.noRoute;
    case "NO_ATS_DATA": return t.routeIntelligence.noAtsData;
  }
}

function confidenceLabel(result: RouteIntelligenceResult): string {
  switch (result.confidenceLevel) {
    case "HIGH": return t.routeIntelligence.high;
    case "MEDIUM": return t.routeIntelligence.medium;
    case "LOW": return t.routeIntelligence.low;
    default: return t.routeIntelligence.unknown;
  }
}

function waypointLabel(name: string | null): string {
  return name || t.routeIntelligence.unknown;
}

function segmentLabel(result: RouteIntelligenceResult): string {
  return result.currentSegment ? `${result.currentSegment.fromName} → ${result.currentSegment.toName}` : t.routeIntelligence.unresolvedSegment;
}

export function RouteIntelligencePanel({ result }: { result: RouteIntelligenceResult }) {
  // Route Intelligence loads the published ATS dataset independently of the
  // visual ATS map toggle. The store only invalidates this panel when that
  // one-time internal dataset load upgrades a fail-closed NO_ATS_DATA result.
  useSyncExternalStore(
    subscribeRouteIntelligenceUpdates,
    getRouteIntelligenceUpdateSnapshot,
    getRouteIntelligenceUpdateSnapshot,
  );

  return <DetailSection title={t.routeIntelligence.title}>
    <DetailItem label={t.routeIntelligence.publishedMatch} value={result.routeCoveragePercent === null ? statusLabel(result) : `${formatNumber(result.routeCoveragePercent, 0)} % · ${statusLabel(result)}`} />
    <DetailItem label={t.routeIntelligence.currentRoute} value={result.currentSegment?.routeDesignator || t.routeIntelligence.unknown} />
    <DetailItem label={t.routeIntelligence.currentSegment} value={segmentLabel(result)} />
    <DetailItem label={t.routeIntelligence.previousWaypoint} value={waypointLabel(result.previousWaypoint?.name ?? null)} />
    <DetailItem label={t.routeIntelligence.nextWaypoint} value={result.nextWaypoint ? `${result.nextWaypoint.name}${result.distanceToNextWaypointNm === null ? "" : ` · ${formatNumber(result.distanceToNextWaypointNm, 1)} NM`}` : t.routeIntelligence.unknown} />
    <DetailItem label={t.routeIntelligence.crossTrack} value={result.crossTrackDeviationNm === null ? t.routeIntelligence.unknown : `${formatNumber(result.crossTrackDeviationNm, 1)} NM`} />
    <DetailItem label={t.routeIntelligence.confidence} value={confidenceLabel(result)} />
    <DetailItem label={t.routeIntelligence.routeSource} value={result.source.aircraftRouteSource || t.routeIntelligence.unknown} />
    <DetailItem label={t.routeIntelligence.atsSource} value={result.source.atsName ? `${result.source.atsName} · ${result.source.atsEffectiveDate ?? t.routeIntelligence.unknown}` : t.routeIntelligence.unknown} />
    {result.status === "NO_ATS_DATA" && <div className="detail-disclaimer">{t.routeIntelligence.noAtsData}</div>}
    {result.status === "UNRESOLVED" && <div className="detail-disclaimer">{t.routeIntelligence.unresolvedSegment}</div>}
    {result.unresolvedRouteTokens.length > 0 && <div className="detail-disclaimer">{t.routeIntelligence.unresolvedTokens}: {result.unresolvedRouteTokens.join(" · ")}</div>}
    <div className="detail-disclaimer">{t.routeIntelligence.publishedData} {t.routeIntelligence.availabilityUnknown}</div>
  </DetailSection>;
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="detail-section"><h3>{title}</h3><div className="detail-grid">{children}</div></section>;
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return <div className="detail-item"><span className="detail-item-label">{label}</span><strong className="detail-item-value">{value}</strong></div>;
}
