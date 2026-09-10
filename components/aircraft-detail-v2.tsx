"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AircraftView } from "@/lib/aircraft/types";
import type { AircraftPhoto, AircraftPhotoApiResponse } from "@/lib/aircraft/photo";
import { aircraftAirportHref, aircraftFlightHref, aircraftWatchlistHref } from "@/lib/aircraft/detail-links";
import type { AircraftDetailResponse, AircraftHistoryAirport, AircraftHistoryAirportCount, AircraftHistoryRange, AircraftHistorySummary, AircraftLifetimeStats, HistoryFlightSummary, HistoryResponse } from "@/lib/server/history";
import { formatAge, formatAltitude, formatDateTime, formatDistance, formatNumber, formatSpeed, formatTime, formatTrack, t } from "@/lib/i18n";
import { FlightRouteWeather } from "@/components/airport-weather";

function valueOrEmpty(value: string | null | undefined): string {
  return value || t.common.emptyValue;
}

export { aircraftAirportHref, aircraftFlightHref } from "@/lib/aircraft/detail-links";

function flightDuration(flight: HistoryFlightSummary): string {
  const start = Date.parse(flight.startTime);
  const end = Date.parse(flight.endTime ?? flight.lastSeenAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return t.common.emptyValue;
  const minutes = Math.max(0, Math.round((end - start) / 60_000));
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (!hours) return `${remainingMinutes} min`;
  return `${hours} h ${remainingMinutes} min`;
}

function durationBetween(startValue: string | null | undefined, endValue: string | null | undefined): string {
  if (!startValue || !endValue) return t.common.emptyValue;
  const start = Date.parse(startValue);
  const end = Date.parse(endValue);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return t.common.emptyValue;
  const minutes = Math.max(0, Math.round((end - start) / 60_000));
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (!hours) return `${remainingMinutes} min`;
  return `${hours} h ${remainingMinutes} min`;
}

function AirportCodeLink({ code }: { code: string | null }): ReactNode {
  if (!code) return <span>{t.common.emptyValue}</span>;
  return <Link className="airport-link" href={aircraftAirportHref(code)}>{code}</Link>;
}

function DetailValue({ label, children }: { label: string; children: ReactNode }) {
  return <div><div className="detail-item-label">{label}</div><div className="detail-item-value">{children}</div></div>;
}

type AltitudeChartPoint = Pick<HistoryResponse["positions"][number], "recordedAt" | "altitude">;

function uniqueAltitudePoints(points: AltitudeChartPoint[]): AltitudeChartPoint[] {
  const byTimestamp = new Map<string, AltitudeChartPoint>();
  for (const point of points) {
    if (point.altitude === null || !Number.isFinite(point.altitude) || !Number.isFinite(Date.parse(point.recordedAt))) continue;
    byTimestamp.set(point.recordedAt, point);
  }
  return [...byTimestamp.values()].sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));
}

export function AircraftAltitudeChart({
  points,
  livePoint,
  loading = false,
}: {
  points: AltitudeChartPoint[];
  livePoint?: AltitudeChartPoint | null;
  loading?: boolean;
}) {
  const allPoints = uniqueAltitudePoints(livePoint ? [...points, livePoint] : points);
  const anchor = allPoints.at(-1)?.recordedAt ? Date.parse(allPoints.at(-1)!.recordedAt) : Date.now();
  const chartPoints = allPoints.filter((point) => Date.parse(point.recordedAt) >= anchor - 30 * 60_000);
  const values = chartPoints.map((point) => point.altitude as number);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const span = Math.max(1, max - min);
  const width = 360;
  const height = 120;
  const horizontalPadding = 8;
  const verticalPadding = 10;
  const polyline = chartPoints.map((point, index) => {
    const x = chartPoints.length <= 1
      ? width / 2
      : horizontalPadding + (index / (chartPoints.length - 1)) * (width - horizontalPadding * 2);
    const y = height - verticalPadding - (((point.altitude as number) - min) / span) * (height - verticalPadding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return <section className="aircraft-card aircraft-altitude-card" aria-labelledby="aircraft-altitude-title" aria-busy={loading}>
    <div className="aircraft-chart-heading">
      <div>
        <h2 id="aircraft-altitude-title">{t.aircraft.altitudeChart}</h2>
        <span>{chartPoints.length ? `${formatAltitude(min)} – ${formatAltitude(max)}` : t.aircraft.chartNoData}</span>
      </div>
      {loading && <span className="aircraft-chart-loading">{t.common.loading}</span>}
    </div>
    {chartPoints.length > 0 ? <svg className="aircraft-altitude-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t.aircraft.altitudeChart}>
      <line x1="8" x2="352" y1="10" y2="10" />
      <line x1="8" x2="352" y1="60" y2="60" />
      <line x1="8" x2="352" y1="110" y2="110" />
      <polyline points={polyline} />
    </svg> : <div className="aircraft-chart-empty">{t.aircraft.chartNoData}</div>}
    {chartPoints.length > 0 && <div className="aircraft-chart-meta"><span>{formatTime(chartPoints[0].recordedAt)}</span><span>{chartPoints.length} {t.aircraft.positions.toLowerCase()}</span><span>{formatTime(chartPoints.at(-1)?.recordedAt)}</span></div>}
  </section>;
}

function HistoryAirportLink({ airport }: { airport: AircraftHistoryAirport | null }): ReactNode {
  if (!airport) return <span>{t.common.emptyValue}</span>;
  return <Link className="airport-link" href={aircraftAirportHref(airport.icaoCode)}>{airport.iataCode ?? airport.icaoCode}</Link>;
}

function RouteEndpoint({ code, airport }: { code: string | null; airport: NonNullable<NonNullable<AircraftView["enrichment"]>["route"]>["originAirport"] }): ReactNode {
  if (!code && !airport) return <span>{t.common.emptyValue}</span>;
  const label = airport?.iataCode || airport?.icaoCode || code || t.common.emptyValue;
  const name = airport?.name;
  return <span className="aircraft-route-endpoint"><strong>{airport ? <Link className="airport-link" href={aircraftAirportHref(airport.icaoCode)}>{label}</Link> : label}</strong>{name && <small>{name}</small>}</span>;
}

export function AircraftHistorySummaryCard({
  icaoHex,
  summary,
}: {
  icaoHex: string;
  summary: AircraftHistorySummary | null;
}) {
  const [range, setRange] = useState<AircraftHistoryRange>(summary?.range ?? "30d");
  const [currentSummary, setCurrentSummary] = useState<AircraftHistorySummary | null>(summary);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    setRange(summary?.range ?? "30d");
    setCurrentSummary(summary);
    setError(null);
  }, [summary]);

  async function selectRange(nextRange: AircraftHistoryRange): Promise<void> {
    if (nextRange === range || icaoHex === t.common.emptyValue) return;
    const id = ++requestId.current;
    setRange(nextRange);
    setLoading(true);
    setError(null);
    setCurrentSummary(null);
    try {
      const response = await fetch(`/api/aircraft/${encodeURIComponent(icaoHex)}?range=${nextRange}`, { cache: "no-store" });
      if (!response.ok) throw new Error(t.history.aircraftHistoryLoadFailed);
      const result = await response.json() as AircraftDetailResponse;
      if (id !== requestId.current) return;
      setCurrentSummary(result.historySummary ?? null);
    } catch (requestError) {
      if (id === requestId.current) setError(requestError instanceof Error ? requestError.message : t.history.aircraftHistoryLoadFailed);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }

  const days = range === "7d" ? 7 : 30;
  const hasFlights = Boolean(currentSummary && currentSummary.flightCount > 0);
  return (
    <section className="aircraft-card aircraft-history-card" aria-labelledby="aircraft-history-title" aria-busy={loading}>
      <div className="aircraft-history-header">
        <div>
          <h2 id="aircraft-history-title">{t.history.aircraftHistory}</h2>
          <div className="aircraft-history-period">{t.history.periodLabel(days)}</div>
        </div>
        <div className="aircraft-history-range" role="group" aria-label={t.history.aircraftHistory}>
          <button type="button" className={range === "7d" ? "active" : ""} aria-pressed={range === "7d"} onClick={() => void selectRange("7d")}>{t.history.rangeSevenDays}</button>
          <button type="button" className={range === "30d" ? "active" : ""} aria-pressed={range === "30d"} onClick={() => void selectRange("30d")}>{t.history.rangeThirtyDays}</button>
        </div>
      </div>

      {loading ? <div className="detail-disclaimer">{t.common.loading}</div> : error ? <div className="detail-disclaimer">{error}</div> : !hasFlights ? (
        <div className="aircraft-history-empty">{t.history.aircraftHistoryEmpty}</div>
      ) : currentSummary ? (
        <>
          <div className="aircraft-history-stats">
            <DetailValue label={t.history.capturedFlights}>{formatNumber(currentSummary.flightCount)}</DetailValue>
            <DetailValue label={t.history.activeDays}>{formatNumber(currentSummary.activeDays)}</DetailValue>
            <DetailValue label={t.history.firstCapture}>{formatDateTime(currentSummary.firstSeenAt)}</DetailValue>
            <DetailValue label={t.history.lastCapture}>{formatDateTime(currentSummary.lastSeenAt)}</DetailValue>
            <DetailValue label={t.history.mostFrequentCallsign}>{currentSummary.topCallsigns[0]?.callsign ?? t.common.emptyValue}</DetailValue>
            <DetailValue label={t.history.mostFrequentOrigin}><HistoryAirportLink airport={currentSummary.topOrigin} /></DetailValue>
            <DetailValue label={t.history.mostFrequentDestination}><HistoryAirportLink airport={currentSummary.topDestination} /></DetailValue>
          </div>

          <div className="aircraft-history-lists">
            {currentSummary.topCallsigns.length > 0 && <div>
              <h3>{t.history.topCallsigns}</h3>
              <ol className="aircraft-history-list">
                {currentSummary.topCallsigns.map((entry) => <li key={entry.callsign}><span>{entry.callsign}</span><strong>{formatNumber(entry.count)}×</strong></li>)}
              </ol>
            </div>}
            {currentSummary.topRoutes.length > 0 && <div>
              <h3>{t.history.topRoutes}</h3>
              <ol className="aircraft-history-list">
                {currentSummary.topRoutes.map((route) => <li key={`${route.origin.icaoCode}-${route.destination.icaoCode}`}>
                  <span><HistoryAirportLink airport={route.origin} /> <span aria-hidden="true">→</span> <HistoryAirportLink airport={route.destination} /></span>
                  <strong>{formatNumber(route.count)}×</strong>
                </li>)}
              </ol>
            </div>}
          </div>
        </>
      ) : null}
    </section>
  );
}

export function AircraftRecentFlights({
  recentFlights,
  loading = false,
  error = null,
}: {
  recentFlights: HistoryFlightSummary[];
  loading?: boolean;
  error?: string | null;
}) {
  return (
    <section className="detail-section aircraft-recent-flights" aria-labelledby="aircraft-recent-flights-title">
      <h3 id="aircraft-recent-flights-title">{t.history.recentFlights}</h3>
      {loading ? <div className="detail-disclaimer">{t.common.loading}</div> : error ? <div className="detail-disclaimer">{error}</div> : recentFlights.length === 0 ? (
        <div className="detail-disclaimer">{t.history.recentFlightsEmpty}</div>
      ) : (
        <div className="aircraft-recent-flight-list">
          {recentFlights.slice(0, 10).map((flight) => (
            <article className="aircraft-recent-flight" key={flight.id}>
              <div className="aircraft-recent-flight-heading">
                <Link className="aircraft-recent-flight-history" href={aircraftFlightHref(flight.id)} aria-label={`${t.history.detailFlight}: ${flight.callsign || t.history.unknownCallsign}`}>
                  <strong>{flight.callsign || t.history.unknownCallsign}</strong>
                  <span>{formatDateTime(flight.startTime)}–{formatDateTime(flight.endTime ?? flight.lastSeenAt)}</span>
                </Link>
                <span className="aircraft-recent-flight-type">{flight.aircraftType || t.aircraft.unknownAircraftType}</span>
              </div>
              <div className="aircraft-recent-flight-route" aria-label={t.route.originDestination}>
                <AirportCodeLink code={flight.origin} />
                <span aria-hidden="true"> → </span>
                <AirportCodeLink code={flight.destination} />
              </div>
              <div className="aircraft-recent-flight-meta">
                <DetailValue label={t.history.duration}>{flightDuration(flight)}</DetailValue>
                <DetailValue label={t.history.maxAltitude}>{formatAltitude(flight.maxAltitude)}</DetailValue>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function LifetimeAirportList({ entries }: { entries: AircraftHistoryAirportCount[] }): ReactNode {
  if (!entries.length) return <span>{t.common.emptyValue}</span>;
  return <ol className="aircraft-history-list">{entries.map((entry) => <li key={entry.airport.icaoCode}><HistoryAirportLink airport={entry.airport} /><strong>{formatNumber(entry.count)}×</strong></li>)}</ol>;
}

export function AircraftLifetimeStatsCard({ stats }: { stats: AircraftLifetimeStats | null }) {
  const hasHistory = Boolean(stats && stats.flightCount > 0);
  return <section className="aircraft-card aircraft-lifetime-card" aria-labelledby="aircraft-lifetime-title">
    <h2 id="aircraft-lifetime-title">{t.history.lifetimeStats}</h2>
    {!hasHistory || !stats ? <div className="aircraft-history-empty">{t.history.lifetimeStatsEmpty}</div> : <>
      <div className="aircraft-history-stats">
        <DetailValue label={t.history.firstEverObserved}>{formatDateTime(stats.firstObservedAt)}</DetailValue>
        <DetailValue label={t.history.lastObserved}>{formatDateTime(stats.lastObservedAt)}</DetailValue>
        <DetailValue label={t.history.totalFlightInstances}>{formatNumber(stats.flightCount)}</DetailValue>
        <DetailValue label={t.history.activeDays}>{formatNumber(stats.activeDays)}</DetailValue>
      </div>
      <div className="aircraft-history-lists aircraft-lifetime-lists">
        <div><h3>{t.history.topCallsigns}</h3>{stats.topCallsigns.length ? <ol className="aircraft-history-list">{stats.topCallsigns.map((entry) => <li key={entry.callsign}><span>{entry.callsign}</span><strong>{formatNumber(entry.count)}×</strong></li>)}</ol> : <div className="aircraft-history-empty">{t.common.emptyValue}</div>}</div>
        <div><h3>{t.history.topOrigins}</h3><LifetimeAirportList entries={stats.topOrigins} /></div>
        <div><h3>{t.history.topDestinations}</h3><LifetimeAirportList entries={stats.topDestinations} /></div>
        <div><h3>{t.history.topRoutes}</h3>{stats.topRoutes.length ? <ol className="aircraft-history-list">{stats.topRoutes.map((route) => <li key={`${route.origin.icaoCode}-${route.destination.icaoCode}`}><span><HistoryAirportLink airport={route.origin} /> <span aria-hidden="true">→</span> <HistoryAirportLink airport={route.destination} /></span><strong>{formatNumber(route.count)}×</strong></li>)}</ol> : <div className="aircraft-history-empty">{t.common.emptyValue}</div>}</div>
      </div>
    </>}
  </section>;
}

function AircraftPhotoCard({ icaoHex, registration }: { icaoHex: string; registration: string | null | undefined }) {
  const [result, setResult] = useState<AircraftPhotoApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageFailed, setImageFailed] = useState(false);
  const lookupHex = icaoHex === t.common.emptyValue ? null : icaoHex;

  useEffect(() => {
    if (!lookupHex) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setResult(null);
    setImageFailed(false);
    void fetch(`/api/aircraft/${encodeURIComponent(lookupHex)}/photo`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("aircraft photo request failed");
        return await response.json() as AircraftPhotoApiResponse;
      })
      .then((value) => {
        if (active) setResult(value);
      })
      .catch(() => {
        if (active) setResult(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [lookupHex]);

  const photo: AircraftPhoto | null = result?.photo ?? null;
  if (!lookupHex || imageFailed || (!loading && (!result?.enabled || !photo))) return null;

  const identity = registration?.trim() || lookupHex;
  return (
    <section className="aircraft-card aircraft-photo-card" aria-labelledby="aircraft-photo-title">
      <h2 id="aircraft-photo-title">{t.aircraft.photoTitle}</h2>
      {loading || !photo ? <div className="detail-disclaimer">{t.common.loading}</div> : (
        <>
          <a className="aircraft-photo-link" href={photo.sourceUrl} target="_blank" rel="noreferrer">
            {/* The server validates this URL against the Planespotters host allowlist. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="aircraft-photo-thumbnail"
              src={photo.thumbnailUrl}
              alt={`${t.aircraft.photoAlt} ${identity}`}
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          </a>
          <div className="aircraft-photo-attribution">
            <span>{photo.attribution ?? t.aircraft.photoPhotographerUnknown}</span>
            <span aria-hidden="true"> · </span>
            <a href={photo.sourceUrl} target="_blank" rel="noreferrer">{t.aircraft.photoSource}</a>
          </div>
        </>
      )}
    </section>
  );
}

export function AircraftDetailV2({
  detail,
  liveAircraft,
  loading = false,
  error = null,
  backHref = "/",
}: {
  detail: AircraftDetailResponse | null;
  liveAircraft: AircraftView | null;
  loading?: boolean;
  error?: string | null;
  backHref?: string;
}) {
  const databaseAircraft = detail?.aircraft;
  const metadata = liveAircraft?.enrichment?.metadata;
  const icaoHex = liveAircraft?.icaoHex ?? databaseAircraft?.icaoHex ?? t.common.emptyValue;
  const registration = liveAircraft?.registration ?? metadata?.registration ?? databaseAircraft?.registration;
  const aircraftType = metadata?.icaoTypeCode ?? liveAircraft?.aircraftType ?? databaseAircraft?.aircraftType;
  const model = metadata?.aircraftDescription ?? liveAircraft?.aircraftDescription ?? databaseAircraft?.model;
  const manufacturer = metadata?.manufacturer ?? databaseAircraft?.manufacturer;
  const operator = metadata?.operator ?? databaseAircraft?.operator;
  const registrationCountry = metadata?.registrationCountryCode ?? metadata?.registrationCountry ?? databaseAircraft?.registrationCountryCode ?? databaseAircraft?.registrationCountry;
  const callsign = liveAircraft?.callsign || t.history.unknownCallsign;
  const route = liveAircraft?.enrichment?.route ?? null;
  const flightPlan = liveAircraft?.enrichment?.flightPlan ?? null;
  const backLink = backHref === "/history" ? "/history" : "/";
  const watchlistHref = icaoHex === t.common.emptyValue ? "/watchlist" : aircraftWatchlistHref(icaoHex, registration);
  const [flightHistory, setFlightHistory] = useState<HistoryResponse | null>(null);
  const [flightHistoryLoading, setFlightHistoryLoading] = useState(false);

  useEffect(() => {
    if (icaoHex === t.common.emptyValue) return;
    let active = true;
    setFlightHistory(null);
    setFlightHistoryLoading(true);
    void fetch(`/api/history/${encodeURIComponent(icaoHex)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("aircraft history unavailable");
        return await response.json() as HistoryResponse;
      })
      .then((result) => {
        if (active) setFlightHistory(result);
      })
      .catch(() => {
        if (active) setFlightHistory(null);
      })
      .finally(() => {
        if (active) setFlightHistoryLoading(false);
      });
    return () => { active = false; };
  }, [icaoHex]);

  const firstSeen = flightHistory?.flight?.startedAt ?? detail?.historySummary.firstSeenAt ?? null;
  const lastSeen = liveAircraft?.lastSeen ?? flightHistory?.flight?.lastSeenAt ?? detail?.historySummary.lastSeenAt ?? null;
  const livePoint = liveAircraft && liveAircraft.lat !== null && liveAircraft.altitude !== null
    ? { recordedAt: liveAircraft.lastSeen, altitude: liveAircraft.altitude }
    : null;
  const historyPoints = flightHistory?.positions ?? [];
  const sessionPoints = liveAircraft?.trail ?? [];
  const positionCount = historyPoints.length || sessionPoints.length;
  const title = liveAircraft?.callsign || registration || icaoHex;
  const sourceLabel = liveAircraft?.origin === "adsblol" ? t.aircraft.networkReceiver : t.aircraft.localReceiver;

  return (
    <main className="aircraft-page">
      <header className="aircraft-page-header">
        <Link className="back-link" href={backLink}>{t.history.backToRadar}</Link>
        <div className="aircraft-page-kicker">{t.history.aircraftDetail}</div>
        <h1>{title}</h1>
        <div className="aircraft-status-row">
          <div className={`aircraft-status ${liveAircraft ? "live" : "offline"}`}>
            {liveAircraft ? t.status.liveReceiver : t.aircraft.notCurrentlyInRange}
          </div>
          {detail?.logbook.isNew && <div className="aircraft-logbook-badge" title={t.logbook.newAircraftReason}>{t.logbook.newAircraft}</div>}
          {detail?.logbook.isRare && <div className="aircraft-logbook-badge rare" title={t.logbook.rareAircraftReason(detail.lifetimeStats.flightCount)}>{t.logbook.rareAircraft}</div>}
          {detail?.logbook.isReturning && <div className="aircraft-logbook-badge returning" title={t.logbook.returningAircraftReason(detail.logbook.returningGapDays ?? 0)}>{t.logbook.returningAircraft}</div>}
        </div>
        <div className="aircraft-page-identity"><span>{icaoHex}</span>{registration && <span>{registration}</span>}{aircraftType && <span>{aircraftType}</span>}</div>
        <div className="aircraft-page-subtitle">{[manufacturer, model].filter(Boolean).join(" ") || t.aircraft.unknownAircraftType}{operator ? ` · ${operator}` : ""}</div>
        {route && <div className="aircraft-page-route" aria-label={t.route.originDestination}>
          <span>{route.originAirport?.iataCode || route.originAirport?.icaoCode || route.origin || t.common.emptyValue}</span>
          <span aria-hidden="true">→</span>
          <strong>{callsign}</strong>
          <span aria-hidden="true">→</span>
          <span>{route.destinationAirport?.iataCode || route.destinationAirport?.icaoCode || route.destination || t.common.emptyValue}</span>
        </div>}
        <div className="aircraft-page-live-status"><span>{t.aircraft.statusAdsb}</span><span>{liveAircraft ? t.aircraft.updatedAgo(formatAge(liveAircraft.seenSeconds)) : t.aircraft.notCurrentlyInRange}</span></div>
      </header>

      {liveAircraft && <section className="aircraft-live-hero" aria-label={t.aircraft.liveAdsb}>
        <div><strong>{formatAltitude(liveAircraft.altitude)}</strong><span>{t.aircraft.altitude}</span></div>
        <div><strong>{formatSpeed(liveAircraft.groundSpeed)}</strong><span>{t.aircraft.groundSpeed}</span></div>
        <div><strong>{formatTrack(liveAircraft.track)}</strong><span>{t.aircraft.track}</span></div>
        <div><strong>{liveAircraft.verticalRate === null ? t.common.emptyValue : `${liveAircraft.verticalRate > 0 ? "+" : ""}${formatNumber(liveAircraft.verticalRate)} ft/min`}</strong><span>{t.aircraft.verticalRate}</span></div>
      </section>}

      {route && <FlightRouteWeather originAirport={route.originAirport} destinationAirport={route.destinationAirport} />}

      <div className="aircraft-page-layout">
        <div className="aircraft-primary-column">
          <section className="aircraft-card" aria-labelledby="aircraft-information-title">
            <h2 id="aircraft-information-title">{t.aircraft.flightData}</h2>
            <div className="detail-grid aircraft-detail-grid">
              <DetailValue label={t.aircraft.icaoHex}>{icaoHex}</DetailValue>
              <DetailValue label={t.aircraft.registration}>{valueOrEmpty(registration)}</DetailValue>
              <DetailValue label={t.aircraft.currentCallsign}>{valueOrEmpty(liveAircraft?.callsign)}</DetailValue>
              <DetailValue label={t.aircraft.aircraftType}>{valueOrEmpty(aircraftType)}</DetailValue>
              <DetailValue label={t.aircraft.manufacturer}>{valueOrEmpty(manufacturer)}</DetailValue>
              <DetailValue label={t.aircraft.modelType}>{valueOrEmpty(model)}</DetailValue>
              <DetailValue label={t.aircraft.operator}>{valueOrEmpty(operator)}</DetailValue>
              <DetailValue label={t.aircraft.registrationCountry}>{valueOrEmpty(registrationCountry)}</DetailValue>
              <DetailValue label={t.aircraft.squawk}>{valueOrEmpty(liveAircraft?.squawk)}</DetailValue>
              <DetailValue label={t.aircraft.emergency}>{valueOrEmpty(liveAircraft?.emergency)}</DetailValue>
              <DetailValue label={t.aircraft.source}>{valueOrEmpty(liveAircraft?.sourceType ?? liveAircraft?.source)}</DetailValue>
            </div>
            <div className="watchlist-actions"><Link className="primary-button" href={watchlistHref}>{t.watchlist.followAircraft}</Link></div>

            <section className="detail-section" aria-labelledby="aircraft-live-title">
              <h3 id="aircraft-live-title">{t.aircraft.movement}</h3>
              {liveAircraft ? (
                <div className="detail-grid">
                  <DetailValue label={t.aircraft.altitude}>{formatAltitude(liveAircraft.altitude)}</DetailValue>
                  <DetailValue label={t.aircraft.groundSpeed}>{formatSpeed(liveAircraft.groundSpeed)}</DetailValue>
                  <DetailValue label={t.aircraft.track}>{formatTrack(liveAircraft.track)}</DetailValue>
                  <DetailValue label={t.aircraft.distance}>{formatDistance(liveAircraft.distanceKm)}</DetailValue>
                  <DetailValue label={t.aircraft.squawk}>{valueOrEmpty(liveAircraft.squawk)}</DetailValue>
                  <DetailValue label={t.aircraft.emergency}>{valueOrEmpty(liveAircraft.emergency)}</DetailValue>
                </div>
              ) : <div className="detail-disclaimer">{t.aircraft.notCurrentlyInRange}</div>}
            </section>

            <section className="detail-section" aria-labelledby="aircraft-provenance-title">
              <h3 id="aircraft-provenance-title">{t.aircraft.provenance}</h3>
              <div className="detail-grid">
                <DetailValue label={t.aircraft.aircraftSource}>{valueOrEmpty(metadata?.source)}</DetailValue>
                <DetailValue label={t.aircraft.routeSource}>{valueOrEmpty(route?.source ?? flightPlan?.source)}</DetailValue>
                <DetailValue label={t.aircraft.positionSourceLabel}>{sourceLabel}</DetailValue>
              </div>
            </section>
          </section>
          {(route || flightPlan) && <section className="aircraft-card aircraft-route-card" aria-labelledby="aircraft-route-title">
            <h2 id="aircraft-route-title">{t.route.originDestination}</h2>
            {route && <div className="aircraft-route-endpoints">
              <RouteEndpoint code={route.origin} airport={route.originAirport} />
              <span className="aircraft-route-arrow" aria-hidden="true">↓</span>
              <RouteEndpoint code={route.destination} airport={route.destinationAirport} />
            </div>}
            {flightPlan && <div className="detail-grid aircraft-flight-plan-grid">
              <DetailValue label={t.flightPlan.scheduledDeparture}>{valueOrEmpty(flightPlan.scheduledDeparture)}</DetailValue>
              <DetailValue label={t.flightPlan.actualDeparture}>{valueOrEmpty(flightPlan.actualDeparture)}</DetailValue>
              <DetailValue label={t.flightPlan.scheduledArrival}>{valueOrEmpty(flightPlan.scheduledArrival)}</DetailValue>
              <DetailValue label={t.flightPlan.estimatedArrival}>{valueOrEmpty(flightPlan.estimatedArrival)}</DetailValue>
              <DetailValue label={t.flightPlan.filedRoute}>{valueOrEmpty(flightPlan.filedRoute)}</DetailValue>
              <DetailValue label={t.flightPlan.waypoints}>{flightPlan.waypoints.length ? flightPlan.waypoints.join(" · ") : t.common.emptyValue}</DetailValue>
            </div>}
            <div className="detail-disclaimer">{t.aircraft.routeDisclaimer}</div>
          </section>}
          <AircraftPhotoCard icaoHex={icaoHex} registration={registration} />
          <AircraftAltitudeChart points={[...historyPoints, ...sessionPoints]} livePoint={livePoint} loading={flightHistoryLoading} />
          <section className="aircraft-card aircraft-timeline-card" aria-labelledby="aircraft-timeline-title">
            <h2 id="aircraft-timeline-title">{t.aircraft.flightData}</h2>
            <div className="aircraft-history-stats">
              <DetailValue label={t.aircraft.firstSeen}>{formatTime(firstSeen)}</DetailValue>
              <DetailValue label={t.aircraft.trackedFor}>{durationBetween(firstSeen, lastSeen)}</DetailValue>
              <DetailValue label={t.aircraft.lastUpdate}>{liveAircraft ? formatAge(liveAircraft.seenSeconds) : formatTime(lastSeen)}</DetailValue>
              <DetailValue label={t.aircraft.positions}>{formatNumber(positionCount)}</DetailValue>
            </div>
            <div className="aircraft-trail-actions"><Link className="primary-button" href={`/history?hex=${encodeURIComponent(icaoHex)}`}>{t.aircraft.showFullTrail}</Link></div>
          </section>
        </div>

        <AircraftHistorySummaryCard icaoHex={icaoHex} summary={detail?.historySummary ?? null} />

        <AircraftLifetimeStatsCard stats={detail?.lifetimeStats ?? null} />

        <section className="aircraft-card aircraft-recent-card" aria-label={t.history.recentFlights}>
          <AircraftRecentFlights recentFlights={detail?.recentFlights ?? []} loading={loading} error={error} />
        </section>
      </div>
    </main>
  );
}
