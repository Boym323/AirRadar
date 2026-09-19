"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { Airport } from "@/lib/airports/types";
import type { AtcContextResult } from "@/lib/atc-context/types";
import type { AircraftView, FlightRoute } from "@/lib/aircraft/types";
import type { AircraftDetailMetadata, HistoryResponse } from "@/lib/server/history";
import type { RouteIntelligenceViewDTO } from "@/lib/route-intelligence";
import { RouteIntelligencePanel } from "@/components/route-intelligence-panel";
import { AircraftAltitudeChart, aircraftAirportHref } from "@/components/aircraft-detail-v2";
import { FlightRouteWeather } from "@/components/airport-weather";
import { StatusBadge } from "@/components/ui-primitives";
import {
  formatAge,
  formatAltitude,
  formatAtcFrequency,
  formatAtcLimit,
  formatAtcService,
  formatDistance,
  formatNumber,
  formatSpeed,
  formatTime,
  formatTrack,
  t,
} from "@/lib/i18n";

interface QuickHistoryTrail {
  points: HistoryResponse["positions"];
  flight: HistoryResponse["flight"];
}

export interface AircraftRadarQuickDetailProps {
  aircraft: AircraftView;
  databaseAircraft: AircraftDetailMetadata | null;
  historyTrail: QuickHistoryTrail | null;
  atcContext: AtcContextResult | null;
  routeIntelligence: RouteIntelligenceViewDTO | null;
  watchlisted: boolean;
  onBack: () => void;
  onClose: () => void;
  onCenter: () => void;
  onToggleWatchlist: () => void;
  sectorTraffic?: Map<string, { trafficLevel: string; traffic: { aircraftCount: number }; frequencies: Array<{ channel: string }> }>;
}

function DetailValue({ label, value, children }: { label: string; value?: string | null; children?: ReactNode }) {
  if (!children && (!value || value === t.common.emptyValue)) return null;
  return <div className="aircraft-quick-detail-value"><span className="detail-item-label">{label}</span><strong className="detail-item-value">{children ?? value}</strong></div>;
}

function QuickSection({ id, title, children, className = "" }: { id: string; title: string; children: ReactNode; className?: string }) {
  return <section className={`aircraft-quick-section ${className}`} aria-labelledby={id}>
    <h2 id={id}>{title}</h2>
    {children}
  </section>;
}

function RouteEndpoint({ code, airport }: { code: string | null; airport: Airport | null }) {
  if (!code && !airport) return null;
  const label = airport?.iataCode || airport?.icaoCode || code;
  if (!label) return null;
  return airport ? <Link className="airport-link" href={aircraftAirportHref(airport.icaoCode)}>{label}</Link> : <span>{label}</span>;
}

function RouteSection({ route, callsign, visible }: { route: FlightRoute | undefined; callsign: string; visible: boolean }) {
  if (!visible || !route) return null;
  return <>
    <div className="aircraft-quick-header-route" aria-label={t.route.context}>
      <RouteEndpoint code={route.origin} airport={route.originAirport} />
      <span aria-hidden="true">→</span>
      <span>{callsign}</span>
      <span aria-hidden="true">→</span>
      <RouteEndpoint code={route.destination} airport={route.destinationAirport} />
    </div>
    <p className="aircraft-quick-header-route-note">{t.route.contextDisclaimer}</p>
  </>;
}

function durationLabel(start: string | null | undefined, end: string | null | undefined): string | null {
  if (!start || !end) return null;
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  const minutes = Math.max(0, Math.round((endMs - startMs) / 60_000));
  if (minutes < 60) return t.aircraft.trackingDurationMinutes(formatNumber(minutes));
  return t.aircraft.trackingDurationHours(formatNumber(Math.floor(minutes / 60)), formatNumber(minutes % 60));
}

function trackingSummary(aircraft: AircraftView, historyTrail: QuickHistoryTrail | null): string[] {
  const firstSeen = historyTrail?.flight?.startedAt ?? historyTrail?.points[0]?.recordedAt ?? null;
  const lastSeen = historyTrail?.flight?.lastSeenAt ?? aircraft.lastSeen;
  const positions = historyTrail?.points.length ?? aircraft.trail?.length ?? 0;
  return [
    durationLabel(firstSeen, lastSeen),
    aircraft.seenSeconds === null ? formatTime(lastSeen) : formatAge(aircraft.seenSeconds),
    positions > 0 ? t.aircraft.trackingPositions(formatNumber(positions)) : null,
  ].filter((value): value is string => Boolean(value));
}

function AtcSection({ aircraft, context, sectorTraffic }: { aircraft: AircraftView; context: AtcContextResult | null; sectorTraffic?: Map<string, { trafficLevel: string; traffic: { aircraftCount: number }; frequencies: Array<{ channel: string }> }> }) {
  const contextAirspace = context?.status === "available" ? context.primaryAirspace : null;
  const assignment = contextAirspace ? null : aircraft.atc ?? null;
  const fir = context?.status === "available" ? context.fir?.name : null;
  const airspaceName = contextAirspace?.name ?? assignment?.name ?? null;
  const service = contextAirspace?.publishedUnit ?? assignment?.service ?? assignment?.callsign ?? null;
  const frequencies = contextAirspace?.publishedFrequenciesMhz ?? [];
  const primaryFrequency = frequencies[0] ?? assignment?.primaryFrequencyMhz ?? null;
  const additionalFrequencies = frequencies.length > 0 ? frequencies.slice(1) : assignment?.alternateFrequenciesMhz ?? [];
  const route = context?.status === "available" ? context.atsRoute ?? context.nearestAtsCandidate : null;
  const nextSector = context?.status === "available" ? context.nextSector : null;
  const next = nextSector ?? (context?.status === "available" ? context.nextPoint ?? context.ahead : null);
  if (!airspaceName && !fir && !route && !next && !primaryFrequency) return null;

  const lowerLimit = contextAirspace?.lowerLimitFt ?? assignment?.lowerAltitudeFt ?? null;
  const upperLimit = contextAirspace?.upperLimitFt ?? assignment?.upperAltitudeFt ?? null;
  const lowerReference = contextAirspace?.lowerLimitReference ?? assignment?.lowerAltitudeReference;
  const upperReference = contextAirspace?.upperLimitReference ?? assignment?.upperAltitudeReference;
  const hasLimits = lowerLimit !== null || upperLimit !== null;
  const traffic = contextAirspace ? sectorTraffic?.get(contextAirspace.id) : undefined;

  return <QuickSection id="aircraft-quick-atc-title" title={t.atc.contextTitle} className="aircraft-quick-atc" >
    <div className="aircraft-quick-atc-primary">
      {fir && <span className="aircraft-quick-atc-fir">{fir}</span>}
      {airspaceName && <strong>{airspaceName}</strong>}
      {service && <span>{formatAtcService(service)}</span>}
      {primaryFrequency !== null && <b>{formatAtcFrequency(primaryFrequency)}</b>}
      {hasLimits && <span className="aircraft-quick-atc-limits">
        {formatAtcLimit(lowerLimit, lowerReference, t.common.unlimited)} – {formatAtcLimit(upperLimit, upperReference, t.common.unlimited)}
      </span>}
    </div>
    {(route || next) && <div className="aircraft-quick-atc-context">
      {route && <DetailValue label={route === context?.atsRoute ? t.atc.contextAts : t.atc.contextNearestAts} value={`${route.routeId} · ${formatNumber(route.distanceNm, 1)} NM`} />}
      {nextSector && <DetailValue label={t.atc.nextSector} value={`${nextSector.airspace.name} · ~${formatNumber(nextSector.distanceNm * 1.852, 0)} km · ~${Math.max(1, Math.round(nextSector.estimatedSeconds / 60))} min`} />}
      {!nextSector && next && <DetailValue label={t.atc.contextNext} value={"identifier" in next ? `${next.identifier} · ${formatNumber(next.distanceNm, 0)} NM` : `${next.airspace.name} · ${formatNumber(next.distanceNm, 0)} NM`} />}
    </div>}
    {additionalFrequencies.length > 0 && <details className="aircraft-quick-atc-more">
      <summary>{t.atc.moreFrequencies}</summary>
      <div className="aircraft-quick-frequency-list">{additionalFrequencies.map((frequency) => <span key={frequency}>{formatAtcFrequency(frequency)}</span>)}</div>
    </details>}
    <p className="aircraft-quick-disclaimer">{t.atc.contextDisclaimer}</p>
    {contextAirspace && <p className="aircraft-quick-disclaimer">Published sector: {contextAirspace.name}{traffic ? ` · Sector traffic: ${traffic.traffic.aircraftCount} aircraft · ${traffic.trafficLevel}` : " · Sector traffic: —"}. Aircraft is within the published sector volume. Traffic does not represent the official operational sector configuration.</p>}
  </QuickSection>;
}

function RouteIntelligenceSection({ result }: { result: RouteIntelligenceViewDTO | null }) {
  return result ? <section className="aircraft-quick-section aircraft-quick-route-intelligence"><RouteIntelligencePanel route={result} compact /></section> : null;
}

function AircraftIdentitySection({ aircraft, databaseAircraft }: { aircraft: AircraftView; databaseAircraft: AircraftDetailMetadata | null }) {
  const metadata = aircraft.enrichment?.metadata;
  const entries = [
    [t.aircraft.registration, aircraft.registration ?? metadata?.registration ?? databaseAircraft?.registration],
    [t.aircraft.aircraftType, metadata?.icaoTypeCode ?? metadata?.aircraftType ?? aircraft.aircraftType ?? databaseAircraft?.aircraftType],
    [t.aircraft.modelType, metadata?.aircraftDescription ?? aircraft.aircraftDescription ?? databaseAircraft?.model],
    [t.aircraft.manufacturer, metadata?.manufacturer ?? databaseAircraft?.manufacturer],
    [t.aircraft.operator, metadata?.operator ?? databaseAircraft?.operator],
    [t.aircraft.registrationCountry, metadata?.registrationCountryCode ?? metadata?.registrationCountry ?? databaseAircraft?.registrationCountryCode ?? databaseAircraft?.registrationCountry],
  ] as const;
  return <QuickSection id="aircraft-quick-identity-title" title={t.aircraft.aircraftTitle} className="aircraft-quick-aircraft">
    <div className="aircraft-quick-detail-grid">{entries.map(([label, value]) => <DetailValue key={label} label={label} value={value} />)}</div>
  </QuickSection>;
}

function TechnicalDetails({ aircraft }: { aircraft: AircraftView }) {
  const metadata = aircraft.enrichment?.metadata;
  const position = aircraft.lat === null || aircraft.lon === null ? null : `${aircraft.lat.toFixed(4)}, ${aircraft.lon.toFixed(4)}`;
  const altitudeValues = [aircraft.baroAltitude, aircraft.geomAltitude]
    .filter((value): value is number => value !== null)
    .map((value) => formatAltitude(value));
  const rateValues = [aircraft.baroRate, aircraft.geomRate]
    .filter((value): value is number => value !== null)
    .map((value) => formatNumber(value));
  return <details className="aircraft-quick-advanced" data-testid="technical-details">
    <summary>{t.aircraft.technicalDetails}</summary>
    <div className="aircraft-quick-detail-grid">
      <DetailValue label={t.aircraft.distance} value={formatDistance(aircraft.distanceKm)} />
      <DetailValue label={t.aircraft.bearing} value={aircraft.bearing === null ? null : formatTrack(aircraft.bearing)} />
      <DetailValue label={t.aircraft.rssi} value={aircraft.rssi === null ? null : `${formatNumber(aircraft.rssi, 1)} dBFS`} />
      <DetailValue
        label={t.aircraft.seenPosition}
        value={aircraft.seenSeconds === null && aircraft.seenPosSeconds === null
          ? null
          : `${aircraft.seenSeconds === null ? t.common.emptyValue : formatAge(aircraft.seenSeconds)} / ${aircraft.seenPosSeconds === null ? t.common.emptyValue : formatAge(aircraft.seenPosSeconds)}`}
      />
      <DetailValue label={t.aircraft.squawk} value={aircraft.squawk} />
      <DetailValue label={t.aircraft.source} value={aircraft.sourceType ?? aircraft.source} />
      <DetailValue label={t.aircraft.seenBy} value={aircraft.provenance?.seenLocal && aircraft.provenance.seenNetwork ? t.aircraft.localAndNetwork : aircraft.origin === "adsblol" ? t.aircraft.networkReceiver : t.aircraft.localReceiver} />
      <DetailValue label={t.aircraft.positionSource} value={aircraft.provenance?.positionSource ?? aircraft.source} />
      <DetailValue label={t.aircraft.position} value={position} />
      <DetailValue label={t.aircraft.baroGeomAltitude} value={altitudeValues.length > 0 ? altitudeValues.join(" / ") : null} />
      <DetailValue label={t.aircraft.baroGeomRate} value={rateValues.length > 0 ? `${rateValues.join(" / ")} ft/min` : null} />
      <DetailValue label={t.aircraft.category} value={aircraft.category} />
      <DetailValue label={t.aircraft.messages} value={formatNumber(aircraft.messages)} />
      <DetailValue label={t.aircraft.emergency} value={aircraft.emergency} />
      <DetailValue label={t.aircraft.flags} value={metadata?.flags} />
      <DetailValue label={t.aircraft.year} value={metadata?.year} />
      <DetailValue label={t.route.source} value={aircraft.enrichment?.route?.source} />
    </div>
  </details>;
}

export function AircraftRadarQuickDetail({
  aircraft,
  databaseAircraft,
  historyTrail,
  atcContext,
  routeIntelligence,
  watchlisted,
  onBack,
  onClose,
  onCenter,
  onToggleWatchlist,
  sectorTraffic,
}: AircraftRadarQuickDetailProps) {
  const metadata = aircraft.enrichment?.metadata;
  const registration = aircraft.registration ?? metadata?.registration ?? databaseAircraft?.registration;
  const headerType = metadata?.aircraftDescription ?? metadata?.icaoTypeCode ?? aircraft.aircraftType ?? databaseAircraft?.aircraftType;
  const route = aircraft.enrichment?.route;
  const hasRouteData = Boolean(route && (route.origin || route.originAirport || route.destination || route.destinationAirport));
  const operator = route?.airline || metadata?.operator || null;
  const summary = trackingSummary(aircraft, historyTrail);
  const livePoint = aircraft.altitude === null ? null : { recordedAt: aircraft.lastSeen, altitude: aircraft.altitude };
  const chartPoints = historyTrail?.points ?? aircraft.trail ?? [];
  const emergency = aircraft.emergency && aircraft.emergency.toLowerCase() !== "none" ? aircraft.emergency : null;
  const emergencySquawk = aircraft.squawk && ["7500", "7600", "7700"].includes(aircraft.squawk) ? aircraft.squawk : null;
  const fullDetailHref = `/aircraft/${encodeURIComponent(aircraft.icaoHex)}`;
  const historyHref = `/history?hex=${encodeURIComponent(aircraft.icaoHex)}`;

  return <div className="aircraft-quick-detail detail-content" data-testid="aircraft-quick-detail">
    <header className="aircraft-quick-header">
      <div className="aircraft-quick-header-actions">
        <button type="button" className="detail-back-button" onClick={onBack}>{t.radar.trafficNearby}</button>
        <button type="button" className="close-button" onClick={onClose} aria-label={t.history.closeAircraftDetails}>×</button>
      </div>
      <div className="aircraft-quick-identity-row">
        <div className="aircraft-quick-identity">
          <span className="aircraft-quick-eyebrow">{t.history.aircraftDetail}</span>
          <h1>{aircraft.callsign || registration || aircraft.icaoHex}</h1>
          {(operator || registration || headerType) && <p>{[operator, registration, headerType].filter(Boolean).join(" · ")}</p>}
          <RouteSection route={route} callsign={aircraft.callsign || aircraft.icaoHex} visible={hasRouteData} />
        </div>
        <button type="button" className={`aircraft-quick-watchlist ${watchlisted ? "active" : ""}`} aria-pressed={watchlisted} aria-label={watchlisted ? t.watchlist.onWatchlist : t.watchlist.followAircraft} onClick={onToggleWatchlist}>
          <span aria-hidden="true">{watchlisted ? "★" : "☆"}</span>
        </button>
      </div>
    </header>

    {(emergency || emergencySquawk) && <div className="aircraft-quick-status-row" role="status">
      <StatusBadge variant="danger">{emergency ?? `${t.aircraft.squawk} ${emergencySquawk}`}</StatusBadge>
    </div>}

    <QuickSection id="aircraft-quick-metrics-title" title={t.aircraft.liveAdsb} className="aircraft-quick-metrics-section">
      <div className="aircraft-quick-metrics">
        <div><strong>{formatAltitude(aircraft.altitude)}</strong><span>{t.aircraft.altitude}</span></div>
        <div><strong>{formatSpeed(aircraft.groundSpeed)}</strong><span>{t.aircraft.groundSpeed}</span></div>
        <div><strong>{formatTrack(aircraft.track)}</strong><span>{t.aircraft.track}</span></div>
        <div><strong>{aircraft.verticalRate === null ? t.common.emptyValue : `${aircraft.verticalRate > 0 ? "+" : ""}${formatNumber(aircraft.verticalRate)} ft/min`}</strong><span>{t.aircraft.verticalRate}</span></div>
      </div>
    </QuickSection>

    <nav className="aircraft-quick-actions" aria-label={t.aircraft.quickActions}>
      <button type="button" className="aircraft-quick-action" onClick={onCenter} disabled={aircraft.lat === null || aircraft.lon === null}>{t.aircraft.centerOnAircraft}</button>
      <Link className="aircraft-quick-action" href={historyHref as `/history?hex=${string}`}>{t.aircraft.showFullTrail}</Link>
      <Link className="aircraft-quick-action primary" href={fullDetailHref as `/aircraft/${string}`}>{t.aircraft.fullDetail} <span aria-hidden="true">→</span></Link>
    </nav>

    <QuickSection id="aircraft-quick-tracking-title" title={t.aircraft.liveTrackingTitle} className="aircraft-quick-tracking">
      {summary.length > 0 && <p className="aircraft-quick-tracking-summary">{summary.join(" · ")}</p>}
      <AircraftAltitudeChart points={chartPoints} livePoint={livePoint} />
    </QuickSection>

    <AtcSection aircraft={aircraft} context={atcContext} sectorTraffic={sectorTraffic} />
    <AircraftIdentitySection aircraft={aircraft} databaseAircraft={databaseAircraft} />
    <RouteIntelligenceSection result={routeIntelligence} />
    {aircraft.enrichment?.route && <FlightRouteWeather compact originAirport={aircraft.enrichment.route.originAirport} destinationAirport={aircraft.enrichment.route.destinationAirport} />}
    <TechnicalDetails aircraft={aircraft} />
  </div>;
}
