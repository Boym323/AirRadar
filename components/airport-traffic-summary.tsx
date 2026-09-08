"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { Airport } from "@/lib/airports/types";
import type {
  AirportTrafficAirport,
  AirportTrafficRange,
  AirportTrafficRouteCount,
  AirportTrafficSummary,
} from "@/lib/airport-traffic/types";
import { aircraftAirportHref, aircraftHistoryHref } from "@/lib/aircraft/detail-links";
import { formatDateTime, formatNumber, t } from "@/lib/i18n";

function airportLabel(airport: AirportTrafficAirport | null): string {
  return airport?.iataCode ?? airport?.icaoCode ?? t.common.emptyValue;
}

function airportLink(airport: AirportTrafficAirport | null): ReactNode {
  if (!airport) return <span>{t.common.emptyValue}</span>;
  return <Link className="airport-link" href={aircraftAirportHref(airport.icaoCode)}>{airportLabel(airport)}</Link>;
}

function countLabel(count: number): string {
  return `${formatNumber(count)}×`;
}

function routeList(
  routes: AirportTrafficRouteCount[],
  airport: Airport,
  direction: "arrival" | "departure",
): ReactNode {
  if (routes.length === 0) return <div className="airport-traffic-empty-list">{t.airportTraffic.noRouteData}</div>;
  const current = airport.iataCode ?? airport.icaoCode;
  return <ol className="airport-traffic-list">
    {routes.map((route) => <li key={route.airport.icaoCode}>
      <span className="airport-traffic-route">
        {direction === "departure" ? <>
          <span>{current}</span><span aria-hidden="true">→</span>{airportLink(route.airport)}
        </> : <>
          {airportLink(route.airport)}<span aria-hidden="true">→</span><span>{current}</span>
        </>}
      </span>
      <strong>{countLabel(route.count)}</strong>
    </li>)}
  </ol>;
}

function dataRow(label: string, value: ReactNode): ReactNode {
  return <div className="airport-traffic-data-row"><dt>{label}</dt><dd>{value}</dd></div>;
}

export function AirportTrafficSummary({ airport }: { airport: Airport }) {
  const [range, setRange] = useState<AirportTrafficRange>("30d");
  const [summary, setSummary] = useState<AirportTrafficSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    void fetch(`/api/airports/${encodeURIComponent(airport.icaoCode)}/traffic?range=${range}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("airport traffic request failed");
        return await response.json() as AirportTrafficSummary;
      })
      .then((data) => setSummary(data))
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setSummary(null);
        setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [airport.icaoCode, range]);

  const hasTraffic = Boolean(summary && summary.flights > 0);

  return <section className="airport-card airport-traffic-card" aria-labelledby="airport-traffic-title">
    <div className="airport-traffic-header">
      <div>
        <h2 id="airport-traffic-title">{t.airportTraffic.title}</h2>
        <p>{t.airportTraffic.disclaimer}</p>
      </div>
      <div className="airport-traffic-range" role="group" aria-label={t.airportTraffic.rangeSelector}>
        {(["7d", "30d"] as const).map((option) => <button
          key={option}
          type="button"
          className={range === option ? "active" : ""}
          aria-pressed={range === option}
          onClick={() => setRange(option)}
        >{option === "7d" ? t.airportTraffic.rangeSevenDays : t.airportTraffic.rangeThirtyDays}</button>)}
      </div>
    </div>

    <div className="airport-traffic-body">
      {loading ? <div className="airport-traffic-message">{t.common.loading}</div> : error ? (
        <div className="airport-traffic-message">{t.airportTraffic.loadFailed}</div>
      ) : !summary ? null : !hasTraffic ? (
        <div className="airport-traffic-message">{t.airportTraffic.empty}</div>
      ) : <>
        <dl className="airport-traffic-stats">
          {dataRow(t.airportTraffic.flights, formatNumber(summary.flights))}
          {dataRow(t.airportTraffic.departures, formatNumber(summary.departures))}
          {dataRow(t.airportTraffic.arrivals, formatNumber(summary.arrivals))}
          {dataRow(t.airportTraffic.aircraft, formatNumber(summary.uniqueAircraft))}
          {dataRow(t.airportTraffic.activeDays, formatNumber(summary.activeDays))}
        </dl>

        <dl className="airport-traffic-capture-times">
          {dataRow(t.airportTraffic.firstCapture, formatDateTime(summary.firstCapturedAt))}
          {dataRow(t.airportTraffic.lastCapture, formatDateTime(summary.lastCapturedAt))}
        </dl>

        <div className="airport-traffic-rankings">
          <section aria-labelledby="airport-top-destinations-title">
            <h3 id="airport-top-destinations-title">{t.airportTraffic.topDestinations}</h3>
            {routeList(summary.topDestinations, airport, "departure")}
          </section>
          <section aria-labelledby="airport-top-origins-title">
            <h3 id="airport-top-origins-title">{t.airportTraffic.topOrigins}</h3>
            {routeList(summary.topOrigins, airport, "arrival")}
          </section>
          <section aria-labelledby="airport-top-aircraft-title">
            <h3 id="airport-top-aircraft-title">{t.airportTraffic.topAircraft}</h3>
            {summary.topAircraft.length === 0 ? <div className="airport-traffic-empty-list">{t.common.emptyValue}</div> : <ol className="airport-traffic-list">
              {summary.topAircraft.map((item) => <li key={item.icaoHex}>
                <Link className="airport-traffic-aircraft" href={`/aircraft/${encodeURIComponent(item.icaoHex)}`}>
                  <span>{item.registration ?? t.common.emptyValue}</span>
                  <small>{item.icaoHex}{item.aircraftType ? ` · ${item.aircraftType}` : ""}</small>
                </Link>
                <strong>{countLabel(item.count)}</strong>
              </li>)}
            </ol>}
          </section>
          <section aria-labelledby="airport-top-callsigns-title">
            <h3 id="airport-top-callsigns-title">{t.airportTraffic.topCallsigns}</h3>
            {summary.topCallsigns.length === 0 ? <div className="airport-traffic-empty-list">{t.common.emptyValue}</div> : <ol className="airport-traffic-list">
              {summary.topCallsigns.map((item) => <li key={item.callsign}><span>{item.callsign}</span><strong>{countLabel(item.count)}</strong></li>)}
            </ol>}
          </section>
        </div>

        <section className="airport-traffic-recent" aria-labelledby="airport-recent-traffic-title">
          <h3 id="airport-recent-traffic-title">{t.airportTraffic.recentTraffic}</h3>
          <ol className="airport-traffic-recent-list">
            {summary.recentTraffic.map((flight) => <li key={flight.id}>
              <time dateTime={flight.time}>{formatDateTime(flight.time)}</time>
              <span className={`airport-traffic-direction ${flight.direction}`}>{flight.direction === "departure" ? t.airportTraffic.departure : t.airportTraffic.arrival}</span>
              <span className="airport-traffic-recent-callsign">{flight.callsign ?? t.history.unknownCallsign}</span>
              <Link className="airport-traffic-aircraft-link" href={`/aircraft/${encodeURIComponent(flight.aircraft.icaoHex)}`}>
                {flight.aircraft.registration ?? flight.aircraft.icaoHex}
                <small>{flight.aircraft.icaoHex}</small>
              </Link>
              <span className="airport-traffic-counterpart">{airportLink(flight.otherAirport)}</span>
              <Link className="airport-traffic-history-link" href={aircraftHistoryHref(flight.id)} aria-label={`${t.airportTraffic.viewFlight}: ${flight.id}`}>↗</Link>
            </li>)}
          </ol>
        </section>
      </>}
    </div>
  </section>;
}
