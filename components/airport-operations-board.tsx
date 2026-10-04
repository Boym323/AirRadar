"use client";

import Link from "next/link";
import type { AirportRunway } from "@/lib/airports/infrastructure";
import { aircraftFlightHref } from "@/lib/aircraft/detail-links";
import {
  buildAirportOperationsTimeline,
  buildAirportRunwayIntelligence,
} from "@/lib/airport-intelligence/v3";
import type { AirportOperationsControllerState } from "@/components/airport-operations-controller";
import type { AirportMovement } from "@/lib/server/airport-movements";
import type { AirportOperationsResponse } from "@/lib/server/airport-operations";
import { ContextBadge, MetricCard, MetricStrip } from "@/components/ui-primitives";
import { formatDateTime, formatSpeed, formatTime, t } from "@/lib/i18n";

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

export function AirportOperationsBoard({
  airport,
  runways,
  controller,
}: {
  airport: { icaoCode: string; name: string };
  runways: AirportRunway[];
  controller: AirportOperationsControllerState;
}) {
  const operations = controller.operations;
  const weather = controller.weather;
  const runway = buildAirportRunwayIntelligence(operations, runways, weather?.metar ?? null);
  const timeline = buildAirportOperationsTimeline(operations);
  const runwayShare = runway.inferredShare === null ? null : `${Math.round(runway.inferredShare * 100)} %`;
  const wind = weather?.metar && !weather.metar.windCalm && !weather.metar.windVariable
    && weather.metar.windDirectionDeg !== null && weather.metar.windSpeedKt !== null
    ? `${String(Math.round(weather.metar.windDirectionDeg)).padStart(3, "0")}° / ${formatSpeed(weather.metar.windSpeedKt)}`
    : null;

  return <section className="airport-v3-board" aria-labelledby="airport-v3-title" data-testid="airport-intelligence-v3">
    <div className="airport-v3-hero">
      <div className="airport-v3-heading">
        <div>
          <span className="ui-kicker">{t.airport.v3Kicker}</span>
          <h2 id="airport-v3-title">{airport.icaoCode} · {operations ? activityLabel(operations.activity) : statusLabel(controller.status)}</h2>
          <p>{t.airport.v3Description}</p>
        </div>
        <div className="airport-v3-badges">
          <ContextBadge variant="inferred">{t.airport.v3ReceiverInferred}</ContextBadge>
          {weather?.metar ? <ContextBadge variant="observed">{t.airport.v3WeatherObserved}</ContextBadge> : null}
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
        <span>{t.airport.v3Snapshot}: {operations ? formatDateTime(operations.generatedAt) : "—"}</span>
        <span>{t.airport.v3Completeness}: {operations ? (operations.diagnostics && operations.diagnostics.positionsExamined >= 0 && controller.status !== "unavailable" ? t.airport.v3Bounded : t.airport.v3StatusUnavailable) : statusLabel(controller.status)}</span>
        {(controller.operationsFailed || controller.weatherFailed) ? <button type="button" onClick={controller.refresh}>{t.weather.retry}</button> : null}
      </div>
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
  </section>;
}
