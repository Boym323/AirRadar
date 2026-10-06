"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatNumber, formatTime, t } from "@/lib/i18n";
import { aircraftOperationalFocusRadarHref, type AircraftOperationalFocusItem, type OperationalTwinApiResponse, type OperationalTwinEvent } from "@/lib/operational-twin";
import type { WeatherCorridorEvent } from "@/lib/weather/corridor-intelligence";
import styles from "./aircraft-operational-twin.module.css";

function eventTypeLabel(type: OperationalTwinEvent["type"]): string {
  return t.operationalTwin.eventTypes[type];
}

function weatherEventTypeLabel(type: WeatherCorridorEvent["type"]): string {
  return t.operationalTwin.weatherCorridorEventTypes[type];
}

function operationalFocusTypeLabel(type: AircraftOperationalFocusItem["type"]): string {
  return t.operationalTwin.operationalFocusTypes[type];
}

function relativeTime(minutes: number): string {
  if (minutes <= 0.05) return "NOW";
  return `+${formatNumber(minutes, minutes < 10 ? 1 : 0)} min`;
}

export function AircraftOperationalTwin({
  icaoHex,
  enabled,
}: {
  icaoHex: string;
  enabled: boolean;
}) {
  const [data, setData] = useState<OperationalTwinApiResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setData(null);
    void fetch(`/api/aircraft/${encodeURIComponent(icaoHex)}/situation`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("operational twin request failed");
        return await response.json() as OperationalTwinApiResponse;
      })
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setData(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [enabled, icaoHex]);

  if (!enabled) return null;

  if (loading) {
    return <section className={styles.panel} aria-label={t.operationalTwin.title}>
      <div className={styles.heading}>
        <div><span>{t.operationalTwin.kicker}</span><h2>{t.operationalTwin.title}</h2></div>
      </div>
      <p className={styles.status}>{t.operationalTwin.loading}</p>
    </section>;
  }

  if (!data || data.status !== "available") return null;

  const corridor = data.corridor;
  const evidence = data.evidence;
  const weather = data.weatherCorridor ?? null;
  const windTimingShadow = data.windTimingShadow ?? null;
  const navigationIntegrity = data.navigationIntegrityCorridor ?? null;
  const operationalFocus = data.operationalFocus ?? null;
  return <section className={styles.panel} aria-labelledby="operational-twin-title" data-testid="operational-digital-twin-v1">
    <div className={styles.heading}>
      <div>
        <span>{t.operationalTwin.kicker}</span>
        <h2 id="operational-twin-title">{t.operationalTwin.title}</h2>
      </div>
      <time dateTime={data.generatedAt}>{t.operationalTwin.generated}: {formatTime(data.generatedAt)}</time>
    </div>

    <div className={styles.metrics}>
      <div><span>{t.operationalTwin.horizon}</span><strong>{corridor.horizonMinutes} min</strong></div>
      <div><span>{t.operationalTwin.corridor}</span><strong>{corridor.mode === "ROUTE_AWARE" ? t.operationalTwin.routeAware : t.operationalTwin.kinematic}</strong></div>
      <div><span>{t.operationalTwin.uncertainty}</span><strong>± {formatNumber(corridor.maxUncertaintyNm, 1)} NM</strong></div>
      <div><span>{t.operationalTwin.evidence}</span><strong>{data.events.length}</strong></div>
    </div>

    <div className={styles.evidence}>
      {t.operationalTwin.evidenceSummary(evidence.observed, evidence.published, evidence.planned, evidence.predicted, evidence.inferred)}
    </div>

    {operationalFocus && <section className={styles.weatherCorridor} aria-labelledby="operational-focus-title" data-testid="aircraft-operational-focus-v1">
      <div className={styles.weatherHeading}>
        <div>
          <span>{t.operationalTwin.operationalFocusSubtitle}</span>
          <h3 id="operational-focus-title">{t.operationalTwin.operationalFocusTitle}</h3>
        </div>
        <strong className={styles.focusLevel} data-level={operationalFocus.level}>
          {t.operationalTwin.operationalFocusLevel[operationalFocus.level]}
        </strong>
      </div>
      <div className={styles.weatherSources}>
        <span>{t.operationalTwin.operationalFocusSummary(operationalFocus.attention, operationalFocus.watch)}</span>
        {operationalFocus.truncated && <span>{t.operationalTwin.operationalFocusTruncated}</span>}
      </div>
      {operationalFocus.items.length ? <ol className={styles.weatherTimeline}>
        {operationalFocus.items.map((item) => <li key={item.id}>
          <Link
            className={styles.focusItemLink}
            href={aircraftOperationalFocusRadarHref(icaoHex, item.id)}
            aria-label={t.operationalTwin.operationalFocusShowOnRadar(item.label)}
          >
            <div className={styles.weatherTime}>
              <strong>{relativeTime(item.offsetMinutes)}</strong>
              <small>{formatTime(item.at)}</small>
            </div>
            <div className={styles.weatherEvent}>
              <div className={styles.eventHeader}>
                <span>{operationalFocusTypeLabel(item.type)}</span>
                <div className={styles.badges}>
                  <span>{t.operationalTwin.operationalFocusLevel[item.level]}</span>
                  <span>{t.operationalTwin.confidence[item.confidence]}</span>
                </div>
              </div>
              <strong>{item.label}</strong>
              <small>{item.source}{item.sourceReference ? ` · ${item.sourceReference}` : ""}</small>
              <small className={styles.focusMapAction}>{t.operationalTwin.operationalFocusMapAction}</small>
            </div>
          </Link>
        </li>)}
      </ol> : <p className={styles.status}>{t.operationalTwin.operationalFocusNoItems}</p>}
      <p className={styles.disclaimer}>{t.operationalTwin.operationalFocusDisclaimer}</p>
    </section>}

    {weather && <section className={styles.weatherCorridor} aria-labelledby="weather-corridor-title" data-testid="weather-corridor-intelligence-v1">
      <div className={styles.weatherHeading}>
        <div>
          <span>{t.operationalTwin.weatherCorridorSubtitle}</span>
          <h3 id="weather-corridor-title">{t.operationalTwin.weatherCorridorTitle}</h3>
        </div>
        <strong data-status={weather.status}>{t.operationalTwin.weatherCorridorStatus[weather.status]}</strong>
      </div>

      <div className={styles.weatherSources}>
        {weather.sources.map((source) => <span key={source.source} data-state={source.state}>
          {t.weather.weatherFusionSource[source.source]} · {t.weather.weatherFusionSourceState[source.state]}{source.count > 0 ? ` · ${source.count}` : ""}
        </span>)}
      </div>

      <div className={styles.weatherWind}>
        <span>{t.operationalTwin.weatherCorridorWind}</span>
        <strong>{t.operationalTwin.weatherCorridorWindTrend[weather.wind.trend]}</strong>
        {weather.wind.deltaAlongTrackKt !== null && <small>
          {t.operationalTwin.weatherCorridorWindDelta(formatNumber(weather.wind.deltaAlongTrackKt, 0))}
        </small>}
      </div>

      {weather.events.length ? <ol className={styles.weatherTimeline}>
        {weather.events.slice(0, 8).map((event) => <li key={event.id}>
          <div className={styles.weatherTime}>
            <strong>{relativeTime(event.offsetMinutes)}</strong>
            <small>{t.operationalTwin.weatherCorridorDistance(formatNumber(event.distanceAlongCorridorNm, 0))}</small>
          </div>
          <div className={styles.weatherEvent}>
            <div className={styles.eventHeader}>
              <span>{weatherEventTypeLabel(event.type)}</span>
              <div className={styles.badges}>
                <span>{t.weather.weatherFusionSeverity[event.severity]}</span>
                <span>{t.weather.weatherFusionConfidence[event.confidence]}</span>
              </div>
            </div>
            <strong>{t.weather.weatherFusionRisk[event.risk]}</strong>
            <small>{t.weather.weatherFusionSource[event.source]} · {event.sourceReference}</small>
          </div>
        </li>)}
      </ol> : <p className={styles.status}>{t.operationalTwin.weatherCorridorNoEvents}</p>}
    </section>}

    {windTimingShadow && <details className={styles.limitations} data-testid="operational-twin-wind-timing-shadow-v1">
      <summary>{t.operationalTwin.windTimingShadowTitle} · {t.operationalTwin.windTimingShadowStatus[windTimingShadow.status]}</summary>
      <p className={styles.status}>{t.operationalTwin.windTimingShadowSummary}</p>
      {windTimingShadow.status !== "INSUFFICIENT" ? <>
        <div className={styles.metrics}>
          <div><span>{t.operationalTwin.windTimingShadowGroundSpeed}</span><strong>{windTimingShadow.observedGroundSpeedKt === null ? "—" : `${formatNumber(windTimingShadow.observedGroundSpeedKt, 0)} kt`}</strong></div>
          <div><span>{t.operationalTwin.windTimingShadowStillAir}</span><strong>{windTimingShadow.inferredStillAirSpeedKt === null ? "—" : `${formatNumber(windTimingShadow.inferredStillAirSpeedKt, 0)} kt`}</strong></div>
          <div><span>{t.operationalTwin.windTimingShadowMaxDelta}</span><strong>{windTimingShadow.maxAbsoluteDeltaSeconds === null ? "—" : `${formatNumber(windTimingShadow.maxAbsoluteDeltaSeconds, 0)} s`}</strong></div>
        </div>
        <ul>{windTimingShadow.checkpoints.map((checkpoint) => <li key={checkpoint.horizonMinutes}>
          {t.operationalTwin.windTimingShadowCheckpoint(checkpoint.horizonMinutes, formatNumber(checkpoint.deltaSeconds, 0))}
        </li>)}</ul>
      </> : <p className={styles.status}>{t.operationalTwin.windTimingShadowNoData}</p>}
    </details>}

    {navigationIntegrity && <section className={styles.weatherCorridor} aria-labelledby="navigation-integrity-corridor-title" data-testid="navigation-integrity-corridor-v1">
      <div className={styles.weatherHeading}>
        <div>
          <span>{t.operationalTwin.navigationIntegritySubtitle}</span>
          <h3 id="navigation-integrity-corridor-title">{t.operationalTwin.navigationIntegrityTitle}</h3>
        </div>
        <strong data-status={navigationIntegrity.status}>{t.operationalTwin.navigationIntegrityStatus[navigationIntegrity.status]}</strong>
      </div>
      <div className={styles.weatherSources}>
        <span>{t.operationalTwin.navigationIntegrityWindow(navigationIntegrity.sourceWindow)} · {t.operationalTwin.navigationIntegrityActive(navigationIntegrity.activeAnomalies)}</span>
      </div>
      {navigationIntegrity.events.length ? <ol className={styles.weatherTimeline}>
        {navigationIntegrity.events.slice(0, 6).map((event) => <li key={event.id}>
          <div className={styles.weatherTime}>
            <strong>{relativeTime(event.entryOffsetMinutes)}</strong>
            <small>{event.exitOffsetMinutes > event.entryOffsetMinutes
              ? t.operationalTwin.navigationIntegrityUntil(relativeTime(event.exitOffsetMinutes))
              : t.operationalTwin.navigationIntegritySampledPoint}</small>
          </div>
          <div className={styles.weatherEvent}>
            <div className={styles.eventHeader}>
              <span>{t.operationalTwin.navigationIntegrityRegion}</span>
              <div className={styles.badges}>
                <span>{event.severity}</span>
                <span>{t.operationalTwin.confidence[event.confidence]}</span>
              </div>
            </div>
            <strong>{t.operationalTwin.navigationIntegrityAhead}</strong>
            <small>{t.operationalTwin.navigationIntegrityAffected(event.affectedAircraftCount, event.localAircraftCount, event.networkAircraftCount)}</small>
            <small>{t.operationalTwin.navigationIntegrityBaseline(event.baselineMaturity)}</small>
          </div>
        </li>)}
      </ol> : <p className={styles.status}>{t.operationalTwin.navigationIntegrityNoEvents}</p>}
      <p className={styles.disclaimer}>{t.operationalTwin.navigationIntegrityDisclaimer}</p>
    </section>}

    <h3>{t.operationalTwin.events}</h3>
    {data.events.length ? <ol className={styles.timeline}>
      {data.events.slice(0, 12).map((event) => <li key={event.id}>
        <div className={styles.time}>
          <strong>{relativeTime(event.offsetMinutes)}</strong>
          <time dateTime={event.at}>{formatTime(event.at)}</time>
        </div>
        <span className={styles.dot} aria-hidden="true" />
        <div className={styles.event}>
          <div className={styles.eventHeader}>
            <span>{eventTypeLabel(event.type)}</span>
            <div className={styles.badges}>
              <span>{t.operationalTwin.provenance[event.provenance]}</span>
              <span>{t.operationalTwin.confidence[event.confidence]}</span>
            </div>
          </div>
          <strong>{event.title}</strong>
          {event.detail && <small>{event.detail}</small>}
          <small>{event.source}</small>
        </div>
      </li>)}
    </ol> : <p className={styles.status}>{t.operationalTwin.noEvents}</p>}

    <details className={styles.limitations}>
      <summary>{t.operationalTwin.limitations}</summary>
      <ul>{data.limitations.map((item) => <li key={item}>{t.operationalTwin.limitationText[item]}</li>)}</ul>
    </details>
    <p className={styles.disclaimer}>{t.operationalTwin.disclaimer}</p>
  </section>;
}
