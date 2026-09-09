"use client";

import Link from "next/link";
import type { Airport } from "@/lib/airports/types";
import { AirportMap } from "@/components/airport-map";
import { AirportTrafficSummary } from "@/components/airport-traffic-summary";
import { AirportWeatherPanel } from "@/components/airport-weather";
import { formatCoordinate, t } from "@/lib/i18n";
import { formatDistance, formatTrack } from "@/lib/i18n";
import type { NearbyAirport } from "@/lib/server/nearby-airports";

function value(value: string | null): string {
  return value || t.common.emptyValue;
}

export function AirportDetail({ airport, nearbyAirports = [] }: { airport: Airport; nearbyAirports?: NearbyAirport[] }) {
  const airportCodes = airport.iataCode ? `${airport.iataCode} · ${airport.icaoCode}` : airport.icaoCode;
  const location = [airport.city, airport.country].filter(Boolean).join(" · ");

  return <main className="airport-page">
    <header className="airport-page-header">
      <Link className="back-link" href="/">{t.airport.backToRadar}</Link>
      <div className="airport-kicker">{airportCodes}</div>
      <h1>{airport.name}</h1>
      {location && <p>{location}</p>}
    </header>

    <div className="airport-layout">
      <div className="airport-content">
        <section className="airport-card" aria-labelledby="airport-information-title">
          <h2 id="airport-information-title">{t.airport.information}</h2>
          <dl className="airport-info-grid">
            <div><dt>{t.airport.icao}</dt><dd>{airport.icaoCode}</dd></div>
            <div><dt>{t.airport.iata}</dt><dd>{value(airport.iataCode)}</dd></div>
            <div><dt>{t.airport.name}</dt><dd>{airport.name}</dd></div>
            <div><dt>{t.airport.city}</dt><dd>{value(airport.city)}</dd></div>
            <div><dt>{t.airport.country}</dt><dd>{value(airport.country)}</dd></div>
            <div><dt>{t.airport.coordinates}</dt><dd>{formatCoordinate(airport.latitude)}, {formatCoordinate(airport.longitude)}</dd></div>
          </dl>
        </section>

        <AirportTrafficSummary airport={airport} />

        <section className="airport-card airport-nearby-card" aria-labelledby="airport-nearby-title">
          <h2 id="airport-nearby-title">{t.airport.nearbyTitle}</h2>
          <p className="airport-nearby-description">{t.airport.nearbyDescription}</p>
          {nearbyAirports.length === 0 ? <div className="airport-traffic-message">{t.airport.nearbyEmpty}</div> : <ol className="airport-nearby-list">
            {nearbyAirports.map((item) => <li key={item.airport.icaoCode}>
              <Link className="airport-nearby-name" href={`/airports/${encodeURIComponent(item.airport.icaoCode)}`}>
                <span>{item.airport.iataCode ? `${item.airport.iataCode} · ` : ""}{item.airport.icaoCode}</span>
                <small>{item.airport.name}</small>
              </Link>
              <span className="airport-nearby-meta"><span>{formatDistance(item.distanceKm)}</span><span>{formatTrack(item.bearing)}</span></span>
            </li>)}
          </ol>}
        </section>

        <section className="airport-card" aria-labelledby="airport-weather-title">
          <h2 id="airport-weather-title">{t.weather.title}</h2>
          <AirportWeatherPanel airport={airport} />
        </section>
      </div>

      <section className="airport-card airport-map-card" aria-labelledby="airport-map-title">
        <h2 id="airport-map-title">{t.airport.map}</h2>
        <AirportMap airport={airport} />
      </section>
    </div>
  </main>;
}
