"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import type { Airport } from "@/lib/airports/types";
import { AirportMap } from "@/components/airport-map";
import { AirportTrafficSummary } from "@/components/airport-traffic-summary";
import { AirportMovementAnalytics } from "@/components/airport-movement-analytics";
import { AirportWeatherPanel } from "@/components/airport-weather";
import { AirportOperationsBoard } from "@/components/airport-operations-board";
import { AIRPORT_V5_VIEWS, type AirportV5View } from "@/lib/airport-v5-views";
import { useAirportOperationsController } from "@/components/airport-operations-controller";
import { AirportNearbyAircraft } from "@/components/airport-nearby-aircraft";
import { useAirportLiveTrafficController } from "@/components/airport-live-traffic-controller";
import { PageHeader } from "@/components/ui-primitives";
import { formatCoordinate, t } from "@/lib/i18n";
import { formatDistance, formatTrack } from "@/lib/i18n";
import type { NearbyAirport } from "@/lib/server/nearby-airports";
import type { AirportInfrastructure } from "@/lib/airports/infrastructure";
import { formatFrequencyMhz, formatNavaidFrequency, formatRunwayDimension, runwaySurfaceLabel, sortAirportFrequencies, sortAirportRunways } from "@/lib/airports/infrastructure";
import { useFavoriteAirport } from "@/components/pwa-register";

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
  const location = [airport.city, airport.country].filter(Boolean).join(" · ");
  const liveTrafficController = useAirportLiveTrafficController(airport);
  const predictiveHexes = useMemo(
    () => liveTrafficController.observations
      .filter((item) => !item.aircraft.onGround && item.classification === "approaching")
      .slice(0, 6)
      .map((item) => item.aircraft.icaoHex),
    [liveTrafficController.observations],
  );
  // One shared airport controller even as views change. No extra SSE or polling.
  const operationsController = useAirportOperationsController(airport.icaoCode, predictiveHexes);
  const [favorite, toggleFavorite] = useFavoriteAirport(airport.icaoCode);
  const [view, setView] = useState<AirportV5View>("overview");
  const tabsRef = useRef<HTMLElement>(null);
  const [tabsHaveMore, setTabsHaveMore] = useState(false);

  useEffect(() => {
    const tabs = tabsRef.current;
    if (!tabs) return;
    const syncOverflow = () => setTabsHaveMore(tabs.scrollLeft + tabs.clientWidth < tabs.scrollWidth - 2);
    const observer = new ResizeObserver(syncOverflow);
    observer.observe(tabs);
    tabs.addEventListener("scroll", syncOverflow, { passive: true });
    syncOverflow();
    return () => {
      observer.disconnect();
      tabs.removeEventListener("scroll", syncOverflow);
    };
  }, []);

  useEffect(() => {
    const tabs = tabsRef.current;
    if (!tabs || tabs.scrollWidth <= tabs.clientWidth) return;
    const active = tabs.querySelector<HTMLElement>(`#airport-v5-tab-${view}`);
    if (!active) return;
    const offset = active.offsetLeft - tabs.offsetLeft;
    tabs.scrollTo({ left: Math.max(0, offset + active.offsetWidth / 2 - tabs.clientWidth / 2), behavior: "smooth" });
  }, [view]);

  useEffect(() => {
    const match = /^#airport-view-(overview|arrivals|departures|operations|weather|map|analytics)$/.exec(window.location.hash);
    if (match) setView(match[1] as AirportV5View);
  }, []);

  function switchView(next: AirportV5View) {
    setView(next);
    if (typeof window !== "undefined") window.history.replaceState(null, "", `#airport-view-${next}`);
  }
  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, current: AirportV5View) {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = AIRPORT_V5_VIEWS.indexOf(current);
    const next = event.key === "Home" ? AIRPORT_V5_VIEWS[0]
      : event.key === "End" ? AIRPORT_V5_VIEWS[AIRPORT_V5_VIEWS.length - 1]
        : AIRPORT_V5_VIEWS[(index + (event.key === "ArrowRight" ? 1 : AIRPORT_V5_VIEWS.length - 1)) % AIRPORT_V5_VIEWS.length];
    switchView(next);
    window.requestAnimationFrame(() => document.getElementById(`airport-v5-tab-${next}`)?.focus());
  }

  const operationViews = view === "overview" || view === "arrivals" || view === "departures" || view === "operations" || view === "analytics";

  return <main className="airport-page airport-v5-page" data-testid="airport-v5-page">
    <PageHeader
      className="airport-page-header"
      backLink={<Link className="back-link" href="/">{t.airport.backToRadar}</Link>}
      kicker={airport.iataCode ? `${airport.iataCode} · ${airport.icaoCode}` : airport.icaoCode}
      title={airport.name}
      description={location}
      actions={<button type="button" className="button-secondary" onClick={toggleFavorite} aria-pressed={favorite} title={favorite ? t.pwa.favoriteRemove : t.pwa.favoriteAdd}>{favorite ? "★" : "☆"} {t.pwa.favorites}</button>}
    />

    <div className="airport-v5-tabs-rail" data-has-more={tabsHaveMore ? "true" : "false"}>
    <nav ref={tabsRef} className="airport-v5-tabs" role="tablist" aria-label={t.airportV5.navigation} data-testid="airport-v5-tabs">
      {AIRPORT_V5_VIEWS.map((item) => <button
        key={item}
        type="button"
        role="tab"
        id={`airport-v5-tab-${item}`}
        data-testid={`airport-v5-tab-${item}`}
        aria-selected={view === item}
        aria-controls={`airport-v5-panel-${item}`}
        tabIndex={view === item ? 0 : -1}
        className={view === item ? "active" : ""}
        onClick={() => switchView(item)}
        onKeyDown={(event) => onTabKeyDown(event, item)}
      >{t.airportV5.tabs[item]}</button>)}
    </nav>
    </div>

    <div id={`airport-v5-panel-${view}`} className="airport-v5-panel" role="tabpanel" aria-labelledby={`airport-v5-tab-${view}`} data-testid="airport-v5-panel">
      {operationViews && <AirportOperationsBoard airport={airport} runways={infrastructure.runways} controller={operationsController} liveTraffic={liveTrafficController} view={view} />}

      {view === "weather" && <section className="airport-card airport-weather-card airport-v5-standalone" aria-labelledby="airport-weather-title">
        <h2 id="airport-weather-title">{t.weather.title}</h2>
        <AirportWeatherPanel
          airport={airport}
          runways={infrastructure.runways}
          sharedState={{
            weather: operationsController.weather,
            loading: operationsController.status === "loading",
            failed: operationsController.weatherFailed,
            onRetry: operationsController.refresh,
          }}
        />
      </section>}

      {view === "map" && <div className="airport-v5-two-column">
        <section className="airport-card airport-map-card" aria-labelledby="airport-map-title">
          <h2 id="airport-map-title">{t.airport.map}</h2>
          <AirportMap airport={airport} infrastructure={infrastructure} />
        </section>
        <AirportNearbyAircraft liveTraffic={liveTrafficController} />
      </div>}

      {view === "analytics" && <div className="airport-v5-analytics-extras">
        <AirportTrafficSummary airport={airport} />
        <AirportMovementAnalytics airport={airport} />
      </div>}

      {view === "overview" && <details className="airport-v5-reference" data-testid="airport-v5-reference">
        <summary>{t.airportV5.referenceDetails}</summary>
        <div className="airport-v5-reference-grid">
          <section className="airport-card airport-reference-card" aria-labelledby="airport-information-title">
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

          <div className="airport-reference-grid">
            <AirportInfrastructureSections infrastructure={infrastructure} />
          </div>

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
      </details>}
    </div>
    <p className="airport-data-source">{t.airport.dataSource}</p>
  </main>;
}
