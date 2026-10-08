"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { Airport } from "@/lib/airports/types";
import type { AtcContextResult } from "@/lib/atc-context/types";
import { buildAtcHandoffEstimate } from "@/lib/atc-context/handoff";
import type { AircraftView, FlightRoute } from "@/lib/aircraft/types";
import type { AircraftDetailMetadata, HistoryResponse } from "@/lib/server/history";
import type { AircraftSigmetContext } from "@/lib/weather/aircraft-sigmet-context";
import type { SigmetTrajectoryDeviation } from "@/lib/weather/sigmet-trajectory-deviation";
import type { WeatherAvoidanceIntelligence } from "@/lib/weather/avoidance-intelligence";
import type { AircraftDestinationWindContext, AircraftWindAheadProfile, AircraftWindContext } from "@/lib/weather/aircraft-wind-context";
import type { RouteWeatherContext } from "@/lib/weather/route-weather-context";
import type { RouteCorridorSnapshot, TrajectoryConformanceSnapshot } from "@/lib/route-intelligence";
import type { OperationalTwinApiResponse } from "@/lib/operational-twin/types";
import type { AircraftOperationalFocusChangeSummary } from "@/lib/operational-twin/aircraft-operational-focus-change";
import { useNavigationIntegrityContext } from "@/components/radar/use-navigation-integrity-context";
import { buildFlightSituationSummary, type FlightSituationSummary } from "@/lib/intelligence/flight-situation-summary";
import type { FlightIntelligenceEvent, FlightPhase } from "@/lib/intelligence/types";
import type { RadarLayerDataStatus } from "@/components/radar/use-radar-weather-context";
import { AircraftAltitudeChart, aircraftAirportHref } from "@/components/aircraft-detail-v2";
import { FlightRouteWeather } from "@/components/airport-weather";
import { aircraftPositionSourceLabel, aircraftSourceLabel, classifyAircraftSource } from "@/lib/aircraft/source-awareness";
import { StatusBadge } from "@/components/ui-primitives";
import { RadarTrafficHero } from "@/components/radar/radar-traffic-hero";
import { RadarOperationalFocusSummary } from "@/components/radar/radar-operational-focus-summary";
import { AircraftAdsbTelemetry } from "@/components/aircraft-adsb-telemetry";
import { AircraftObservedWeather } from "@/components/aircraft-observed-weather";
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
import { trafficSourcePresentation } from "@/lib/radar/traffic-presentation";
import { stableAltitudeProfile } from "@/lib/radar/altitude-profile";

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
  weatherAvoidance: WeatherAvoidanceIntelligence | null;
  sigmetStale: boolean;
  windContext: AircraftWindContext | null;
  windAhead: AircraftWindAheadProfile | null;
  destinationWind: AircraftDestinationWindContext | null;
  windStatus: RadarLayerDataStatus;
  routeWeather: RouteWeatherContext | null;
  routeCorridor?: RouteCorridorSnapshot | null;
  routeConformance?: TrajectoryConformanceSnapshot | null;
  intelligenceEvents?: FlightIntelligenceEvent[];
  operationalTwin?: OperationalTwinApiResponse | null;
  operationalFocusChanges?: AircraftOperationalFocusChangeSummary | null;
  operationalFocusItemId?: string | null;
  operationalFocusRevealVersion?: number;
  onOperationalFocus?: (itemId: string) => void;
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
  return <span className="aircraft-quick-route-endpoint">
    {airport ? <Link className="airport-link" href={aircraftAirportHref(airport.icaoCode)}>{label}</Link> : <strong>{label}</strong>}
    {airport?.name && <small>{airport.name}</small>}
  </span>;
}

function RouteSection({ route, visible }: { route: FlightRoute | undefined; visible: boolean }) {
  if (!visible || !route) return null;
  return <>
    <div className="aircraft-quick-header-route" aria-label={t.route.context}>
      <RouteEndpoint code={route.origin} airport={route.originAirport} />
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
  const firstSeen = historyTrail?.flight?.startedAt ?? historyTrail?.points?.[0]?.recordedAt ?? null;
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

function SigmetSection({ context, deviation, avoidance, stale }: { context: AircraftSigmetContext[]; deviation: SigmetTrajectoryDeviation | null; avoidance: WeatherAvoidanceIntelligence | null; stale: boolean }) {
  if (!context.length && !deviation && !avoidance) return null;
  const hasProjection = context.some((item) => item.relation === "projected");
  const currentExposure = avoidance
    ? avoidance.currentExposure.intersects === null
      ? t.weather.weatherAvoidanceCurrentUnknown
      : avoidance.currentExposure.intersects
        ? t.weather.weatherAvoidanceCurrentExposed(
            avoidance.currentExposure.entryMinutes === null ? t.common.emptyValue : formatNumber(avoidance.currentExposure.entryMinutes, 0),
            avoidance.currentExposure.distanceNm === null ? t.common.emptyValue : formatNumber(avoidance.currentExposure.distanceNm, 0),
          )
        : t.weather.weatherAvoidanceCurrentClear
    : null;
  return <QuickSection id="aircraft-quick-sigmet-title" title={t.weather.sigmetAircraftTitle} className="aircraft-quick-sigmet">
    {avoidance ? <div className="aircraft-quick-weather-deviation" data-testid="weather-avoidance-intelligence-v1" data-classification={avoidance.classification}>
      <strong>{t.weather.weatherAvoidanceClassification[avoidance.classification]}</strong>
      <span>{avoidance.hazard || avoidance.phenomenon || t.weather.sigmetUnknownHazard}</span>
      <div className="aircraft-quick-detail-grid">
        <DetailValue label={t.weather.sigmetTurn} value={`${formatNumber(avoidance.headingChangeDeg, 0)}°`} />
        <DetailValue label={t.weather.sigmetTracks} value={`${formatTrack(avoidance.previousTrackDeg)} → ${formatTrack(avoidance.currentTrackDeg)}`} />
        <DetailValue label={t.weather.weatherAvoidancePreviousExposure} value={`~${avoidance.previousExposure.entryMinutes ?? t.common.emptyValue} min · ~${avoidance.previousExposure.distanceNm === null ? t.common.emptyValue : formatNumber(avoidance.previousExposure.distanceNm, 0)} NM`} />
        <DetailValue label={t.weather.weatherAvoidanceCurrentExposure} value={currentExposure} />
        {avoidance.conformanceStatus && <DetailValue label={t.weather.weatherAvoidanceConformance} value={t.routeConformance.statuses[avoidance.conformanceStatus]} />}
        <DetailValue label={t.weather.weatherAvoidanceConfidence} value={t.weather.weatherFusionConfidence[avoidance.confidence]} />
      </div>
      <p>{avoidance.classification === "POSSIBLE_WEATHER_AVOIDANCE"
        ? t.weather.weatherAvoidancePossibleSummary
        : avoidance.classification === "CURRENT_CORRIDOR_EXPOSED"
          ? t.weather.weatherAvoidanceExposedSummary
          : t.weather.weatherAvoidanceCorrelatedSummary}</p>
    </div> : deviation && <div className="aircraft-quick-weather-deviation" data-testid="sigmet-trajectory-deviation">
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
      : avoidance
        ? t.weather.weatherAvoidanceDisclaimer
        : deviation
          ? t.weather.sigmetDeviationDisclaimer
        : hasProjection
          ? t.weather.sigmetProjectionDisclaimer
          : t.weather.sigmetAircraftDisclaimer}</p>
  </QuickSection>;
}

function corridorEta(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (value < 1) return "<1 min";
  return `~${formatNumber(value, 0)} min`;
}

function RouteCorridorSection({ corridor, conformance }: { corridor: RouteCorridorSnapshot | null; conformance: TrajectoryConformanceSnapshot | null }) {
  if (!corridor) return null;
  const next = corridor.nextPoint
    ? `${corridor.nextPoint.name}${corridor.distanceToNextNm === null ? "" : ` · ${formatNumber(corridor.distanceToNextNm, 1)} NM`}${corridor.etaToNextMinutes === null ? "" : ` · ${corridorEta(corridor.etaToNextMinutes)}`}`
    : t.common.emptyValue;
  const remaining = corridor.remainingDistanceNm === null
    ? t.common.emptyValue
    : `${corridor.remainingDistanceComplete ? "" : "~"}${formatNumber(corridor.remainingDistanceNm, 0)} NM${corridor.etaRemainingMinutes === null ? "" : ` · ${corridorEta(corridor.etaRemainingMinutes)}`}${corridor.remainingDistanceComplete ? "" : ` · ${t.routeCorridor.partialDistance}`}`;
  return <QuickSection id="aircraft-quick-route-corridor-title" title={t.routeCorridor.title} className="aircraft-quick-route-corridor">
    <div className="aircraft-quick-detail-grid" data-testid="route-corridor-intelligence">
      <DetailValue label={t.routeCorridor.status} value={t.routeCorridor.statuses[corridor.status]} />
      <DetailValue label={t.routeCorridor.progress} value={corridor.progressPercent === null ? null : `${formatNumber(corridor.progressPercent, 0)} %`} />
      <DetailValue label={t.routeCorridor.nextPoint} value={next} />
      <DetailValue label={t.routeCorridor.remaining} value={remaining} />
      <DetailValue label={t.routeCorridor.crossTrack} value={corridor.crossTrackDeviationNm === null ? null : `${formatNumber(corridor.crossTrackDeviationNm, 1)} NM`} />
      <DetailValue label={t.routeCorridor.expectedTrack} value={corridor.expectedTrackDeg === null ? null : formatTrack(corridor.expectedTrackDeg)} />
      <DetailValue label={t.routeCorridor.trackDelta} value={corridor.trackDeltaDeg === null ? null : `${formatNumber(corridor.trackDeltaDeg, 0)}°`} />
      <DetailValue label={t.routeCorridor.confidence} value={t.routeCorridor.confidenceValues[corridor.confidence]} />
      {conformance && <DetailValue label={t.routeConformance.status} value={t.routeConformance.statuses[conformance.status]} />}
      {conformance && <DetailValue label={t.routeConformance.confidence} value={t.routeConformance.confidenceValues[conformance.confidence]} />}
      {conformance?.probableDirect && <DetailValue
        label={t.routeConformance.probableDirect}
        value={t.routeConformance.directSummary(conformance.probableDirect.skippedElements, conformance.probableDirect.rejoinedAt)}
      />}
    </div>
    <p className="aircraft-quick-disclaimer">{t.routeCorridor.disclaimer}</p>
    {conformance && <p className="aircraft-quick-disclaimer">{t.routeConformance.disclaimer}</p>}
  </QuickSection>;
}

function RouteWeatherSection({ context }: { context: RouteWeatherContext | null }) {
  if (!context || context.status === "no_route") return null;
  if (context.status === "unavailable" && context.matches.length === 0) return null;
  const unresolved = context.unresolvedRouteTokens.length;
  return <QuickSection id="aircraft-quick-route-weather-title" title={t.weather.routeWeatherTitle} className="aircraft-quick-route-weather">
    {context.matches.length ? <div className="aircraft-quick-route-weather-list">
      {context.matches.slice(0, 5).map((match) => <div key={`${match.sigmetId}:${match.segmentId}`} className="aircraft-quick-route-weather-item" data-testid="route-weather-match">
        <strong>{match.hazard || t.weather.sigmetUnknownHazard}</strong>
        <span>{match.routeDesignator} · {match.fromName} → {match.toName}</span>
        <small>{t.weather.routeWeatherDistance(formatNumber(match.distanceAlongRouteNm, 0))}</small>
        <small>{match.verticalMatch === "matched" ? t.weather.routeWeatherVerticalMatched : t.weather.routeWeatherVerticalUnknown}</small>
      </div>)}
    </div> : <p className="aircraft-quick-empty">{t.weather.routeWeatherClear}</p>}
    <div className="aircraft-quick-detail-grid">
      <DetailValue label={t.weather.routeWeatherCoverage} value={context.routeCoveragePercent === null ? t.common.emptyValue : `${formatNumber(context.routeCoveragePercent, 0)} %`} />
      <DetailValue label={t.weather.routeWeatherSource} value={context.routeSource || t.common.emptyValue} />
    </div>
    {unresolved > 0 && <p className="aircraft-quick-disclaimer">{t.weather.routeWeatherUnresolved(formatNumber(unresolved))}</p>}
    <p className="aircraft-quick-disclaimer">{context.stale ? t.weather.routeWeatherStale : t.weather.routeWeatherDisclaimer}</p>
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
      <DetailValue label={t.aircraft.beastSignal} value={aircraft.beastSignal === null || aircraft.beastSignal === undefined ? null : formatNumber(aircraft.beastSignal)} />
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
      <DetailValue label={t.uiExtras.localObservation} value={observationAge(aircraft.provenance?.lastLocalSeen)} />
      <DetailValue label={t.uiExtras.networkObservation} value={observationAge(aircraft.provenance?.lastNetworkSeen)} />
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

type DetailTab = "flight" | "situation" | "aircraft" | "data";

function verticalRateLabel(value: number | null): string {
  if (value === null) return t.common.emptyValue;
  return `${value > 0 ? "↑" : value < 0 ? "↓" : "→"} ${formatNumber(Math.abs(value))} ft/min`;
}

function compactVerticalRateLabel(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return t.common.emptyValue;
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatNumber(Math.abs(value), 0)} fpm`;
}

function SituationSummarySection({ summary }: { summary: FlightSituationSummary }) {
  const hasMeaningfulContext = Boolean(
    summary.currentSector
      || summary.nextSector
      || summary.weatherState !== "unknown"
      || summary.windKind !== "unknown"
      || summary.windTrend
      || summary.routeDeviationNearSigmet,
  );
  if (!hasMeaningfulContext) return null;

  const atc = summary.currentSector
    ? [summary.currentSector, summary.currentUnit].filter(Boolean).join(" · ")
    : t.common.emptyValue;
  const next = summary.nextSector && summary.nextSectorMinutes !== null
    ? t.intelligence.situationNextSector(summary.nextSector, formatNumber(summary.nextSectorMinutes, 0))
    : null;
  const hazard = summary.weatherHazard || t.weather.sigmetUnknownHazard;
  const weather = summary.weatherState === "current_sigmet"
    ? t.intelligence.situationWeatherCurrent(hazard)
    : summary.weatherState === "route_sigmet" && summary.weatherDistanceNm !== null
      ? t.intelligence.situationWeatherRoute(hazard, formatNumber(summary.weatherDistanceNm, 0))
      : summary.weatherState === "projected_sigmet" && summary.weatherDistanceNm !== null
        ? t.intelligence.situationWeatherProjected(hazard, formatNumber(summary.weatherDistanceNm, 0))
        : summary.weatherState === "clear"
          ? t.intelligence.situationWeatherClear
          : t.intelligence.situationWeatherUnknown;
  const wind = summary.windKind === "headwind" && summary.windKt !== null
    ? t.intelligence.situationHeadwind(formatNumber(summary.windKt, 0))
    : summary.windKind === "tailwind" && summary.windKt !== null
      ? t.intelligence.situationTailwind(formatNumber(summary.windKt, 0))
      : summary.windKind === "calm"
        ? t.intelligence.situationWindCalm
        : t.intelligence.situationWindUnknown;
  const windTrend = summary.windTrend === "more_headwind" && summary.windTrendDeltaKt !== null
    ? t.intelligence.situationWindTrendHead(formatNumber(summary.windTrendDeltaKt, 0))
    : summary.windTrend === "more_tailwind" && summary.windTrendDeltaKt !== null
      ? t.intelligence.situationWindTrendTail(formatNumber(summary.windTrendDeltaKt, 0))
      : summary.windTrend === "variable"
        ? t.intelligence.situationWindTrendVariable
        : null;

  return <QuickSection id="aircraft-situation-summary-title" title={t.intelligence.situationTitle} className="aircraft-quick-situation">
    <div className="aircraft-quick-detail-grid" data-testid="flight-situation-summary">
      <DetailValue label={t.intelligence.situationAtc} value={next ? `${atc} · ${next}` : atc} />
      <DetailValue label={t.intelligence.situationWeather} value={weather} />
      <DetailValue label={t.intelligence.situationWind} value={windTrend ? `${wind} ${windTrend}` : wind} />
    </div>
    {summary.routeDeviationNearSigmet && <p className="aircraft-quick-situation-signal">{t.intelligence.situationDeviation}</p>}
    <p className="aircraft-quick-disclaimer">{t.intelligence.situationDisclaimer}</p>
  </QuickSection>;
}

function NavigationIntegritySection({ aircraft }: { aircraft: AircraftView }) {
  const context = useNavigationIntegrityContext(aircraft.icaoHex);
  const latest = context?.latest;
  const classification = context?.classification;
  const anomaly = context?.regionalContext.anomaly;
  if (!latest && !anomaly) return null;
  const stateKey = classification?.state.toLowerCase() as keyof typeof t.navigationIntegrity.states | undefined;
  const confidenceKey = classification && classification.state !== "NORMAL" && classification.state !== "UNKNOWN"
    ? latest?.confidence.toLowerCase() as keyof typeof t.navigationIntegrity.confidence | undefined
    : null;

  return <QuickSection id="aircraft-quick-navigation-integrity-title" title={t.navigationIntegrity.title} className="aircraft-quick-navigation-integrity">
    <div className="aircraft-quick-detail-grid" data-testid="navigation-integrity-situation">
      <DetailValue label={t.navigationIntegrity.title} value={stateKey ? t.navigationIntegrity.states[stateKey] : t.navigationIntegrity.noCurrentData} />
      <DetailValue label={t.navigationIntegrity.source} value={latest?.source} />
      <DetailValue label={t.navigationIntegrity.confidenceLabel} value={confidenceKey ? t.navigationIntegrity.confidence[confidenceKey] : null} />
      <DetailValue label={t.navigationIntegrity.fields.nic} value={latest?.nic === null || latest?.nic === undefined ? null : String(latest.nic)} />
      <DetailValue label={t.navigationIntegrity.fields.nacP} value={latest?.nacP === null || latest?.nacP === undefined ? null : String(latest.nacP)} />
      <DetailValue label={t.navigationIntegrity.fields.nacV} value={latest?.nacV === null || latest?.nacV === undefined ? null : String(latest.nacV)} />
      <DetailValue label={t.navigationIntegrity.fields.sil} value={latest?.sil === null || latest?.sil === undefined ? null : String(latest.sil)} />
      <DetailValue label={t.navigationIntegrity.fields.sda} value={latest?.sda === null || latest?.sda === undefined ? null : String(latest.sda)} />
      <DetailValue label={t.navigationIntegrity.fields.gva} value={latest?.gva === null || latest?.gva === undefined ? null : String(latest.gva)} />
      <DetailValue label={t.navigationIntegrity.fields.adsbVersion} value={latest?.adsbVersion === null || latest?.adsbVersion === undefined ? null : String(latest.adsbVersion)} />
      {anomaly && <DetailValue label={t.navigationIntegrity.regionalContext} value={`${t.navigationIntegrity.affectedAircraft}: ${formatNumber(context?.regionalContext.affectedAircraft ?? anomaly.affectedAircraftCount)}`} />}
    </div>
    {anomaly && <p className="aircraft-quick-situation-signal">{t.navigationIntegrity.possibleInterference}</p>}
    <p className="aircraft-quick-disclaimer">{t.navigationIntegrity.aircraftDisclaimer}</p>
  </QuickSection>;
}

function phaseLabel(phase: FlightPhase | null): string | null {
  return phase ? t.intelligence.phaseLabels[phase] : null;
}

function IntelligenceSection({ events }: { events: FlightIntelligenceEvent[] }) {
  const meaningful = events.filter((event) => !["HOLDING_CANDIDATE", "AIRSPACE_ENTRY", "AIRSPACE_EXIT"].includes(event.type)).slice(0, 4);
  if (!meaningful.length) return null;
  return <QuickSection id="aircraft-quick-intelligence-title" title={t.intelligence.aircraftSectionTitle} className="aircraft-quick-intelligence">
    <ul className="aircraft-quick-event-list">
      {meaningful.map((event) => <li key={event.eventKey}>
        <time dateTime={event.occurredAt}>{formatTime(event.occurredAt)}</time>
        <span>{t.intelligence.types[event.type]}</span>
        <small>{t.intelligence.confidence[event.confidenceLevel]}</small>
      </li>)}
    </ul>
  </QuickSection>;
}

function AircraftOverview({ aircraft, emergency, emergencySquawk, onCenter, historyHref, fullDetailHref, watchlisted, onToggleWatchlist, historyTrail }: {
  aircraft: AircraftView;
  emergency: string | null;
  emergencySquawk: string | null;
  onCenter: () => void;
  historyHref: string;
  fullDetailHref: string;
  watchlisted: boolean;
  onToggleWatchlist: () => void;
  historyTrail: QuickHistoryTrail | null;
}) {
  const summary = trackingSummary(aircraft, historyTrail);
  const livePoint = aircraft.altitude === null ? null : { recordedAt: aircraft.lastSeen, altitude: aircraft.altitude };
  const chartPoints = historyTrail?.points ?? aircraft.trail ?? [];
  const stableAltitude = stableAltitudeProfile(chartPoints, livePoint);
  return <>
    <section className="aircraft-quick-overview" aria-labelledby="aircraft-flight-overview-title">
      <div className="aircraft-quick-flight-heading">
        <h2 id="aircraft-flight-overview-title">{t.aircraft.detailSections.flight}</h2>
        <span className="aircraft-quick-live-state"><span aria-hidden="true">●</span> {t.status.liveShort}</span>
      </div>
      {emergency || emergencySquawk ? <div className="aircraft-quick-status-row" role="status"><StatusBadge variant="danger">{emergency ?? `${t.aircraft.squawk} ${emergencySquawk}`}</StatusBadge></div> : null}
      <nav className="aircraft-quick-actions" aria-label={t.aircraft.quickActions}>
        <button type="button" className="aircraft-quick-action" onClick={onCenter} disabled={aircraft.lat === null || aircraft.lon === null}>{t.aircraft.centerOnAircraft}</button>
        <button type="button" className={`aircraft-quick-action${watchlisted ? " active" : ""}`} aria-pressed={watchlisted} onClick={onToggleWatchlist}>{watchlisted ? t.watchlist.onWatchlist : t.watchlist.followAircraft}</button>
        <Link className="aircraft-quick-action" href={historyHref as `/history?hex=${string}`}>{t.aircraft.showFlightHistory}</Link>
        <Link className="aircraft-quick-action primary" href={fullDetailHref as `/aircraft/${string}`}>{t.aircraft.fullDetail} <span aria-hidden="true">→</span></Link>
      </nav>
    </section>
    <QuickSection id="aircraft-quick-tracking-title" title={t.aircraft.liveTrackingTitle} className="aircraft-quick-tracking">
      {summary.length > 0 && <p className="aircraft-quick-tracking-summary">{summary.join(" · ")}</p>}
      {stableAltitude ? <p className="aircraft-quick-stable-altitude" data-testid="aircraft-quick-stable-altitude">
        <span>{stableAltitude.altitudeFt >= 18_000 ? t.aircraft.stableFlightLevel : t.aircraft.stableAltitude}</span>
        <strong>{formatAltitude(stableAltitude.altitudeFt)}</strong>
      </p> : <AircraftAltitudeChart points={chartPoints} livePoint={livePoint} />}
    </QuickSection>
  </>;
}

function FlightStateSection({ aircraft }: { aircraft: AircraftView }) {
  const telemetry = aircraft.adsbTelemetry;
  const target = aircraft.targetState;
  const selectedAltitude = target?.selectedAltitudeFt
    ?? telemetry?.selectedAltitudeMcpFt
    ?? telemetry?.selectedAltitudeFmsFt
    ?? null;
  const selectedHeading = target?.selectedHeadingDeg ?? telemetry?.selectedHeadingDeg ?? null;
  const modes = [
    target?.autopilot ? t.aircraft.autopilot : null,
    target?.vnavMode ? t.aircraft.vnav : null,
    target?.lnavMode ? t.aircraft.lnav : null,
    target?.altitudeHoldMode ? t.aircraft.altitudeHold : null,
    target?.approachMode ? t.aircraft.approachMode : null,
    target?.tcasOperational ? t.aircraft.tcas : null,
  ].filter((mode): mode is string => Boolean(mode));
  const hasState = Boolean(
    telemetry?.iasKt !== null && telemetry?.iasKt !== undefined
      || telemetry?.mach !== null && telemetry?.mach !== undefined
      || selectedAltitude !== null
      || selectedHeading !== null
      || telemetry?.trueHeadingDeg !== null && telemetry?.trueHeadingDeg !== undefined
      || telemetry?.magneticHeadingDeg !== null && telemetry?.magneticHeadingDeg !== undefined
      || modes.length,
  );
  if (!hasState) return null;

  return <QuickSection id="aircraft-quick-flight-state-title" title={t.aircraft.navigationStateTitle} className="aircraft-quick-flight-state">
    <div className="aircraft-quick-detail-grid">
      <DetailValue label={t.aircraft.indicatedAirspeed} value={telemetry?.iasKt === null || telemetry?.iasKt === undefined ? null : `${formatNumber(telemetry.iasKt, 0)} kt`} />
      <DetailValue label={t.aircraft.mach} value={telemetry?.mach === null || telemetry?.mach === undefined ? null : `M ${formatNumber(telemetry.mach, 3)}`} />
      <DetailValue label={t.aircraft.selectedAltitude} value={selectedAltitude === null ? null : formatAltitude(selectedAltitude)} />
      <DetailValue label={t.aircraft.selectedHeading} value={selectedHeading === null ? null : formatTrack(selectedHeading)} />
      <DetailValue label={t.aircraft.trueHeading} value={telemetry?.trueHeadingDeg === null || telemetry?.trueHeadingDeg === undefined ? null : formatTrack(telemetry.trueHeadingDeg)} />
      <DetailValue label={t.aircraft.magneticHeading} value={telemetry?.magneticHeadingDeg === null || telemetry?.magneticHeadingDeg === undefined ? null : formatTrack(telemetry.magneticHeadingDeg)} />
    </div>
    {modes.length > 0 && <div className="aircraft-quick-mode-list" aria-label={t.aircraft.navModes}>{modes.map((mode) => <span key={mode}>{mode}</span>)}</div>}
  </QuickSection>;
}

function TelemetrySection({ aircraft }: { aircraft: AircraftView }) {
  const position = aircraft.lat === null || aircraft.lon === null ? null : `${formatCoordinate(aircraft.lat)}, ${formatCoordinate(aircraft.lon)}`;
  return <QuickSection id="aircraft-quick-telemetry-title" title={t.aircraft.detailSections.telemetry} className="aircraft-quick-telemetry">
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
    <AircraftAdsbTelemetry aircraft={aircraft} />
  </QuickSection>;
}

function DataSection({ aircraft }: { aircraft: AircraftView }) {
  const observationAge = (value: string | null | undefined) => value ? formatAge(Math.max(0, (Date.now() - Date.parse(value)) / 1000)) : null;
  return <QuickSection id="aircraft-quick-data-title" title={t.aircraft.detailSections.data} className="aircraft-quick-data">
    <div className="aircraft-quick-data-source"><span className="source-badge source-badge-prominent">{aircraftPositionSourceLabel(aircraft)}</span><span>{t.aircraft.positionSource}</span></div>
    <div className="aircraft-quick-detail-grid">
      <DetailValue label={t.aircraft.seenBy} value={aircraftSourceLabel(aircraft)} />
      <DetailValue label={t.aircraft.positionOrigin} value={aircraft.provenance?.positionOrigin ?? null} />
      <DetailValue label={t.intelligence.freshness} value={aircraft.seenPosSeconds === null || aircraft.seenPosSeconds > 60 ? t.intelligence.stale : t.intelligence.fresh} />
      <DetailValue label={t.aircraft.lastLocalObservation} value={observationAge(aircraft.provenance?.lastLocalSeen)} />
      <DetailValue label={t.aircraft.lastNetworkObservation} value={observationAge(aircraft.provenance?.lastNetworkSeen)} />
      <DetailValue label={t.route.source} value={aircraft.enrichment?.route?.source} />
      <DetailValue label={t.aircraft.metadata} value={aircraft.enrichment?.metadata?.source} />
    </div>
    <TechnicalDetails aircraft={aircraft} />
  </QuickSection>;
}

function DetailTabs({ activeTab, onChange }: { activeTab: DetailTab; onChange: (tab: DetailTab) => void }) {
  const tabs: Array<{ id: DetailTab; label: string }> = [
    { id: "flight", label: t.aircraft.detailSections.flight },
    { id: "situation", label: t.aircraft.detailSections.situation },
    { id: "aircraft", label: t.aircraft.detailSections.aircraft },
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
  weatherAvoidance,
  sigmetStale,
  windContext,
  windAhead,
  destinationWind,
  windStatus,
  routeWeather,
  routeCorridor = null,
  routeConformance = null,
  intelligenceEvents = [],
  operationalTwin = null,
  operationalFocusChanges = null,
  operationalFocusItemId = null,
  operationalFocusRevealVersion = 0,
  onOperationalFocus,
  watchlisted,
  onBack,
  onClose,
  onCenter,
  onToggleWatchlist,
  sectorTraffic,
}: AircraftRadarQuickDetailProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>("flight");
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const metadata = aircraft.enrichment?.metadata;
  const registration: string | null = aircraft.registration ?? metadata?.registration ?? databaseAircraft?.registration ?? null;
  const headerType = metadata?.icaoTypeCode ?? aircraft.aircraftType ?? databaseAircraft?.aircraftType ?? null;
  const route = aircraft.enrichment?.route;
  const hasRouteData = Boolean(route && (route.origin || route.originAirport || route.destination || route.destinationAirport));
  const operator: string | null = route?.airline || metadata?.operator || null;
  const emergency = aircraft.emergency && aircraft.emergency.toLowerCase() !== "none" ? aircraft.emergency : null;
  const emergencySquawk = aircraft.squawk && ["7500", "7600", "7700"].includes(aircraft.squawk) ? aircraft.squawk : null;
  const sourceAge = aircraft.seenPosSeconds === null ? null : formatAge(aircraft.seenPosSeconds);
  const latestEvent = intelligenceEvents[0] ?? null;
  const phase = phaseLabel(latestEvent?.phase ?? null);
  const situation = buildFlightSituationSummary({
    aircraft,
    atc: atcContext,
    sigmets: sigmetContext,
    sigmetStale,
    routeWeather,
    sigmetDeviation,
    wind: windContext,
    windAhead,
  });
  const fullDetailHref = `/aircraft/${encodeURIComponent(aircraft.icaoHex)}`;
  const historyHref = `/history?hex=${encodeURIComponent(aircraft.icaoHex)}`;
  const operationalFocus = operationalTwin?.status === "available"
    && operationalTwin.aircraft.icaoHex.toUpperCase() === aircraft.icaoHex.toUpperCase()
    ? operationalTwin.operationalFocus ?? null
    : null;

  useEffect(() => {
    if (!operationalFocusItemId) return;
    setActiveTab("situation");
  }, [operationalFocusItemId, operationalFocusRevealVersion]);

  return <div className="aircraft-quick-detail detail-content" data-testid="aircraft-quick-detail">
    <header className="aircraft-quick-header">
      <div className="aircraft-quick-header-actions">
        <button type="button" className="detail-back-button" onClick={onBack}>{t.radar.trafficNearby}</button>
        <button type="button" className="aircraft-quick-mobile-expand" aria-controls="radar-sidebar" aria-expanded={mobileExpanded} aria-label={mobileExpanded ? t.radar.collapseAircraftPanel : t.radar.expandAircraftPanel} title={mobileExpanded ? t.radar.collapseAircraftPanel : t.radar.expandAircraftPanel} onClick={() => setMobileExpanded((value) => !value)}><span aria-hidden="true">{mobileExpanded ? "↓" : "↑"}</span></button>
        <button type="button" className="close-button" onClick={onClose} aria-label={t.history.closeAircraftDetails}>×</button>
      </div>
      <div className="aircraft-quick-identity-row">
        <div className="aircraft-quick-identity">
          <span className="aircraft-quick-eyebrow">{t.history.aircraftDetail}</span>
          <h1>{aircraft.callsign || registration || aircraft.icaoHex}</h1>
          {(operator || headerType || registration) && <p>{[operator, headerType, registration].filter(Boolean).join(" · ")}</p>}
          <RadarTrafficHero
            className="aircraft-quick-header-hero"
            showIdentity={false}
            sourceLabel={trafficSourcePresentation(aircraft).detailLabel}
            primaryLabel={aircraft.callsign || registration || aircraft.icaoHex}
            secondaryLabel={headerType}
            altitude={formatAltitude(aircraft.altitude)}
            speed={formatSpeed(aircraft.groundSpeed)}
            track={formatTrack(aircraft.track)}
            verticalRate={compactVerticalRateLabel(aircraft.verticalRate)}
          />
          <div className="aircraft-quick-header-context" aria-label={t.aircraft.liveTrackingTitle}>
            {aircraft.distanceKm !== null && <span><strong>{formatDistance(aircraft.distanceKm)}</strong> {t.aircraft.distance}</span>}
            {sourceAge && <span>{t.aircraft.positionAge}: {sourceAge}</span>}
            {phase && <strong>{phase}</strong>}
          </div>
          <RouteSection route={route} visible={hasRouteData} />
          {!hasRouteData && <p className="aircraft-quick-route-state">{t.aircraft.noRouteData}</p>}
        </div>
        <button type="button" className={`aircraft-quick-watchlist ${watchlisted ? "active" : ""}`} aria-pressed={watchlisted} aria-label={watchlisted ? t.watchlist.onWatchlist : t.watchlist.followAircraft} onClick={onToggleWatchlist}>
          <span aria-hidden="true">{watchlisted ? "★" : "☆"}</span>
        </button>
      </div>
    </header>

    <DetailTabs activeTab={activeTab} onChange={setActiveTab} />
    {activeTab === "flight" && <div className="aircraft-quick-tab-panel" role="tabpanel" id="aircraft-tabpanel-flight" aria-labelledby="aircraft-tab-flight">
      <AircraftOverview aircraft={aircraft} emergency={emergency} emergencySquawk={emergencySquawk} onCenter={onCenter} historyHref={historyHref} fullDetailHref={fullDetailHref} watchlisted={watchlisted} onToggleWatchlist={onToggleWatchlist} historyTrail={historyTrail} />
      <RouteCorridorSection corridor={routeCorridor} conformance={routeConformance} />
      <FlightStateSection aircraft={aircraft} />
    </div>}
    {activeTab === "situation" && <div className="aircraft-quick-tab-panel" role="tabpanel" id="aircraft-tabpanel-situation" aria-labelledby="aircraft-tab-situation">
      {operationalFocus && onOperationalFocus ? <RadarOperationalFocusSummary
        focus={operationalFocus}
        changes={operationalFocusChanges}
        activeItemId={operationalFocusItemId}
        onFocus={onOperationalFocus}
      /> : null}
      <SituationSummarySection summary={situation} />
      <NavigationIntegritySection aircraft={aircraft} />
      <AtcSection aircraft={aircraft} context={atcContext} sectorTraffic={sectorTraffic} />
      <SigmetSection context={sigmetContext} deviation={sigmetDeviation} avoidance={weatherAvoidance} stale={sigmetStale} />
      <RouteWeatherSection context={routeWeather} />
      <AircraftObservedWeather aircraftHex={aircraft.icaoHex} />
      <WindSection context={windContext} ahead={windAhead} destination={destinationWind} status={windStatus} />
      {route && <FlightRouteWeather compact originAirport={route.originAirport} destinationAirport={route.destinationAirport} />}
      <IntelligenceSection events={intelligenceEvents} />
    </div>}
    {activeTab === "aircraft" && <div className="aircraft-quick-tab-panel" role="tabpanel" id="aircraft-tabpanel-aircraft" aria-labelledby="aircraft-tab-aircraft"><AircraftIdentitySection aircraft={aircraft} databaseAircraft={databaseAircraft} /></div>}
    {activeTab === "data" && <div className="aircraft-quick-tab-panel" role="tabpanel" id="aircraft-tabpanel-data" aria-labelledby="aircraft-tab-data"><TelemetrySection aircraft={aircraft} /><DataSection aircraft={aircraft} /></div>}
  </div>;
}
