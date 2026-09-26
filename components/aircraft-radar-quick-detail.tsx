"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";
import type { Airport } from "@/lib/airports/types";
import type { AtcContextResult } from "@/lib/atc-context/types";
import { buildAtcHandoffEstimate } from "@/lib/atc-context/handoff";
import type { AircraftView, FlightRoute } from "@/lib/aircraft/types";
import type { AircraftDetailMetadata, HistoryResponse } from "@/lib/server/history";
import type { AircraftSigmetContext } from "@/lib/weather/aircraft-sigmet-context";
import type { SigmetTrajectoryDeviation } from "@/lib/weather/sigmet-trajectory-deviation";
import type { AircraftDestinationWindContext, AircraftWindAheadProfile, AircraftWindContext } from "@/lib/weather/aircraft-wind-context";
import type { RadarLayerDataStatus } from "@/components/radar/use-radar-weather-context";
import { AircraftAltitudeChart, aircraftAirportHref } from "@/components/aircraft-detail-v2";
import { FlightRouteWeather } from "@/components/airport-weather";
import { aircraftPositionSourceLabel, aircraftSourceLabel, classifyAircraftSource } from "@/lib/aircraft/source-awareness";
import { StatusBadge } from "@/components/ui-primitives";
import {
  formatAge,
  formatAltitude,
  formatAtcFrequency,
  formatAtcLimit,
  formatAtcService,
  formatDistance,
  formatCoordinate,
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
  sigmetContext: AircraftSigmetContext[];
  sigmetDeviation: SigmetTrajectoryDeviation | null;
  sigmetStale: boolean;
  windContext: AircraftWindContext | null;
  windAhead: AircraftWindAheadProfile | null;
  destinationWind: AircraftDestinationWindContext | null;
  windStatus: RadarLayerDataStatus;
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

function RouteSection({ route, callsign, visible }: { route: FlightRoute | undefined; callsign?: string; visible: boolean }) {
  if (!visible || !route) return null;
  return <>
    <div className="aircraft-quick-header-route" aria-label={t.route.context}>
      <RouteEndpoint code={route.origin} airport={route.originAirport} />
      <span aria-hidden="true">→</span>
      {callsign && <span>{callsign}</span>}
      {callsign && <span aria-hidden="true">→</span>}
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
  const handoff = buildAtcHandoffEstimate(context);
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
      {handoff && <div className="aircraft-quick-atc-handoff" data-testid="atc-handoff-estimate">
        <DetailValue label={t.atc.handoffEstimate} value={handoff.toSectorName} />
        {handoff.publishedUnit && <DetailValue label={t.atc.handoffUnit} value={formatAtcService(handoff.publishedUnit)} />}
        {handoff.primaryFrequencyMhz !== null && <DetailValue label={t.atc.handoffFrequency} value={formatAtcFrequency(handoff.primaryFrequencyMhz)} />}
        <DetailValue label={t.atc.handoffEta} value={`~${formatNumber(handoff.distanceNm * 1.852, 0)} km · ~${Math.max(1, Math.round(handoff.estimatedSeconds / 60))} min`} />
        <DetailValue label={t.atc.relevantConfidence} value={t.atc.relevantConfidenceValues[handoff.confidence]} />
      </div>}
      {!handoff && nextSector && <DetailValue label={t.atc.nextSector} value={`${nextSector.airspace.name} · ~${formatNumber(nextSector.distanceNm * 1.852, 0)} km · ~${Math.max(1, Math.round(nextSector.estimatedSeconds / 60))} min`} />}
      {!nextSector && next && <DetailValue label={t.atc.contextNext} value={"identifier" in next ? `${next.identifier} · ${formatNumber(next.distanceNm, 0)} NM` : `${next.airspace.name} · ${formatNumber(next.distanceNm, 0)} NM`} />}
    </div>}
    {additionalFrequencies.length > 0 && <details className="aircraft-quick-atc-more">
      <summary>{t.atc.moreFrequencies}</summary>
      <div className="aircraft-quick-frequency-list">{additionalFrequencies.map((frequency) => <span key={frequency}>{formatAtcFrequency(frequency)}</span>)}</div>
    </details>}
    {handoff && <p className="aircraft-quick-disclaimer">{t.atc.handoffDisclaimer}</p>}
    <p className="aircraft-quick-disclaimer">{t.atc.contextDisclaimer}</p>
    {contextAirspace && <p className="aircraft-quick-disclaimer">Published sector: {contextAirspace.name}{traffic ? ` · Sector traffic: ${traffic.traffic.aircraftCount} aircraft · ${traffic.trafficLevel}` : " · Sector traffic: —"}. Aircraft is within the published sector volume. Traffic does not represent the official operational sector configuration.</p>}
  </QuickSection>;
}

function SigmetSection({ context, deviation, stale }: { context: AircraftSigmetContext[]; deviation: SigmetTrajectoryDeviation | null; stale: boolean }) {
  if (!context.length && !deviation) return null;
  const hasProjection = context.some((item) => item.relation === "projected");
  return <QuickSection id="aircraft-quick-sigmet-title" title={t.weather.sigmetAircraftTitle} className="aircraft-quick-sigmet">
    {deviation && <div className="aircraft-quick-weather-deviation" data-testid="sigmet-trajectory-deviation">
      <strong>{t.weather.sigmetDeviationSignal}</strong>
      <span>{deviation.hazard || deviation.phenomenon || t.weather.sigmetUnknownHazard}</span>
      <div className="aircraft-quick-detail-grid">
        <DetailValue label={t.weather.sigmetTurn} value={`${formatNumber(deviation.headingChangeDeg, 0)}°`} />
        <DetailValue label={t.weather.sigmetTracks} value={`${formatTrack(deviation.previousTrackDeg)} → ${formatTrack(deviation.currentTrackDeg)}`} />
        <DetailValue label={t.weather.sigmetPreviousProjection} value={`~${deviation.previousProjectedEntryMinutes} min · ~${formatNumber(deviation.previousProjectedEntryDistanceNm, 0)} NM`} />
        <DetailValue label={t.weather.sigmetCorrelationConfidence} value={deviation.confidence === "medium" ? t.weather.sigmetCorrelationMedium : t.weather.sigmetCorrelationLow} />
      </div>
      <p>{t.weather.sigmetDeviationSummary}</p>
    </div>}
    {context.length > 0 && <div className="aircraft-quick-detail-grid">
      {context.map((item) => {
        const hazard = item.hazard || item.phenomenon || t.weather.sigmetUnknownHazard;
        const limits = item.lowerFt !== null || item.upperFt !== null
          ? `${item.lowerFt === null ? t.common.emptyValue : formatAltitude(item.lowerFt)} – ${item.upperFt === null ? t.common.unlimited : formatAltitude(item.upperFt)}`
          : t.weather.sigmetAltitudeUnknown;
        return <div className="aircraft-quick-sigmet-item" key={item.id} data-testid="aircraft-sigmet-context">
          <DetailValue label={t.weather.sigmetHazard} value={hazard} />
          <DetailValue label={t.weather.sigmetRelation} value={item.relation === "current" ? t.weather.sigmetCurrent : t.weather.sigmetProjected} />
          {item.relation === "projected" && item.estimatedMinutes !== null && item.distanceNm !== null
            ? <DetailValue label={t.weather.sigmetProjectedEntry} value={`~${item.estimatedMinutes} min · ~${formatNumber(item.distanceNm, 0)} NM`} />
            : null}
          {item.firName && <DetailValue label={t.atc.contextFir} value={item.firName} />}
          <DetailValue label={t.weather.sigmetAltitude} value={limits} />
          <DetailValue label={t.weather.sigmetVerticalMatch} value={item.verticalMatch === "matched" ? t.weather.sigmetVerticalMatched : t.weather.sigmetVerticalUnknown} />
          {item.validTo && <DetailValue label={t.weather.sigmetValidTo} value={formatTime(item.validTo)} />}
        </div>;
      })}
    </div>}
    <p className="aircraft-quick-disclaimer">{stale
      ? t.weather.sigmetStaleWarning
      : deviation
        ? t.weather.sigmetDeviationDisclaimer
        : hasProjection
          ? t.weather.sigmetProjectionDisclaimer
          : t.weather.sigmetAircraftDisclaimer}</p>
  </QuickSection>;
}

function WindSection({ context, ahead, destination, status }: { context: AircraftWindContext | null; ahead: AircraftWindAheadProfile | null; destination: AircraftDestinationWindContext | null; status: RadarLayerDataStatus }) {
  if (!context && status !== "loading" && status !== "unavailable") return null;

  const alongTrack = context
    ? context.headwindKt >= context.tailwindKt
      ? `${t.weather.windHeadwind} ${formatNumber(context.headwindKt, 0)} kt`
      : `${t.weather.windTailwind} ${formatNumber(context.tailwindKt, 0)} kt`
    : null;
  const crosswind = context
    ? context.crosswindKt < 1
      ? t.weather.windCrosswindCalm
      : `${formatNumber(context.crosswindKt, 0)} kt · ${context.crosswindFrom === "right" ? t.weather.windFromRight : t.weather.windFromLeft}`
    : null;
  const trend = ahead
    ? ahead.trend === "more_headwind"
      ? t.weather.windAheadMoreHeadwind(formatNumber(Math.abs(ahead.deltaAlongTrackKt), 0), formatNumber(ahead.furthestDistanceNm, 0))
      : ahead.trend === "more_tailwind"
        ? t.weather.windAheadMoreTailwind(formatNumber(Math.abs(ahead.deltaAlongTrackKt), 0), formatNumber(ahead.furthestDistanceNm, 0))
        : ahead.trend === "variable"
          ? t.weather.windAheadVariable
          : t.weather.windAheadStable
    : null;

  return <QuickSection id="aircraft-quick-wind-title" title={t.weather.windAircraftTitle} className="aircraft-quick-wind">
    {context ? <>
      <div className="aircraft-quick-detail-grid" data-testid="aircraft-wind-context">
        <DetailValue label={t.weather.windModelLevel} value={`${context.model} · ${context.levelHpa} hPa (~${formatNumber(context.representativeAltitudeFt, 0)} ft)`} />
        <DetailValue label={t.weather.windVector} value={`${formatTrack(context.windFromDeg)} · ${formatNumber(context.windSpeedKt, 0)} kt`} />
        <DetailValue label={t.weather.windAlongTrack} value={alongTrack} />
        <DetailValue label={t.weather.windCrosswind} value={crosswind} />
        <DetailValue label={t.weather.windGridDistance} value={`~${formatNumber(context.sourceDistanceKm, 0)} km`} />
        <DetailValue label={t.weather.windValidAt} value={formatTime(context.validAt)} />
      </div>
      {ahead && <div className="aircraft-quick-wind-ahead" data-testid="aircraft-wind-ahead">
        <strong>{t.weather.windAheadTitle}</strong>
        {trend && <span>{trend}</span>}
        <div className="aircraft-quick-wind-ahead-grid">
          {ahead.points.map((point) => {
            const component = point.headwindKt >= point.tailwindKt
              ? `${t.weather.windHeadwind} ${formatNumber(point.headwindKt, 0)} kt`
              : `${t.weather.windTailwind} ${formatNumber(point.tailwindKt, 0)} kt`;
            const lateral = point.crosswindKt < 1
              ? t.weather.windCrosswindCalm
              : `${formatNumber(point.crosswindKt, 0)} kt ${point.crosswindFrom === "right" ? t.weather.windFromRight : t.weather.windFromLeft}`;
            return <div key={point.distanceNm} className="aircraft-quick-wind-ahead-point">
              <b>{formatNumber(point.distanceNm, 0)} NM</b>
              <span>{component}</span>
              <small>{lateral}</small>
            </div>;
          })}
        </div>
        <p>{t.weather.windAheadDisclaimer}</p>
      </div>}
      {destination && <div className="aircraft-quick-wind-destination" data-testid="aircraft-destination-wind">
        <strong>{t.weather.windDestinationTitle}</strong>
        <div className="aircraft-quick-detail-grid">
          <DetailValue label={t.weather.windDestinationBearing} value={formatTrack(destination.bearingDeg)} />
          <DetailValue label={t.weather.windDestinationDistance} value={`~${formatNumber(destination.distanceNm, 0)} NM`} />
          <DetailValue label={t.weather.windAlongTrack} value={destination.headwindKt >= destination.tailwindKt
            ? `${t.weather.windHeadwind} ${formatNumber(destination.headwindKt, 0)} kt`
            : `${t.weather.windTailwind} ${formatNumber(destination.tailwindKt, 0)} kt`} />
          <DetailValue label={t.weather.windCrosswind} value={destination.crosswindKt < 1
            ? t.weather.windCrosswindCalm
            : `${formatNumber(destination.crosswindKt, 0)} kt · ${destination.crosswindFrom === "right" ? t.weather.windFromRight : t.weather.windFromLeft}`} />
        </div>
        <p>{t.weather.windDestinationDisclaimer}</p>
      </div>}
      <p className="aircraft-quick-disclaimer">{context.stale || status === "stale" || status === "unavailable" ? t.weather.windStaleWarning : t.weather.windAircraftDisclaimer}</p>
    </> : <p className="aircraft-quick-disclaimer">{status === "loading" ? t.weather.windLoading : t.weather.windUnavailable}</p>}
  </QuickSection>;
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
  const observationAge = (value: string | null | undefined) => value ? formatAge(Math.max(0, (Date.now() - Date.parse(value)) / 1000)) : null;
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
      <DetailValue label={t.aircraft.dataSource} value={classifyAircraftSource(aircraft)} />
      <DetailValue label="Last LOCAL observation" value={observationAge(aircraft.provenance?.lastLocalSeen)} />
      <DetailValue label="Last NETWORK observation" value={observationAge(aircraft.provenance?.lastNetworkSeen)} />
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

type DetailTab = "overview" | "flight" | "aircraft" | "track" | "telemetry" | "data";

function flightPhase(aircraft: AircraftView): string | null {
  if (aircraft.onGround) return t.aircraft.phaseOnGround;
  if (aircraft.verticalRate === null) return null;
  if (aircraft.verticalRate > 100) return t.aircraft.phaseAscending;
  if (aircraft.verticalRate < -100) return t.aircraft.phaseDescending;
  return t.aircraft.phaseLevel;
}

function verticalRateLabel(value: number | null): string {
  if (value === null) return t.common.emptyValue;
  return `${value > 0 ? "↑" : value < 0 ? "↓" : "→"} ${formatNumber(Math.abs(value))} ft/min`;
}

function AircraftOverview({ aircraft, registration, operator, headerType, sourceAge, phase, emergency, emergencySquawk, onCenter, historyHref, fullDetailHref }: {
  aircraft: AircraftView;
  registration: string | null;
  operator: string | null;
  headerType: string | null;
  sourceAge: string | null;
  phase: string | null;
  emergency: string | null;
  emergencySquawk: string | null;
  onCenter: () => void;
  historyHref: string;
  fullDetailHref: string;
}) {
  return <div className="aircraft-quick-tab-panel" role="tabpanel" id="aircraft-tabpanel-overview" aria-labelledby="aircraft-tab-overview">
    <section className="aircraft-quick-overview" aria-labelledby="aircraft-overview-title">
      <h2 id="aircraft-overview-title">{t.aircraft.detailSections.overview}</h2>
      <div className="aircraft-quick-summary-line">
        <div><strong>{aircraft.callsign || registration || aircraft.icaoHex}</strong><span>{operator || t.aircraft.unknownAirline}</span></div>
        <div className="aircraft-quick-summary-type"><strong>{headerType || t.aircraft.unknownAircraftType}</strong><span>{registration || t.aircraft.unknownRegistration}</span></div>
      </div>
      <div className="aircraft-quick-source-line">
        {sourceAge && <span>{t.aircraft.positionAge}: {sourceAge}</span>}
        {phase && <strong>{phase}</strong>}
      </div>
      {emergency || emergencySquawk ? <div className="aircraft-quick-status-row" role="status"><StatusBadge variant="danger">{emergency ?? `${t.aircraft.squawk} ${emergencySquawk}`}</StatusBadge></div> : null}
      <div className="aircraft-quick-metrics">
        <div><strong>{formatAltitude(aircraft.altitude)}</strong><span>{t.aircraft.altitude}</span></div>
        <div><strong>{formatSpeed(aircraft.groundSpeed)}</strong><span>{t.aircraft.groundSpeed}</span></div>
        <div><strong>{formatTrack(aircraft.track)}</strong><span>{t.aircraft.track}</span></div>
        <div><strong>{verticalRateLabel(aircraft.verticalRate)}</strong><span>{t.aircraft.verticalRate}</span></div>
      </div>
      <nav className="aircraft-quick-actions" aria-label={t.aircraft.quickActions}>
        <button type="button" className="aircraft-quick-action" onClick={onCenter} disabled={aircraft.lat === null || aircraft.lon === null}>{t.aircraft.centerOnAircraft}</button>
        <Link className="aircraft-quick-action" href={historyHref as `/history?hex=${string}`}>{t.aircraft.showFullTrail}</Link>
        <Link className="aircraft-quick-action primary" href={fullDetailHref as `/aircraft/${string}`}>{t.aircraft.fullDetail} <span aria-hidden="true">→</span></Link>
      </nav>
    </section>
  </div>;
}

function TelemetrySection({ aircraft }: { aircraft: AircraftView }) {
  const position = aircraft.lat === null || aircraft.lon === null ? null : `${formatCoordinate(aircraft.lat)}, ${formatCoordinate(aircraft.lon)}`;
  return <div className="aircraft-quick-tab-panel" role="tabpanel" id="aircraft-tabpanel-telemetry" aria-labelledby="aircraft-tab-telemetry">
    <QuickSection id="aircraft-quick-telemetry-title" title={t.aircraft.detailSections.telemetry} className="aircraft-quick-telemetry">
      <div className="aircraft-quick-detail-grid">
        <DetailValue label={t.aircraft.seenPosition} value={aircraft.seenPosSeconds === null ? null : formatAge(aircraft.seenPosSeconds)} />
        <DetailValue label={t.aircraft.position} value={position} />
        <DetailValue label={t.aircraft.altitude} value={formatAltitude(aircraft.altitude)} />
        <DetailValue label={t.aircraft.track} value={formatTrack(aircraft.track)} />
        <DetailValue label={t.aircraft.verticalRate} value={verticalRateLabel(aircraft.verticalRate)} />
        <DetailValue label={t.aircraft.groundSpeed} value={formatSpeed(aircraft.groundSpeed)} />
        <DetailValue label={t.aircraft.rssi} value={aircraft.rssi === null ? null : `${formatNumber(aircraft.rssi, 1)} dBFS`} />
        <DetailValue label={t.aircraft.messages} value={formatNumber(aircraft.messages)} />
      </div>
    </QuickSection>
  </div>;
}

function DataSection({ aircraft }: { aircraft: AircraftView }) {
  const observationAge = (value: string | null | undefined) => value ? formatAge(Math.max(0, (Date.now() - Date.parse(value)) / 1000)) : null;
  return <div className="aircraft-quick-tab-panel" role="tabpanel" id="aircraft-tabpanel-data" aria-labelledby="aircraft-tab-data">
    <QuickSection id="aircraft-quick-data-title" title={t.aircraft.detailSections.data} className="aircraft-quick-data">
      <div className="aircraft-quick-data-source"><span className="source-badge source-badge-prominent">{aircraftPositionSourceLabel(aircraft)}</span><span>{t.aircraft.positionSource}</span></div>
      <div className="aircraft-quick-detail-grid">
        <DetailValue label={t.aircraft.seenBy} value={aircraftSourceLabel(aircraft)} />
        <DetailValue label={t.aircraft.dataSource} value={classifyAircraftSource(aircraft)} />
        <DetailValue label={t.aircraft.source} value={aircraft.sourceType ?? aircraft.source} />
        <DetailValue label={t.aircraft.positionOrigin} value={aircraft.provenance?.positionOrigin ?? null} />
        <DetailValue label={t.aircraft.lastLocalObservation} value={observationAge(aircraft.provenance?.lastLocalSeen)} />
        <DetailValue label={t.aircraft.lastNetworkObservation} value={observationAge(aircraft.provenance?.lastNetworkSeen)} />
        <DetailValue label={t.route.source} value={aircraft.enrichment?.route?.source} />
        <DetailValue label={t.aircraft.metadata} value={aircraft.enrichment?.metadata?.source} />
      </div>
      <TechnicalDetails aircraft={aircraft} />
    </QuickSection>
  </div>;
}

function DetailTabs({ activeTab, onChange }: { activeTab: DetailTab; onChange: (tab: DetailTab) => void }) {
  const tabs: Array<{ id: DetailTab; label: string }> = [
    { id: "overview", label: t.aircraft.detailSections.overview },
    { id: "flight", label: t.aircraft.detailSections.flight },
    { id: "aircraft", label: t.aircraft.detailSections.aircraft },
    { id: "track", label: t.aircraft.detailSections.track },
    { id: "telemetry", label: t.aircraft.detailSections.telemetry },
    { id: "data", label: t.aircraft.detailSections.data },
  ];
  function moveTab(event: React.KeyboardEvent<HTMLButtonElement>, current: DetailTab): void {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const currentIndex = tabs.findIndex((tab) => tab.id === current);
    const nextIndex = event.key === "ArrowRight"
      ? (currentIndex + 1) % tabs.length
      : (currentIndex - 1 + tabs.length) % tabs.length;
    const next = tabs[nextIndex];
    onChange(next.id);
    window.requestAnimationFrame(() => document.getElementById(`aircraft-tab-${next.id}`)?.focus());
  }
  return <div className="aircraft-quick-tabs" role="tablist" aria-label={t.history.aircraftDetail}>
    {tabs.map((tab) => <button key={tab.id} type="button" role="tab" id={`aircraft-tab-${tab.id}`} aria-selected={activeTab === tab.id} aria-controls={`aircraft-tabpanel-${tab.id}`} tabIndex={activeTab === tab.id ? 0 : -1} className={activeTab === tab.id ? "active" : ""} onClick={() => onChange(tab.id)} onKeyDown={(event) => moveTab(event, tab.id)}>{tab.label}</button>)}
  </div>;
}

export function AircraftRadarQuickDetail({
  aircraft,
  databaseAircraft,
  historyTrail,
  atcContext,
  sigmetContext,
  sigmetDeviation,
  sigmetStale,
  windContext,
  windAhead,
  destinationWind,
  windStatus,
  watchlisted,
  onBack,
  onClose,
  onCenter,
  onToggleWatchlist,
  sectorTraffic,
}: AircraftRadarQuickDetailProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
  const metadata = aircraft.enrichment?.metadata;
  const registration: string | null = aircraft.registration ?? metadata?.registration ?? databaseAircraft?.registration ?? null;
  const headerType = metadata?.icaoTypeCode ?? aircraft.aircraftType ?? databaseAircraft?.aircraftType ?? null;
  const route = aircraft.enrichment?.route;
  const hasRouteData = Boolean(route && (route.origin || route.originAirport || route.destination || route.destinationAirport));
  const operator: string | null = route?.airline || metadata?.operator || null;
  const summary = trackingSummary(aircraft, historyTrail);
  const livePoint = aircraft.altitude === null ? null : { recordedAt: aircraft.lastSeen, altitude: aircraft.altitude };
  const chartPoints = historyTrail?.points ?? aircraft.trail ?? [];
  const emergency = aircraft.emergency && aircraft.emergency.toLowerCase() !== "none" ? aircraft.emergency : null;
  const emergencySquawk = aircraft.squawk && ["7500", "7600", "7700"].includes(aircraft.squawk) ? aircraft.squawk : null;
  const sourceAge = aircraft.seenPosSeconds === null ? null : formatAge(aircraft.seenPosSeconds);
  const phase = flightPhase(aircraft);
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
          {(operator || registration) && <p>{[operator, registration].filter(Boolean).join(" · ")}</p>}
          <div className="aircraft-quick-header-type">{headerType || t.aircraft.unknownAircraftType}</div>
          <RouteSection route={route} visible={hasRouteData} />
        </div>
        <button type="button" className={`aircraft-quick-watchlist ${watchlisted ? "active" : ""}`} aria-pressed={watchlisted} aria-label={watchlisted ? t.watchlist.onWatchlist : t.watchlist.followAircraft} onClick={onToggleWatchlist}>
          <span aria-hidden="true">{watchlisted ? "★" : "☆"}</span>
        </button>
      </div>
    </header>

    <div className="aircraft-quick-source-header"><span className="source-badge source-badge-prominent">{aircraftPositionSourceLabel(aircraft)}</span>{sourceAge && <span>{t.aircraft.positionAge}: {sourceAge}</span>}{phase && <strong>{phase}</strong>}</div>
    <DetailTabs activeTab={activeTab} onChange={setActiveTab} />
    {activeTab === "overview" && <AircraftOverview aircraft={aircraft} registration={registration} operator={operator} headerType={headerType} sourceAge={sourceAge} phase={phase} emergency={emergency} emergencySquawk={emergencySquawk} onCenter={onCenter} historyHref={historyHref} fullDetailHref={fullDetailHref} />}
    {activeTab === "flight" && <div className="aircraft-quick-tab-panel" role="tabpanel" id="aircraft-tabpanel-flight" aria-labelledby="aircraft-tab-flight">
      <QuickSection id="aircraft-quick-flight-title" title={t.aircraft.detailSections.flight} className="aircraft-quick-flight">
        <RouteSection route={route} callsign={aircraft.callsign || aircraft.icaoHex} visible={hasRouteData} />
        {!hasRouteData && <p className="aircraft-quick-empty">{t.aircraft.noRouteData}</p>}
      </QuickSection>
      <AtcSection aircraft={aircraft} context={atcContext} sectorTraffic={sectorTraffic} />
      <SigmetSection context={sigmetContext} deviation={sigmetDeviation} stale={sigmetStale} />
      <WindSection context={windContext} ahead={windAhead} destination={destinationWind} status={windStatus} />
      {route && <FlightRouteWeather compact originAirport={route.originAirport} destinationAirport={route.destinationAirport} />}
    </div>}
    {activeTab === "aircraft" && <div className="aircraft-quick-tab-panel" role="tabpanel" id="aircraft-tabpanel-aircraft" aria-labelledby="aircraft-tab-aircraft"><AircraftIdentitySection aircraft={aircraft} databaseAircraft={databaseAircraft} /></div>}
    {activeTab === "track" && <div className="aircraft-quick-tab-panel" role="tabpanel" id="aircraft-tabpanel-track" aria-labelledby="aircraft-tab-track"><QuickSection id="aircraft-quick-tracking-title" title={t.aircraft.detailSections.track} className="aircraft-quick-tracking">{summary.length > 0 && <p className="aircraft-quick-tracking-summary">{summary.join(" · ")}</p>}<AircraftAltitudeChart points={chartPoints} livePoint={livePoint} /></QuickSection></div>}
    {activeTab === "telemetry" && <TelemetrySection aircraft={aircraft} />}
    {activeTab === "data" && <DataSection aircraft={aircraft} />}
  </div>;
}
