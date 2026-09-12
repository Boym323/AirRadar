"use client";

import Link from "next/link";
import type { Airport } from "@/lib/airports/types";
import { AirportMap } from "@/components/airport-map";
import { AirportTrafficSummary } from "@/components/airport-traffic-summary";
import { AirportMovements } from "@/components/airport-movements";
import { AirportWeatherPanel } from "@/components/airport-weather";
import { AirportNearbyAircraft } from "@/components/airport-nearby-aircraft";
import { formatCoordinate, t } from "@/lib/i18n";
import { formatDistance, formatTrack } from "@/lib/i18n";
import type { NearbyAirport } from "@/lib/server/nearby-airports";
import type { AirportInfrastructure } from "@/lib/airports/infrastructure";
import { formatFrequencyMhz, formatNavaidFrequency, formatRunwayDimension, runwaySurfaceLabel, sortAirportFrequencies, sortAirportRunways } from "@/lib/airports/infrastructure";

function value(value: string | null | undefined): string {
  return value || t.common.emptyValue;
}

function airportTypeLabel(type: string | null | undefined): string {
  if (!type) return t.common.emptyValue;
  return type.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function AirportInfrastructureSections({ infrastructure }: { infrastructure: AirportInfrastructure }) {
  const runways = sortAirportRunways(infrastructure.runways);
  const frequencies = sortAirportFrequencies(infrastructure.frequencies);
  return <>
    <section className="airport-card airport-infrastructure-card" aria-labelledby="airport-runways-title">
      <h2 id="airport-runways-title">{t.airport.runways}</h2>
      {runways.length === 0 ? <div className="airport-infrastructure-empty">{t.airport.noRunwayData}</div> : <div className="airport-runway-list">
        {runways.map((runway) => <article className={`airport-runway${runway.closed === true ? " is-closed" : ""}`} key={runway.id}>
          <div className="airport-runway-heading"><strong>{runway.leIdent || runway.heIdent ? `${runway.leIdent ?? "?"} / ${runway.heIdent ?? "?"}` : t.airport.runway}</strong>{runway.closed === true && <span className="airport-data-badge">{t.airport.closed}</span>}</div>
          <div className="airport-runway-meta"><span>{formatRunwayDimension(runway.lengthFt, runway.widthFt)}</span><span>{runwaySurfaceLabel(runway.surface)}</span>{runway.lighted === true && <span>{t.airport.lighted}</span>}</div>
          <div className="airport-runway-ends">{[{
            ident: runway.leIdent, heading: runway.leHeadingDegT, elevation: runway.leElevationFt, displaced: runway.leDisplacedThresholdFt,
          }, { ident: runway.heIdent, heading: runway.heHeadingDegT, elevation: runway.heElevationFt, displaced: runway.heDisplacedThresholdFt }].filter((end) => end.ident || end.heading !== null || end.elevation !== null || end.displaced !== null).map((end, index) => <div key={`${runway.id}-${index}`}><strong>{end.ident ?? "?"}</strong><span>{end.heading !== null ? `${t.airport.heading} ${Math.round(end.heading).toString().padStart(3, "0")}°` : null}</span><span>{end.elevation !== null ? `${t.airport.elevation} ${end.elevation.toLocaleString()} ft` : null}</span><span>{end.displaced !== null ? `${t.airport.displacedThreshold} ${end.displaced.toLocaleString()} ft` : null}</span></div>)}</div>
        </article>)}
      </div>}
    </section>

    <section className="airport-card airport-infrastructure-card" aria-labelledby="airport-frequencies-title">
      <h2 id="airport-frequencies-title">{t.airport.frequencies}</h2>
      {frequencies.length === 0 ? <div className="airport-infrastructure-empty">{t.airport.noFrequencyData}</div> : <div className="airport-frequency-list">
        {frequencies.map((frequency) => <div className="airport-frequency" key={frequency.id}><strong>{frequency.type}</strong><span className="airport-frequency-value">{formatFrequencyMhz(frequency.frequencyMhz)} MHz</span>{frequency.description && <small>{frequency.description}</small>}</div>)}
      </div>}
    </section>

    <section className="airport-card airport-infrastructure-card" aria-labelledby="airport-navaids-title">
      <h2 id="airport-navaids-title">{t.airport.navaids}</h2>
      {infrastructure.navaids.length === 0 ? <div className="airport-infrastructure-empty">{t.airport.noNavaidData}</div> : <div className="airport-navaid-list">
        {infrastructure.navaids.map((navaid) => <div className="airport-navaid" key={navaid.id}><strong>{navaid.ident}</strong><span>{navaid.type}</span><span>{formatNavaidFrequency(navaid.type, navaid.frequencyKhz)}</span>{navaid.dmeChannel && <span>{t.airport.channel} {navaid.dmeChannel}</span>}<small>{navaid.name}</small></div>)}
      </div>}
    </section>
  </>;
}

export function AirportDetail({ airport, infrastructure = { runways: [], frequencies: [], navaids: [] }, nearbyAirports = [] }: { airport: Airport; infrastructure?: AirportInfrastructure; nearbyAirports?: NearbyAirport[] }) {
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
            <div><dt>{t.airport.elevation}</dt><dd>{airport.elevationFt !== null && airport.elevationFt !== undefined ? `${Math.round(airport.elevationFt * 0.3048).toLocaleString()} m / ${airport.elevationFt.toLocaleString()} ft` : t.common.notReported}</dd></div>
            <div><dt>{t.airport.type}</dt><dd>{airportTypeLabel(airport.type)}</dd></div>
            <div><dt>{t.airport.scheduledService}</dt><dd>{airport.scheduledService === null || airport.scheduledService === undefined ? t.common.notReported : airport.scheduledService ? t.common.yes : t.common.no}</dd></div>
            <div><dt>{t.airport.coordinates}</dt><dd>{formatCoordinate(airport.latitude)}, {formatCoordinate(airport.longitude)}</dd></div>
          </dl>
        </section>

        <section className="airport-card" aria-labelledby="airport-weather-title">
          <h2 id="airport-weather-title">{t.weather.title}</h2>
          {/* Existing contract: <AirportWeatherPanel airport={airport} />; runway wind is additive. */}
          <AirportWeatherPanel airport={airport} runways={infrastructure.runways} />
        </section>

        <AirportInfrastructureSections infrastructure={infrastructure} />

        <AirportNearbyAircraft airport={airport} />

        <AirportTrafficSummary airport={airport} />

        <AirportMovements airport={airport} />

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

      </div>

      <section className="airport-card airport-map-card" aria-labelledby="airport-map-title">
        <h2 id="airport-map-title">{t.airport.map}</h2>
        <AirportMap airport={airport} infrastructure={infrastructure} />
      </section>
    </div>
    <p className="airport-data-source">{t.airport.dataSource}</p>
  </main>;
}
