"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { aircraftAirportHref } from "@/lib/aircraft/detail-links";
import type { AircraftDetailResponse, AircraftHistoryAirport, AircraftHistoryAirportCount, AircraftHistoryRange, AircraftHistorySummary, AircraftLifetimeStats, HistoryFlightSummary, HistoryResponse } from "@/lib/server/history";
import { formatAltitude, formatDateTime, formatNumber, formatTime, t } from "@/lib/i18n";

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
  const firstTimestamp = chartPoints.length ? Date.parse(chartPoints[0].recordedAt) : anchor;
  const lastTimestamp = chartPoints.length ? Date.parse(chartPoints.at(-1)!.recordedAt) : anchor;
  const timeSpan = Math.max(1, lastTimestamp - firstTimestamp);
  const polyline = chartPoints.map((point) => {
    const x = chartPoints.length <= 1
      ? width / 2
      : horizontalPadding + ((Date.parse(point.recordedAt) - firstTimestamp) / timeSpan) * (width - horizontalPadding * 2);
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
                <div className="aircraft-recent-flight-history">
                  <strong>{flight.callsign || t.history.unknownCallsign}</strong>
                  <span>{formatDateTime(flight.startTime)}–{formatDateTime(flight.endTime ?? flight.lastSeenAt)}</span>
                </div>
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

