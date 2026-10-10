"use client";

import Link from "next/link";
import type { AirportRunway } from "@/lib/airports/infrastructure";
import type { AirportOperationsView } from "@/lib/airport-v5-views";
import { AirportFlightsTable } from "@/components/airport-v5-flights-table";
import { aircraftFlightHref } from "@/lib/aircraft/detail-links";
import {
  buildAirportCorrelatedTrafficSnapshot,
  buildAirportFlowPressureSummary,
  buildAirportJourneyFlowSummary,
  buildAirportLiveBoardSnapshot,
  buildAirportRunwayFlowIntelligence,
  buildAirportOperationsTimeline,
  buildAirportRunwayIntelligence,
} from "@/lib/airport-intelligence/v3";
import { buildAirportArrivalSequence } from "@/lib/airport-intelligence/arrival-sequence-v7";
import { buildAirportArrivalFlowIntelligence } from "@/lib/airport-intelligence/arrival-flow-v8";
import { buildAirportRunwayChangeEvidenceD2 } from "@/lib/airport-intelligence/runway-change-evidence-d2";
import { buildAirportApproachEvidenceD3 } from "@/lib/airport-intelligence/approach-evidence-d3";
import { buildAirportContextD4 } from "@/lib/airport-intelligence/airport-context-d4";
import { airportDText } from "@/lib/i18n/airport-d-extras";
import type { AirportOperationsControllerState } from "@/components/airport-operations-controller";
import type { AirportLiveTrafficControllerState } from "@/components/airport-live-traffic-controller";
import type { AirportMovement } from "@/lib/server/airport-movements";
import type { AirportOperationsResponse } from "@/lib/server/airport-operations";
import type { AirportTerminalTrackRelation } from "@/lib/server/airport-terminal-demand-horizon-v9";
import { ContextBadge, MetricCard, MetricStrip } from "@/components/ui-primitives";
import { formatAltitude, formatDateTime, formatDistance, formatNumber, formatSpeed, formatTime, formatWeatherVisibility, t } from "@/lib/i18n";

function movementLabel(movement: AirportMovement["movement"]): string {
  return {
    APPROACH: t.airport.movementApproach,
    LANDING: t.airport.movementLanding,
    TAKEOFF: t.airport.movementTakeoff,
    DEPARTURE: t.airport.movementDeparture,
    GO_AROUND: t.airport.movementGoAround,
    HOLDING: t.airport.movementHolding,
    OVERFLIGHT: t.airport.movementOverflight,
  }[movement];
}

function activityLabel(activity: AirportOperationsResponse["activity"]): string {
  return {
    QUIET: t.airport.operationalQuiet,
    LIGHT: t.airport.operationalLight,
    MODERATE: t.airport.operationalModerate,
    BUSY: t.airport.operationalBusy,
  }[activity];
}

function runwayLabel(movement: AirportMovement): string {
  return movement.runway?.designator ? `RWY ${movement.runway.designator}` : t.airport.unknownRunway;
}

function confidenceLabel(value: AirportMovement["confidence"]): string {
  return {
    high: t.airport.v3ConfidenceHigh,
    medium: t.airport.v3ConfidenceMedium,
    low: t.airport.v3ConfidenceLow,
  }[value];
}

function statusLabel(status: AirportOperationsControllerState["status"]): string {
  return {
    loading: t.common.loading,
    ready: t.airport.v3StatusReady,
    partial: t.airport.v3StatusPartial,
    unavailable: t.airport.v3StatusUnavailable,
  }[status];
}

function journeyLabel(stage: ReturnType<typeof buildAirportCorrelatedTrafficSnapshot>["inbound"][number]["journey"]["stage"]): string {
  return {
    INBOUND: t.airport.liveBoardJourneyInbound,
    HOLDING: t.airport.liveBoardJourneyHolding,
    APPROACH: t.airport.liveBoardJourneyApproach,
    FINAL: t.airport.liveBoardJourneyFinal,
    LANDED: t.airport.liveBoardJourneyLanded,
    GO_AROUND: t.airport.liveBoardJourneyGoAround,
    INITIAL_CLIMB: t.airport.liveBoardJourneyInitialClimb,
    OUTBOUND: t.airport.liveBoardJourneyOutbound,
  }[stage];
}

function routeRelationLabel(
  relation: ReturnType<typeof buildAirportCorrelatedTrafficSnapshot>["inbound"][number]["journey"]["routeRelation"],
): string | null {
  return relation === "CONFIRMED" ? t.airport.liveBoardRouteConfirmed
    : relation === "CONFLICT" ? t.airport.liveBoardRouteConflict
      : null;
}

function flowTrendLabel(trend: ReturnType<typeof buildAirportFlowPressureSummary>["arrivals"]["trend"]): string {
  return {
    RISING: t.airport.liveBoardV6TrendRising,
    STEADY: t.airport.liveBoardV6TrendSteady,
    FALLING: t.airport.liveBoardV6TrendFalling,
    NO_DATA: t.airport.liveBoardV6TrendNoData,
  }[trend];
}

function pressureLabel(level: ReturnType<typeof buildAirportFlowPressureSummary>["pressure"]["level"]): string {
  return {
    LOW: t.airport.liveBoardV6PressureLow,
    MODERATE: t.airport.liveBoardV6PressureModerate,
    ELEVATED: t.airport.liveBoardV6PressureElevated,
    HIGH: t.airport.liveBoardV6PressureHigh,
  }[level];
}

function runwayConsistencyLabel(
  consistency: ReturnType<typeof buildAirportFlowPressureSummary>["runway"]["consistency"],
): string {
  return {
    STABLE: t.airport.liveBoardV6RunwayStable,
    MIXED: t.airport.liveBoardV6RunwayMixed,
    UNKNOWN: t.airport.liveBoardV6RunwayUnknown,
  }[consistency];
}

function runwayFlowStateLabel(
  state: ReturnType<typeof buildAirportRunwayFlowIntelligence>["state"],
): string {
  return {
    STABLE: t.airport.liveBoardV7Stable,
    TRANSITIONING: t.airport.liveBoardV7Transitioning,
    MIXED: t.airport.liveBoardV7Mixed,
    INSUFFICIENT: t.airport.liveBoardV7Insufficient,
  }[state];
}

function runwayFlowWindLabel(
  alignment: ReturnType<typeof buildAirportRunwayFlowIntelligence>["windAlignment"],
): string {
  return {
    ALIGNED: t.airport.liveBoardV7WindAligned,
    DIFFERENT: t.airport.liveBoardV7WindDifferent,
    UNKNOWN: t.airport.liveBoardV7WindUnknown,
  }[alignment];
}

function runwayFlowValue(runway: string | null): string {
  return runway ? `RWY ${runway}` : "—";
}

function arrivalDemandTrendLabel(
  trend: ReturnType<typeof buildAirportArrivalFlowIntelligence>["demand"]["trend"],
): string {
  return {
    INCREASING: t.airport.liveBoardV8TrendIncreasing,
    STABLE: t.airport.liveBoardV8TrendStable,
    DECREASING: t.airport.liveBoardV8TrendDecreasing,
    NO_DATA: t.airport.liveBoardV8TrendNoData,
  }[trend];
}

function arrivalPressureLabel(
  level: ReturnType<typeof buildAirportArrivalFlowIntelligence>["pressure"]["level"],
): string {
  return {
    LOW: t.airport.liveBoardV8PressureLow,
    NORMAL: t.airport.liveBoardV8PressureNormal,
    ELEVATED: t.airport.liveBoardV8PressureElevated,
    HIGH: t.airport.liveBoardV8PressureHigh,
  }[level];
}

function arrivalCompressionLabel(
  state: ReturnType<typeof buildAirportArrivalFlowIntelligence>["compression"]["state"],
): string {
  return {
    NORMAL: t.airport.liveBoardV8CompressionNormal,
    ELEVATED: t.airport.liveBoardV8CompressionElevated,
    HIGH: t.airport.liveBoardV8CompressionHigh,
    UNKNOWN: t.airport.liveBoardV8CompressionUnknown,
  }[state];
}

function approachQueueLabel(
  state: ReturnType<typeof buildAirportArrivalFlowIntelligence>["queue"]["state"],
): string {
  return {
    EMPTY: t.airport.liveBoardV8QueueEmpty,
    LOW_DENSITY: t.airport.liveBoardV8QueueLowDensity,
    ACTIVE: t.airport.liveBoardV8QueueActive,
    BUILDING: t.airport.liveBoardV8QueueBuilding,
    COMPRESSED: t.airport.liveBoardV8QueueCompressed,
    HOLDING_PRESENT: t.airport.liveBoardV8QueueHoldingPresent,
  }[state];
}

function arrivalEvidenceLabel(
  evidence: ReturnType<typeof buildAirportArrivalFlowIntelligence>["evidence"],
): string {
  return {
    PUBLIC_STRONG: t.airport.liveBoardV8EvidencePublicStrong,
    PUBLIC_PARTIAL: t.airport.liveBoardV8EvidencePublicPartial,
    RECEIVER_ONLY: t.airport.liveBoardV8EvidenceReceiverOnly,
  }[evidence];
}

function terminalTrackRelationLabel(relation: AirportTerminalTrackRelation): string {
  return {
    TOWARD: t.airport.liveBoardV9TrackToward,
    CROSSING: t.airport.liveBoardV9TrackCrossing,
    AWAY: t.airport.liveBoardV9TrackAway,
    UNKNOWN: t.airport.liveBoardV9TrackUnknown,
  }[relation];
}

function arrivalRunwayAlignmentLabel(
  state: ReturnType<typeof buildAirportArrivalFlowIntelligence>["runwayAlignment"]["state"],
): string {
  return {
    ALIGNED: t.airport.liveBoardV8RunwayAligned,
    DIFFERENT: t.airport.liveBoardV8RunwayDifferent,
    UNKNOWN: t.airport.liveBoardV8RunwayUnknown,
  }[state];
}

function runwayFlowLaneDetail(
  lane: ReturnType<typeof buildAirportRunwayFlowIntelligence>["current"]["arrivals"],
): string {
  return lane.share === null
    ? t.airport.liveBoardV7NoEvidence
    : t.airport.liveBoardV7LaneDetail(Math.round(lane.share * 100), lane.samples);
}

function movementIdentity(movement: AirportMovement): string {
  return movement.callsign || movement.registration || movement.icaoHex;
}

function LiveMovementLane({
  title,
  kicker,
  movements,
  testId,
}: {
  title: string;
  kicker: string;
  movements: AirportMovement[];
  testId: string;
}) {
  return <section className="airport-live-lane" data-testid={testId}>
    <div className="airport-live-lane-heading">
      <div>
        <span className="ui-kicker">{kicker}</span>
        <h3>{title}</h3>
      </div>
      <span>{movements.length}</span>
    </div>
    {movements.length === 0 ? <p className="airport-v3-empty">{t.airport.liveBoardNoRecentMovements}</p> : <ol className="airport-live-flight-list">
      {movements.map((movement) => <li key={`${movement.flightId}:${movement.movement}:${movement.observedAt}`}>
        <time dateTime={movement.observedAt}>{formatTime(movement.observedAt)}</time>
        <span className="airport-live-flight-main">
          <Link href={aircraftFlightHref(movement.flightId)}>{movementIdentity(movement)}</Link>
          <small>{movementLabel(movement.movement)} · {runwayLabel(movement)}</small>
        </span>
        <span className={`airport-v3-confidence ${movement.confidence}`}>{confidenceLabel(movement.confidence)}</span>
      </li>)}
    </ol>}
  </section>;
}

function ActiveTrafficLane({
  title,
  kicker,
  observations,
  testId,
}: {
  title: string;
  kicker: string;
  observations: ReturnType<typeof buildAirportCorrelatedTrafficSnapshot>["inbound"];
  testId: string;
}) {
  return <section className="airport-live-lane airport-live-active-lane" data-testid={testId}>
    <div className="airport-live-lane-heading">
      <div>
        <span className="ui-kicker">{kicker}</span>
        <h3>{title}</h3>
      </div>
      <span>{observations.length}</span>
    </div>
    {observations.length === 0 ? <p className="airport-v3-empty">{t.airport.liveBoardNoActiveTraffic}</p> : <ol className="airport-live-flight-list">
      {observations.map((observation) => {
        const aircraft = observation.aircraft;
        const label = aircraft.callsign || aircraft.registration || aircraft.icaoHex;
        const route = aircraft.enrichment?.route;
        const routeState = routeRelationLabel(observation.journey.routeRelation);
        return <li key={aircraft.icaoHex}>
          <span className="airport-live-now">{t.status.liveShort}</span>
          <span className={`airport-live-journey airport-live-journey-${observation.journey.stage.toLowerCase().replace("_", "-")}`}>
            {journeyLabel(observation.journey.stage)}
          </span>
          <span className="airport-live-flight-main">
            <Link href={`/aircraft/${encodeURIComponent(aircraft.icaoHex)}`}>{label}</Link>
            <small>{route?.origin && route?.destination ? `${route.origin} → ${route.destination}` : aircraft.registration ?? aircraft.icaoHex}</small>
            {routeState ? <small className={`airport-live-route-state ${observation.journey.routeRelation.toLowerCase()}`}>{routeState}</small> : null}
          </span>
          <span className="airport-live-active-meta">
            <span>{formatDistance(observation.distanceKm)} · {formatAltitude(aircraft.altitude)}</span>
            {observation.movement ? <>
              <Link
                className="airport-live-correlation-link"
                href={aircraftFlightHref(observation.movement.flightId)}
                aria-label={t.airport.liveBoardOpenCorrelatedFlightStory}
              >
                {movementLabel(observation.movement.movement)} · {runwayLabel(observation.movement)}
              </Link>
              <small>{confidenceLabel(observation.movement.confidence)} · {formatTime(observation.movement.observedAt)}</small>
            </> : <small>{t.airport.liveBoardLiveOnly}</small>}
          </span>
        </li>;
      })}
    </ol>}
  </section>;
}

export function AirportOperationsBoard({
  airport,
  runways,
  controller,
  liveTraffic,
  view = "overview",
}: {
  airport: { icaoCode: string; name: string };
  runways: AirportRunway[];
  controller: AirportOperationsControllerState;
  liveTraffic: AirportLiveTrafficControllerState;
  view?: AirportOperationsView;
}) {
  const operations = controller.operations;
  const weather = controller.weather;
  const runway = buildAirportRunwayIntelligence(operations, runways, weather?.metar ?? null);
  const liveBoard = buildAirportLiveBoardSnapshot(operations);
  const activeTraffic = buildAirportCorrelatedTrafficSnapshot(liveTraffic.observations, operations);
  const flow = buildAirportJourneyFlowSummary(activeTraffic);
  const pressure = buildAirportFlowPressureSummary(flow, operations);
  const runwayFlow = buildAirportRunwayFlowIntelligence(operations, runway.windFavoredRunway);
  const arrivalSequence = buildAirportArrivalSequence({
    airportIcao: airport.icaoCode,
    traffic: activeTraffic,
    predictive: controller.predictive,
  });
  const arrivalFlow = buildAirportArrivalFlowIntelligence({
    sequence: arrivalSequence,
    flowPressure: pressure,
    runwayFlow,
    referenceTime: arrivalSequence.generatedAt ?? operations?.generatedAt ?? null,
  });
  const runwayEvidenceD2 = buildAirportRunwayChangeEvidenceD2(runwayFlow, arrivalFlow);
  const approachEvidenceD3 = buildAirportApproachEvidenceD3({traffic: activeTraffic, operations});
  const airportContextD4 = buildAirportContextD4({runway: runwayEvidenceD2, arrival: arrivalFlow, approach: approachEvidenceD3, windAvailable: Boolean(weather?.metar)});
  const airportDCopy = airportDText(t.locale);
  const terminalDemandHorizon = operations?.terminalDemandHorizon ?? null;
  const timeline = buildAirportOperationsTimeline(operations);
  const runwayShare = runway.inferredShare === null ? null : `${Math.round(runway.inferredShare * 100)} %`;
  const metar = weather?.metar ?? null;
  const wind = metar && !metar.windCalm && !metar.windVariable
    && metar.windDirectionDeg !== null && metar.windSpeedKt !== null
    ? `${String(Math.round(metar.windDirectionDeg)).padStart(3, "0")}° / ${formatSpeed(metar.windSpeedKt)}`
    : null;

  return <section id="airport-intelligence-v3" className="airport-v3-board airport-live-board" data-view={view} aria-labelledby="airport-v3-title" data-testid="airport-intelligence-v3" data-product="airport-live-board-v8">
    <div data-testid="airport-live-board">
    {view === "overview" && <>
    <div className="airport-v3-hero">
      <div className="airport-v3-heading">
        <div>
          <span className="ui-kicker">{t.airport.liveBoardKicker}</span>
          <h2 id="airport-v3-title">{airport.icaoCode} · {operations ? activityLabel(operations.activity) : statusLabel(controller.status)}</h2>
          <p>{t.airport.liveBoardDescription}</p>
        </div>
        <div className="airport-v3-badges">
          <ContextBadge variant="inferred">{t.airport.v3ReceiverInferred}</ContextBadge>
          {weather?.metar ? <ContextBadge variant="observed">{t.airport.v3WeatherObserved}</ContextBadge> : null}
          {liveTraffic.connected ? <ContextBadge variant="observed">{t.airport.liveBoardLiveTraffic}</ContextBadge> : null}
        </div>
      </div>

      <MetricStrip className="airport-v3-metrics">
        <MetricCard label={t.airport.operationalArrivals} value={operations ? String(operations.arrivals.length) : "—"} detail="24 h" />
        <MetricCard label={t.airport.operationalDepartures} value={operations ? String(operations.departures.length) : "—"} detail="24 h" />
        <MetricCard label={t.airport.movementGoArounds} value={operations ? String(operations.goArounds.length) : "—"} />
        <MetricCard label={t.airport.movementHoldingCount} value={operations ? String(operations.holding.length) : "—"} />
        <MetricCard
          label={t.airport.v3ReceiverRunway}
          value={runway.inferredRunway ? `RWY ${runway.inferredRunway}` : "—"}
          detail={runwayShare ? `${runwayShare} · n=${runway.inferredCount}` : t.airport.operationalNoRunway}
        />
        <MetricCard
          className="airport-v3-wind-metric"
          label={t.airport.operationalWind}
          value={wind ?? "—"}
          detail={weather?.metar?.flightCategory ?? t.airport.operationalNoWind}
        />
      </MetricStrip>

      <div className="airport-v3-meta">
        <span>{t.airport.liveBoardUpdated}: {operations ? formatDateTime(operations.generatedAt) : "—"}</span>
        <span>{t.airport.liveBoardAutoRefresh}</span>
        <span>{t.airport.v3Completeness}: {operations ? (operations.complete && !operations.truncated ? t.airport.v3Complete : t.airport.v3Incomplete) : statusLabel(controller.status)}</span>
        {(controller.operationsFailed || controller.weatherFailed) ? <button type="button" onClick={controller.refresh}>{t.weather.retry}</button> : null}
      </div>
    </div>

    <section className="airport-live-weather-strip" aria-label={t.airport.liveBoardWeather} data-testid="airport-live-board-weather">
      <span><small>{t.weather.flightCategory}</small><strong>{metar?.flightCategory ?? "—"}</strong></span>
      <span><small>{t.weather.wind}</small><strong>{wind ?? "—"}</strong></span>
      <span><small>{t.weather.visibility}</small><strong>{metar ? formatWeatherVisibility(metar.visibilityMeters, metar.visibilityGreaterThan) : "—"}</strong></span>
      <span><small>{t.weather.temperature}</small><strong>{metar?.temperatureC === null || metar?.temperatureC === undefined ? "—" : `${formatNumber(metar.temperatureC, 0)} °C`}</strong></span>
      <span><small>{t.weather.qnh}</small><strong>{metar?.altimeterHpa === null || metar?.altimeterHpa === undefined ? "—" : `${formatNumber(metar.altimeterHpa, 0)} hPa`}</strong></span>
    </section>

    </>}

    {view === "operations" && <>
    <header className="airport-v5-section-intro" data-testid="airport-v5-operations-heading">
      <span className="ui-kicker">{t.airportV5.tabs.operations}</span>
      <h2>{t.airport.liveBoardFlowTitle}</h2>
      <p>{t.airportV5.operationsIntro}</p>
    </header>
    <section className="airport-live-flow-pulse" data-testid="airport-live-board-flow-pulse" aria-labelledby="airport-live-flow-title">
      <div className="airport-live-flow-heading">
        <div><span className="ui-kicker">{t.airport.liveBoardFlowKicker}</span><h3 id="airport-live-flow-title">{t.airport.liveBoardFlowTitle}</h3></div>
        <span>{t.airport.liveBoardFlowCorrelation(flow.correlated, flow.liveOnly)}</span>
      </div>
      <MetricStrip className="airport-live-flow-metrics">
        <MetricCard label={t.airport.liveBoardFlowInbound} value={String(flow.inbound)} />
        <MetricCard label={t.airport.liveBoardFlowFinal} value={String(flow.final)} />
        <MetricCard label={t.airport.liveBoardFlowHolding} value={String(flow.holding)} />
        <MetricCard label={t.airport.liveBoardFlowOutbound} value={String(flow.outbound)} />
        <MetricCard label={t.airport.liveBoardFlowGoAround} value={String(flow.goAround)} />
        <MetricCard label={t.airport.liveBoardFlowRouteConflicts} value={String(flow.routeConflicts)} />
      </MetricStrip>
      {flow.attention.length > 0 ? <ol className="airport-live-flow-attention" data-testid="airport-live-board-flow-attention">
        {flow.attention.map((observation) => {
          const aircraft = observation.aircraft;
          const label = aircraft.callsign || aircraft.registration || aircraft.icaoHex;
          return <li key={aircraft.icaoHex}>
            <span className={`airport-live-journey airport-live-journey-${observation.journey.stage.toLowerCase().replace("_", "-")}`}>{journeyLabel(observation.journey.stage)}</span>
            {observation.movement ? <Link href={aircraftFlightHref(observation.movement.flightId)}>{label}</Link> : <Link href={`/aircraft/${encodeURIComponent(aircraft.icaoHex)}`}>{label}</Link>}
            <span>{formatDistance(observation.distanceKm)}</span>
            {observation.journey.routeRelation === "CONFLICT" ? <small className="airport-live-route-state conflict">{t.airport.liveBoardRouteConflict}</small> : null}
          </li>;
        })}
      </ol> : <p className="airport-v3-empty">{t.airport.liveBoardFlowNoAttention}</p>}
    </section>

    </>}

    {view === "overview" && <>
    <div className="airport-live-active" data-testid="airport-live-board-active">
      <ActiveTrafficLane
        kicker={t.airport.liveBoardActiveInboundKicker}
        title={t.airport.liveBoardActiveInboundTitle}
        observations={activeTraffic.inbound}
        testId="airport-live-board-active-inbound"
      />
      <ActiveTrafficLane
        kicker={t.airport.liveBoardActiveOutboundKicker}
        title={t.airport.liveBoardActiveOutboundTitle}
        observations={activeTraffic.outbound}
        testId="airport-live-board-active-outbound"
      />
    </div>

    <div className="airport-live-lanes">
      <LiveMovementLane
        kicker={t.airport.liveBoardArrivalsKicker}
        title={t.airport.liveBoardArrivalsTitle}
        movements={liveBoard.arrivals}
        testId="airport-live-board-arrivals"
      />
      <LiveMovementLane
        kicker={t.airport.liveBoardDeparturesKicker}
        title={t.airport.liveBoardDeparturesTitle}
        movements={liveBoard.departures}
        testId="airport-live-board-departures"
      />
      <LiveMovementLane
        kicker={t.airport.liveBoardAlertsKicker}
        title={t.airport.liveBoardAlertsTitle}
        movements={liveBoard.attention}
        testId="airport-live-board-alerts"
      />
    </div>

    </>}

    {(view === "arrivals" || view === "departures") && <AirportFlightsTable
      view={view}
      movements={view === "arrivals" ? operations?.arrivals ?? [] : operations?.departures ?? []}
      loading={controller.status === "loading"}
      unavailable={operations === null}
      incomplete={Boolean(operations && (!operations.complete || operations.truncated))}
      lastUpdated={operations?.generatedAt ?? null}
    />}

    {view === "analytics" && <>
    <header className="airport-v5-section-intro" data-testid="airport-v5-analytics-heading">
      <span className="ui-kicker">{t.airportV5.tabs.analytics}</span>
      <h2>{t.airport.liveBoardAdvancedLabel}</h2>
      <p>{t.airportV5.analyticsIntro}</p>
    </header>
    <details className="airport-live-advanced" data-testid="airport-live-board-advanced" open>
      <summary>
        <span><strong>{t.airport.liveBoardAdvancedLabel}</strong><small>{t.airport.liveBoardAdvancedHint}</small></span>
        <span className="airport-live-advanced-chevron" aria-hidden="true">⌄</span>
      </summary>
    <section className="airport-live-flow-pressure" data-testid="airport-live-board-v6-pressure" aria-labelledby="airport-live-v6-pressure-title">
      <div className="airport-live-flow-heading">
        <div>
          <span className="ui-kicker">{t.airport.liveBoardV6Kicker}</span>
          <h3 id="airport-live-v6-pressure-title">{t.airport.liveBoardV6Title}</h3>
        </div>
        <span>{t.airport.liveBoardV6Window}</span>
      </div>
      <MetricStrip className="airport-live-flow-metrics">
        <MetricCard
          label={t.airport.liveBoardV6Pressure}
          value={pressureLabel(pressure.pressure.level)}
          detail={t.airport.liveBoardV6PressureScore(pressure.pressure.score)}
        />
        <MetricCard
          label={t.airport.liveBoardV6Arrivals}
          value={`${pressure.arrivals.current} / 15 min`}
          detail={`${flowTrendLabel(pressure.arrivals.trend)} · Δ ${pressure.arrivals.delta >= 0 ? "+" : ""}${pressure.arrivals.delta}`}
        />
        <MetricCard
          label={t.airport.liveBoardV6Departures}
          value={`${pressure.departures.current} / 15 min`}
          detail={`${flowTrendLabel(pressure.departures.trend)} · Δ ${pressure.departures.delta >= 0 ? "+" : ""}${pressure.departures.delta}`}
        />
        <MetricCard
          label={t.airport.liveBoardV6Holding}
          value={`${pressure.holdingRecent} / 15 min`}
          detail={t.airport.liveBoardV6ObservedEvents}
        />
        <MetricCard
          label={t.airport.liveBoardV6GoAround}
          value={`${pressure.goAroundRecent} / 30 min`}
          detail={t.airport.liveBoardV6ObservedEvents}
        />
        <MetricCard
          label={t.airport.liveBoardV6RunwayFlow}
          value={pressure.runway.designator ? `RWY ${pressure.runway.designator}` : "—"}
          detail={pressure.runway.share === null
            ? runwayConsistencyLabel(pressure.runway.consistency)
            : `${runwayConsistencyLabel(pressure.runway.consistency)} · ${Math.round(pressure.runway.share * 100)} % · n=${pressure.runway.samples}`}
        />
      </MetricStrip>
      <p className="airport-v3-disclaimer">{t.airport.liveBoardV6Disclaimer}</p>
    </section>

    <section className="airport-live-runway-stability airport-live-flow-pressure" data-testid="airport-live-board-v7-runway-flow" aria-labelledby="airport-live-v7-runway-title">
      <div className="airport-live-flow-heading">
        <div>
          <span className="ui-kicker">{t.airport.liveBoardV7Kicker}</span>
          <h3 id="airport-live-v7-runway-title">{t.airport.liveBoardV7Title}</h3>
        </div>
        <span>{t.airport.liveBoardV7Window}</span>
      </div>
      <MetricStrip className="airport-live-flow-metrics">
        <MetricCard
          label={t.airport.liveBoardV7State}
          value={runwayFlowStateLabel(runwayFlow.state)}
          detail={runwayFlow.transition
            ? t.airport.liveBoardV7Transition(runwayFlow.transition.from, runwayFlow.transition.to)
            : t.airport.liveBoardV7StateDetail}
        />
        <MetricCard
          label={t.airport.liveBoardV7Current}
          value={runwayFlowValue(runwayFlow.current.runway)}
          detail={runwayFlow.current.share === null
            ? t.airport.liveBoardV7NoEvidence
            : t.airport.liveBoardV7EvidenceDetail(
              Math.round(runwayFlow.current.share * 100),
              runwayFlow.current.samples,
              runwayFlow.current.reportedSamples,
              runwayFlow.current.inferredSamples,
            )}
        />
        <MetricCard
          label={t.airport.liveBoardV7Previous}
          value={runwayFlowValue(runwayFlow.previous.runway)}
          detail={runwayFlow.previous.share === null
            ? t.airport.liveBoardV7NoEvidence
            : t.airport.liveBoardV7LaneDetail(Math.round(runwayFlow.previous.share * 100), runwayFlow.previous.samples)}
        />
        <MetricCard
          label={t.airport.liveBoardV7Arrivals}
          value={runwayFlowValue(runwayFlow.current.arrivals.runway)}
          detail={runwayFlowLaneDetail(runwayFlow.current.arrivals)}
        />
        <MetricCard
          label={t.airport.liveBoardV7Departures}
          value={runwayFlowValue(runwayFlow.current.departures.runway)}
          detail={runwayFlowLaneDetail(runwayFlow.current.departures)}
        />
        <MetricCard
          label={t.airport.liveBoardV7WindAlignment}
          value={runwayFlowWindLabel(runwayFlow.windAlignment)}
          detail={runwayFlow.windFavoredRunway
            ? t.airport.liveBoardV7WindFavored(runwayFlow.windFavoredRunway)
            : t.airport.liveBoardV7NoWindComparison}
        />
      </MetricStrip>
      <p className="airport-v3-disclaimer">{t.airport.liveBoardV7Disclaimer}</p>
    </section>

    <section className="airport-live-arrival-sequence" data-testid="airport-live-board-v7-arrival-sequence" aria-labelledby="airport-live-v7-arrival-title">
      <div className="airport-live-flow-heading">
        <div>
          <span className="ui-kicker">{t.airport.liveBoardV7ArrivalKicker}</span>
          <h3 id="airport-live-v7-arrival-title">{t.airport.liveBoardV7ArrivalTitle}</h3>
        </div>
        <span>{controller.predictiveLoading ? t.common.loading : controller.predictiveFailed ? t.airport.liveBoardV7ArrivalPredictionUnavailable : t.airport.liveBoardV7ArrivalPublicOnly}</span>
      </div>
      <MetricStrip className="airport-live-flow-metrics">
        <MetricCard label={t.airport.liveBoardV7ArrivalActive} value={String(arrivalSequence.totalCandidates)} />
        <MetricCard
          label={t.airport.liveBoardV7ArrivalEtaCoverage}
          value={`${arrivalSequence.etaPredicted} / ${arrivalSequence.totalCandidates}`}
          detail={arrivalSequence.predictionCoverage === null ? t.airport.liveBoardV7ArrivalNoPrediction : `${Math.round(arrivalSequence.predictionCoverage * 100)} % ETA`}
        />
        <MetricCard
          label={t.airport.liveBoardV7ArrivalMedianSpacing}
          value={arrivalSequence.medianSpacingMinutes === null ? "—" : `${formatNumber(arrivalSequence.medianSpacingMinutes, 1)} min`}
        />
        <MetricCard
          label={t.airport.liveBoardV7ArrivalPredictedRunway}
          value={arrivalSequence.runway.designator ? `RWY ${arrivalSequence.runway.designator}` : "—"}
          detail={arrivalSequence.runway.share === null
            ? t.airport.liveBoardV7ArrivalNoPrediction
            : `${runwayConsistencyLabel(arrivalSequence.runway.consistency)} · ${Math.round(arrivalSequence.runway.share * 100)} % · n=${arrivalSequence.runway.samples}`}
        />
        <MetricCard
          label={t.airport.liveBoardV7ArrivalObservedRunway}
          value={runwayFlowValue(runwayFlow.current.runway)}
          detail={runwayFlow.current.share === null
            ? t.airport.liveBoardV7NoEvidence
            : t.airport.liveBoardV7LaneDetail(Math.round(runwayFlow.current.share * 100), runwayFlow.current.samples)}
        />
      </MetricStrip>
      {arrivalSequence.items.length ? <ol className="airport-live-arrival-sequence-list">
        {arrivalSequence.items.map((item) => <li key={item.icaoHex}>
          <span className="airport-live-sequence-position">{item.position}</span>
          <span className={`airport-live-journey airport-live-journey-${item.stage.toLowerCase().replace("_", "-")}`}>{journeyLabel(item.stage)}</span>
          <span className="airport-live-flight-main">
            <Link href={`/aircraft/${encodeURIComponent(item.icaoHex)}`}>{item.label}</Link>
            <small>{formatDistance(item.distanceKm)}</small>
          </span>
          <span className="airport-live-sequence-eta">
            <strong>{item.etaAt ? formatTime(item.etaAt) : "—"}</strong>
            <small>{item.etaUncertaintyMinutes === null ? t.airport.liveBoardV7ArrivalNoPublicEta : `± ${formatNumber(item.etaUncertaintyMinutes, 0)} min`}</small>
          </span>
          <span className="airport-live-sequence-runway">
            <strong>{item.runway ? `RWY ${item.runway}` : "—"}</strong>
            <small>{item.runwayConfidence ?? item.etaConfidence ?? t.airport.liveBoardV7ArrivalNoPrediction}</small>
          </span>
        </li>)}
      </ol> : <p className="airport-v3-empty">{t.airport.liveBoardV7ArrivalNoArrivals}</p>}
      <p className="airport-v3-disclaimer">{t.airport.liveBoardV7ArrivalDisclaimer}</p>
    </section>

    <section className="airport-live-flow-pressure airport-live-arrival-flow-v8" data-testid="airport-live-board-v8-arrival-flow" aria-labelledby="airport-live-v8-arrival-flow-title">
      <div className="airport-live-flow-heading">
        <div>
          <span className="ui-kicker">{t.airport.liveBoardV8Kicker}</span>
          <h3 id="airport-live-v8-arrival-flow-title">{t.airport.liveBoardV8Title}</h3>
        </div>
        <span>{arrivalEvidenceLabel(arrivalFlow.evidence)}</span>
      </div>
      <MetricStrip className="airport-live-flow-metrics">
        <MetricCard
          label={t.airport.liveBoardV8Demand}
          value={`${arrivalFlow.demand.within5Minutes} / ${arrivalFlow.demand.within15Minutes} / ${arrivalFlow.demand.within30Minutes}`}
          detail={t.airport.liveBoardV8DemandWindows}
        />
        <MetricCard
          label={t.airport.liveBoardV8Trend}
          value={arrivalDemandTrendLabel(arrivalFlow.demand.trend)}
          detail={t.airport.liveBoardV8TrendDetail(arrivalFlow.demand.within15Minutes, arrivalFlow.demand.between15And30Minutes)}
        />
        <MetricCard
          label={t.airport.liveBoardV8Pressure}
          value={arrivalPressureLabel(arrivalFlow.pressure.level)}
          detail={t.airport.liveBoardV8PressureDetail(arrivalFlow.pressure.score, arrivalFlow.pressure.holding, arrivalFlow.pressure.goAround)}
        />
        <MetricCard
          label={t.airport.liveBoardV8Compression}
          value={arrivalCompressionLabel(arrivalFlow.compression.state)}
          detail={arrivalFlow.compression.minimumSpacingMinutes === null
            ? t.airport.liveBoardV8CompressionNoData
            : t.airport.liveBoardV8CompressionDetail(
              formatNumber(arrivalFlow.compression.minimumSpacingMinutes, 1),
              arrivalFlow.compression.compressedPairs,
            )}
        />
        <MetricCard
          label={t.airport.liveBoardV8Queue}
          value={approachQueueLabel(arrivalFlow.queue.state)}
          detail={t.airport.liveBoardV8QueueDetail(arrivalFlow.queue.approachOrFinal, arrivalFlow.queue.holding)}
        />
        <MetricCard
          label={t.airport.liveBoardV8PredictedRunway}
          value={arrivalFlow.runwayAlignment.predictedRunway ? `RWY ${arrivalFlow.runwayAlignment.predictedRunway}` : "—"}
          detail={arrivalFlow.runwayAlignment.predictedShare === null
            ? t.airport.liveBoardV8NoRunwayPrediction
            : t.airport.liveBoardV8RunwayLoadDetail(
              Math.round(arrivalFlow.runwayAlignment.predictedShare * 100),
              arrivalFlow.runwayAlignment.predictedSamples,
            )}
        />
        <MetricCard
          label={t.airport.liveBoardV8ObservedVsPredicted}
          value={arrivalRunwayAlignmentLabel(arrivalFlow.runwayAlignment.state)}
          detail={arrivalFlow.runwayAlignment.observedRunway
            ? t.airport.liveBoardV8ObservedRunwayDetail(
              arrivalFlow.runwayAlignment.observedRunway,
              arrivalFlow.runwayAlignment.observedSamples,
            )
            : t.airport.liveBoardV8ObservedRunwayUnavailable}
        />
      </MetricStrip>
      {arrivalFlow.predictedRunwayLoad.length ? <div className="airport-live-v8-runway-load" data-testid="airport-live-board-v8-runway-load">
        {arrivalFlow.predictedRunwayLoad.map((item) => <div key={item.runway}>
          <strong>RWY {item.runway}</strong>
          <span>{t.airport.liveBoardV8RunwayLoadWindows(item.within5Minutes, item.within15Minutes, item.within30Minutes)}</span>
          <small>{item.share30Minutes === null ? "—" : `${Math.round(item.share30Minutes * 100)} %`}</small>
        </div>)}
      </div> : null}
      <p className="airport-v3-disclaimer">{t.airport.liveBoardV8Disclaimer}</p>
    </section>

    <details className="airport-v5-evidence-details" data-testid="airport-v5-evidence-details">
      <summary><span><strong>{airportDCopy.evidenceDetails}</strong><small>{airportDCopy.evidenceHint}</small></span></summary>
      {runwayEvidenceD2.state === "UNKNOWN" && !approachEvidenceD3.items.length && !airportContextD4.signals.length
        ? <p className="airport-v3-empty airport-v5-evidence-empty" role="status">{airportDCopy.evidenceUnavailable}</p> : null}
    <section className="airport-live-flow-pressure" data-testid="airport-d2-runway-evidence" aria-label={airportDCopy.runwayHeading}>
      <div className="airport-live-flow-heading">
        <div><span className="ui-kicker">AIRPORT INTELLIGENCE / D2</span><h3>{airportDCopy.runwayHeading}</h3></div>
        <strong>{runwayEvidenceD2.state === "OBSERVED_TRANSITION" ? airportDCopy.observedTransition
          : runwayEvidenceD2.state === "PREDICTED_DIVERGENCE" ? airportDCopy.predictedDivergence
          : runwayEvidenceD2.state === "OBSERVED_STABLE" ? airportDCopy.observedStable
          : airportDCopy.unknown}</strong>
      </div>
      <p>{airportDCopy.runwayDetail(runwayEvidenceD2.previousRunway, runwayEvidenceD2.observedRunway, runwayEvidenceD2.observedSamples)}</p>
      <p className="airport-v3-disclaimer">{airportDCopy.runwayDisclaimer}</p>
    </section>

    <section className="airport-live-flow-pressure" data-testid="airport-d3-approach-evidence" aria-label={airportDCopy.approachHeading}>
      <div className="airport-live-flow-heading">
        <div><span className="ui-kicker">AIRPORT INTELLIGENCE / D3</span><h3>{airportDCopy.approachHeading}</h3></div>
        <span>{approachEvidenceD3.items.length}</span>
      </div>
      {approachEvidenceD3.items.length ? <ol className="airport-live-flight-list">
        {approachEvidenceD3.items.map((item) => <li key={item.icaoHex}>
          <span className="airport-live-flight-main">
            <Link href={`/aircraft/${encodeURIComponent(item.icaoHex)}`}>{item.label}</Link>
            <small>{item.state === "REAPPROACH_EVIDENCE" ? airportDCopy.reapproach
              : item.state === "GO_AROUND_EVIDENCE" ? airportDCopy.goAround
              : item.state === "HOLDING_EVIDENCE" ? airportDCopy.holding
              : item.state === "FINAL_APPROACH_EVIDENCE" ? airportDCopy.finalApproach
              : item.state === "APPROACH_EVIDENCE" ? airportDCopy.approach : airportDCopy.liveOnly}</small>
          </span>
        </li>)}
      </ol> : <p className="airport-v3-empty">{airportDCopy.noApproach}</p>}
      <p className="airport-v3-disclaimer">{airportDCopy.approachDisclaimer}</p>
    </section>

    <section className="airport-live-flow-pressure" data-testid="airport-d4-operational-context" aria-label={airportDCopy.contextHeading}>
      <div className="airport-live-flow-heading">
        <div><span className="ui-kicker">AIRPORT INTELLIGENCE / D4</span><h3>{airportDCopy.contextHeading}</h3></div>
      </div>
      {airportContextD4.signals.length ? <ul className="airport-live-flight-list airport-d4-signals">
        {airportContextD4.signals.map((signal) => <li key={signal}>{airportDCopy.contextSignals[signal]}</li>)}
      </ul> : <p className="airport-v3-empty">{airportDCopy.noContext}</p>}
      <p><Link href="/airspace">{airportDCopy.contextAtcLink} ↗</Link></p>
      <p className="airport-v3-disclaimer">{airportDCopy.contextDisclaimer}</p>
    </section>
    </details>

    {terminalDemandHorizon ? <section
      className="airport-live-flow-pressure airport-live-terminal-horizon-v9"
      data-testid="airport-live-board-v9-terminal-horizon"
      data-terminal-demand-product="airport-live-board-v9"
      aria-labelledby="airport-live-v9-terminal-title"
    >
      <div className="airport-live-flow-heading">
        <div>
          <span className="ui-kicker">{t.airport.liveBoardV9Kicker}</span>
          <h3 id="airport-live-v9-terminal-title">{t.airport.liveBoardV9Title}</h3>
        </div>
        <span>{t.airport.liveBoardV9Coverage(
          terminalDemandHorizon.coverage.routeMatchedInbound,
          terminalDemandHorizon.coverage.localAircraft,
        )}</span>
      </div>
      <MetricStrip className="airport-live-flow-metrics">
        <MetricCard
          label={t.airport.liveBoardV9RouteMatched}
          value={String(terminalDemandHorizon.coverage.routeMatchedInbound)}
          detail={t.airport.liveBoardV9LocalCoverage}
        />
        <MetricCard
          label={t.airport.liveBoardV9Within30}
          value={String(terminalDemandHorizon.demand.within30Minutes)}
          detail={t.airport.liveBoardV9DirectEstimate}
        />
        <MetricCard
          label={t.airport.liveBoardV9Within60}
          value={String(terminalDemandHorizon.demand.within60Minutes)}
          detail={t.airport.liveBoardV9DirectEstimate}
        />
        <MetricCard
          label={t.airport.liveBoardV9EtaCoverage}
          value={String(terminalDemandHorizon.coverage.etaEstimated)}
          detail={t.airport.liveBoardV9UnknownEta(terminalDemandHorizon.demand.unknownEta)}
        />
      </MetricStrip>
      {terminalDemandHorizon.items.length ? <ol className="airport-live-v9-horizon-list">
        {terminalDemandHorizon.items.slice(0, 6).map((item) => <li key={item.icaoHex}>
          <span className="airport-live-flight-main">
            <Link href={`/aircraft/${encodeURIComponent(item.icaoHex)}`}>{item.label}</Link>
            <small>{item.routeDestination} · {formatDistance(item.distanceKm)}</small>
          </span>
          <span className="airport-live-v9-horizon-eta">
            <strong>{item.etaMinutes === null ? "—" : `~${formatNumber(item.etaMinutes, 0)} min`}</strong>
            <small>{terminalTrackRelationLabel(item.trackRelation)}</small>
          </span>
        </li>)}
      </ol> : <p className="airport-v3-empty">{t.airport.liveBoardV9NoInbound}</p>}
      <p className="airport-v3-disclaimer">{t.airport.liveBoardV9Disclaimer}</p>
    </section> : null}
    </details>
    </>}

    {view === "operations" && <div className="airport-v3-grid">
      <section className="airport-v3-panel airport-v3-runway" aria-labelledby="airport-v3-runway-title">
        <div className="airport-v3-panel-heading">
          <div>
            <span className="ui-kicker">{t.airport.v3RunwayKicker}</span>
            <h3 id="airport-v3-runway-title">{t.airport.v3RunwayTitle}</h3>
          </div>
          {runway.confidence ? <span className={`airport-v3-confidence ${runway.confidence}`}>{confidenceLabel(runway.confidence)}</span> : null}
        </div>

        <div className="airport-v3-runway-comparison">
          <div>
            <span>{t.airport.v3ReceiverUsage}</span>
            <strong>{runway.inferredRunway ? `RWY ${runway.inferredRunway}` : "—"}</strong>
            <small>{runwayShare ? t.airport.v3ReceiverUsageDetail(runwayShare, runway.inferredCount, runway.inferredTotal) : t.airport.operationalNoRunway}</small>
          </div>
          <div>
            <span>{t.airport.v3WindFavored}</span>
            <strong>{runway.windFavoredRunway ? `RWY ${runway.windFavoredRunway}` : "—"}</strong>
            <small>{runway.windFavoredRunway && runway.windHeadwindKt !== null && runway.windCrosswindKt !== null
              ? t.airport.v3WindComponents(formatSpeed(runway.windHeadwindKt), formatSpeed(runway.windCrosswindKt))
              : t.weather.noClearWindFavoredRunway}</small>
          </div>
        </div>

        {liveBoard.runwayUsage.length > 0 ? <div className="airport-live-runway-usage" data-testid="airport-live-board-runways">
          <div className="airport-live-runway-usage-heading">
            <strong>{t.airport.liveBoardRunwayUsage}</strong>
            <span>{operations?.window ?? "24h"}</span>
          </div>
          {liveBoard.runwayUsage.map((item) => <div className="airport-live-runway-usage-row" key={item.designator}>
            <strong>RWY {item.designator}</strong>
            <span>{t.airport.liveBoardRunwayArrivals}: {item.arrivals}</span>
            <span>{t.airport.liveBoardRunwayDepartures}: {item.departures}</span>
            <span>{t.airport.liveBoardRunwayTotal}: {item.total}</span>
          </div>)}
        </div> : null}

        <p className={`airport-v3-runway-alignment ${runway.alignment}`}>
          {runway.alignment === "aligned"
            ? t.airport.v3RunwayAligned
            : runway.alignment === "different"
              ? t.airport.v3RunwayDifferent
              : t.airport.v3RunwayUnknown}
        </p>
        <p className="airport-v3-disclaimer">{t.airport.v3RunwayDisclaimer}</p>
      </section>

      <section className="airport-v3-panel airport-v3-timeline" aria-labelledby="airport-v3-timeline-title" data-testid="airport-v3-timeline">
        <div className="airport-v3-panel-heading">
          <div>
            <span className="ui-kicker">{t.airport.v3TimelineKicker}</span>
            <h3 id="airport-v3-timeline-title">{t.airport.v3TimelineTitle}</h3>
          </div>
          <span>{operations?.window ?? "24h"}</span>
        </div>

        {controller.status === "loading" ? <p className="airport-v3-empty">{t.common.loading}</p>
          : !operations ? <p className="airport-v3-empty">{t.airport.movementUnavailable}</p>
            : timeline.length === 0 ? <p className="airport-v3-empty">{t.airport.movementNoData}</p>
              : <ol className="airport-v3-timeline-list">
                {timeline.map(({ key, movement }) => <li key={key} className={movement.movement === "GO_AROUND" || movement.movement === "HOLDING" ? "attention" : ""}>
                  <time dateTime={movement.observedAt}>{formatTime(movement.observedAt)}</time>
                  <span className="airport-v3-event">
                    <strong>{movementLabel(movement.movement)}</strong>
                    <small>{runwayLabel(movement)} · {confidenceLabel(movement.confidence)}</small>
                  </span>
                  <span className="airport-v3-flight">
                    <Link href={aircraftFlightHref(movement.flightId)}>{movement.callsign || movement.registration || movement.icaoHex}</Link>
                    <small>{movement.registration ?? movement.icaoHex}</small>
                  </span>
                  <Link className="airport-v3-story-link" href={aircraftFlightHref(movement.flightId)} aria-label={t.airport.v3OpenFlightStory}>↗</Link>
                </li>)}
              </ol>}
        <p className="airport-v3-disclaimer">{t.airport.movementDisclaimer}</p>
      </section>
    </div>}
    </div>
  </section>;
}
