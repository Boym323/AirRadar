"use client";

import Link from "next/link";
import type { AirportRunway } from "@/lib/airports/infrastructure";
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
import type { AirportOperationsControllerState } from "@/components/airport-operations-controller";
import type { AirportLiveTrafficControllerState } from "@/components/airport-live-traffic-controller";
import type { AirportMovement } from "@/lib/server/airport-movements";
import type { AirportOperationsResponse } from "@/lib/server/airport-operations";
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
}: {
  airport: { icaoCode: string; name: string };
  runways: AirportRunway[];
  controller: AirportOperationsControllerState;
  liveTraffic: AirportLiveTrafficControllerState;
}) {
  const operations = controller.operations;
  const weather = controller.weather;
  const runway = buildAirportRunwayIntelligence(operations, runways, weather?.metar ?? null);
  const liveBoard = buildAirportLiveBoardSnapshot(operations);
  const activeTraffic = buildAirportCorrelatedTrafficSnapshot(liveTraffic.observations, operations);
  const flow = buildAirportJourneyFlowSummary(activeTraffic);
  const pressure = buildAirportFlowPressureSummary(flow, operations);
  const runwayFlow = buildAirportRunwayFlowIntelligence(operations, runway.windFavoredRunway);
  const timeline = buildAirportOperationsTimeline(operations);
  const runwayShare = runway.inferredShare === null ? null : `${Math.round(runway.inferredShare * 100)} %`;
  const metar = weather?.metar ?? null;
  const wind = metar && !metar.windCalm && !metar.windVariable
    && metar.windDirectionDeg !== null && metar.windSpeedKt !== null
    ? `${String(Math.round(metar.windDirectionDeg)).padStart(3, "0")}° / ${formatSpeed(metar.windSpeedKt)}`
    : null;

  return <section id="airport-intelligence-v3" className="airport-v3-board airport-live-board" aria-labelledby="airport-v3-title" data-testid="airport-intelligence-v3" data-product="airport-live-board-v7">
    <div data-testid="airport-live-board">
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

    <div className="airport-v3-grid">
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
    </div>
    </div>
  </section>;
}
