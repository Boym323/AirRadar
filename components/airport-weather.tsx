"use client";

import { useCallback, useEffect, useState } from "react";
import type { Airport } from "@/lib/airports/types";
import type { AirportRunway } from "@/lib/airports/infrastructure";
import { calculateRunwayWind, selectWindFavoredRunway } from "@/lib/airport-runway-wind";
import type { FlightCategory, MetarCloudLayer, MetarObservation, TafCloudLayer, TafForecast, TafPeriod, WeatherCacheSource } from "@/lib/weather/types";
import { formatDateTime, formatNumber, formatSpeed, formatTrack, formatWeatherVisibility, t } from "@/lib/i18n";

export interface AirportWeatherResponse {
  airport?: Airport;
  metar: MetarObservation | null;
  taf: TafForecast | null;
  fetchedAt?: string;
  stale: boolean;
  cacheSource?: WeatherCacheSource;
  snapshotAgeMs?: number;
  enabled?: boolean;
  available?: boolean;
  source?: string;
}

interface AirportWeatherBatchResponse {
  enabled?: boolean;
  available?: boolean;
  airports?: AirportWeatherResponse[];
}

function airportLabel(airport: Airport): string {
  return `${airport.iataCode ? `${airport.iataCode} · ` : ""}${airport.city || airport.name}`;
}

function windLabel(metar: MetarObservation | TafPeriod): string {
  const direction = metar.windVariable ? t.weather.variable : metar.windDirectionDeg === null ? t.common.emptyValue : formatTrack(metar.windDirectionDeg);
  if ("windCalm" in metar && metar.windCalm) return `${t.weather.calm} / ${formatSpeed(0)}`;
  const speed = formatSpeed(metar.windSpeedKt);
  return `${direction} / ${speed}`;
}

function windRunwayDirections(runway: AirportRunway): Array<{ ident: string; headingDeg: number | null }> {
  return [
    { ident: runway.leIdent ?? "?", headingDeg: runway.leHeadingDegT },
    { ident: runway.heIdent ?? "?", headingDeg: runway.heHeadingDegT },
  ].filter((direction) => direction.headingDeg !== null);
}

function RunwayWindPanel({ runways, metar }: { runways: AirportRunway[]; metar: MetarObservation | null }) {
  if (runways.length === 0) return null;
  const usableRunways = runways.filter((runway) => runway.closed !== true);
  const favored = metar && !metar.windVariable && !metar.windCalm
    ? selectWindFavoredRunway(usableRunways, windRunwayDirections, metar.windDirectionDeg, metar.windSpeedKt)
    : null;
  const canCalculate = Boolean(metar && !metar.windVariable && !metar.windCalm && metar.windDirectionDeg !== null && metar.windSpeedKt !== null && metar.windSpeedKt > 0);
  return <section className="weather-runway-wind" aria-labelledby="weather-runway-wind-title">
    <div className="weather-report-heading" id="weather-runway-wind-title">{t.weather.windFavoredRunway}</div>
    {!canCalculate ? <p className="weather-runway-wind-message">{t.weather.noClearWindFavoredRunway}</p> : <>
      {favored && <p className="weather-runway-favored"><strong>RWY {String(Math.round(favored.headingDeg / 10)).padStart(2, "0")}</strong> · {t.weather.headwind} {formatSpeed(favored.headwindKt)} · {t.weather.crosswind} {formatSpeed(favored.crosswindKt)}</p>}
      <div className="weather-runway-wind-list">
        {usableRunways.flatMap((runway) => windRunwayDirections(runway).map((direction) => {
          const component = calculateRunwayWind(direction.headingDeg, metar?.windDirectionDeg, metar?.windSpeedKt);
          if (!component) return null;
          const gust = metar?.windGustKt === null || metar?.windGustKt === undefined
            ? null
            : calculateRunwayWind(direction.headingDeg, metar.windDirectionDeg, metar.windGustKt);
          return <div className="weather-runway-wind-row" key={`${runway.id}-${direction.ident}`}>
            <strong>RWY {direction.ident}</strong>
            <span>{component.headwindKt >= 0 ? t.weather.headwind : t.weather.tailwind} {formatSpeed(component.headwindKt >= 0 ? component.headwindKt : component.tailwindKt)}</span>
            <span>{t.weather.crosswind} {formatSpeed(component.crosswindKt)}</span>
            {gust && <span>{t.weather.crosswindGust} {formatSpeed(gust.crosswindKt)}</span>}
          </div>;
        }))}
      </div>
    </>}
    <p className="weather-disclaimer">{t.weather.calculatedFromWind}</p>
  </section>;
}

function categoryClass(category: FlightCategory | null | undefined): string {
  return category ? ` weather-category-${category.toLowerCase()}` : "";
}

function cloudLabel(clouds: MetarCloudLayer[] | TafCloudLayer[] | undefined): string {
  if (!clouds?.length) return t.common.emptyValue;
  return clouds.map((cloud) => `${cloud.cover}${cloud.baseFtAgl === null ? "" : ` ${formatNumber(cloud.baseFtAgl, 0)} ft`}`).join(" · ");
}

function weatherLabel(weather: string[] | undefined): string {
  return weather?.length ? weather.join(" ") : t.common.emptyValue;
}

function cacheSourceLabel(source: WeatherCacheSource | undefined): string | null {
  if (source === "persistent-cache") return t.weather.persistentCache;
  if (source === "memory-cache") return t.weather.memoryCache;
  return null;
}

function visibilityLabel(value: MetarObservation["visibilityMeters"] | TafPeriod["visibilityMeters"], greaterThan: boolean, lessThan = false): string {
  const formatted = formatWeatherVisibility(value, greaterThan);
  return lessThan && formatted !== t.common.emptyValue ? `< ${formatted}` : formatted;
}

function WeatherValue({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return <div className={`weather-value${className}`}><span>{label}</span><strong>{value}</strong></div>;
}

function TafPeriodRow({ period }: { period: TafPeriod }) {
  const validity = `${formatDateTime(period.from)}–${formatDateTime(period.to)}`;
  const indicator = period.changeIndicator?.trim().toUpperCase();
  const label = !indicator ? t.weather.tafBase : indicator.startsWith("PROB") ? indicator : indicator;
  return <article className={`weather-taf-period${categoryClass(period.flightCategory)}`}>
    <div className="weather-taf-period-header"><strong>{label}</strong><span>{validity}</span></div>
    <div className="weather-grid">
      <WeatherValue label={t.weather.wind} value={windLabel(period)} />
      <WeatherValue label={t.weather.visibility} value={visibilityLabel(period.visibilityMeters, period.visibilityGreaterThan, period.visibilityLessThan)} />
      {period.flightCategory && <WeatherValue label={t.weather.flightCategory} value={period.flightCategory} />}
      <WeatherValue label={t.weather.clouds} value={cloudLabel(period.clouds)} />
      <WeatherValue label={t.weather.weather} value={weatherLabel(period.weather)} />
    </div>
  </article>;
}

function WeatherReports({ weather }: { weather: AirportWeatherResponse }) {
  const metar = weather.metar;
  const taf = weather.taf;
  const observedAt = metar?.observedAt ?? metar?.observationTime ?? null;
  return <>
    {weather.stale && <div className="weather-stale" role="status">{t.weather.staleData}{cacheSourceLabel(weather.cacheSource) ? ` · ${cacheSourceLabel(weather.cacheSource)}` : ""}</div>}
    {metar && <>
      <div className="weather-meta">{t.weather.observed}: {formatDateTime(observedAt)} · {t.weather.updated}: {weather.fetchedAt ? formatDateTime(weather.fetchedAt) : t.common.emptyValue}</div>
      <div className="weather-report-heading">{t.weather.metar}</div><span className={`weather-category${categoryClass(metar.flightCategory)}`}>{metar.flightCategory ?? t.common.emptyValue}</span>
      <div className="weather-grid">
      <WeatherValue label={t.weather.wind} value={windLabel(metar)} />
        {metar.windGustKt !== null && <WeatherValue label={t.weather.gusts} value={formatSpeed(metar.windGustKt)} />}
        <WeatherValue label={t.weather.visibility} value={visibilityLabel(metar.visibilityMeters, metar.visibilityGreaterThan, metar.visibilityLessThan)} />
        <WeatherValue label={t.weather.temperature} value={metar.temperatureC === null ? t.common.emptyValue : `${formatNumber(metar.temperatureC, 0)} °C`} />
        <WeatherValue label={t.weather.dewpoint} value={metar.dewpointC === null ? t.common.emptyValue : `${formatNumber(metar.dewpointC, 0)} °C`} />
        <WeatherValue label={t.weather.qnh} value={metar.altimeterHpa === null ? t.common.emptyValue : `${formatNumber(metar.altimeterHpa, 0)} hPa`} />
      <WeatherValue label={t.weather.clouds} value={metar.cavok ? t.weather.cavok : cloudLabel(metar.clouds)} />
        <WeatherValue label={t.weather.weather} value={weatherLabel(metar.weather)} />
      </div>
    </>}
    {!metar && !taf && <div className="weather-unavailable">{t.weather.unavailableData}</div>}
    {metar?.rawText && <details className="weather-raw"><summary>{t.weather.rawMetar}</summary><pre>{metar.rawText}</pre></details>}
    {taf && <div className="weather-forecast">
      <div className="weather-report-heading">{t.weather.taf}</div>
      <div className="weather-meta">{t.weather.issued}: {formatDateTime(taf.issuedAt ?? taf.issueTime)} · {t.weather.validity}: {formatDateTime(taf.validFrom)}–{formatDateTime(taf.validTo)}</div>
      {taf.periods && taf.periods.length > 0 && <div className="weather-taf-timeline">{taf.periods.map((period, index) => <TafPeriodRow key={`${period.from ?? "period"}-${index}`} period={period} />)}</div>}
      {taf.rawText && <details className="weather-raw"><summary>{t.weather.rawTaf}</summary><pre>{taf.rawText}</pre></details>}
    </div>}
  </>;
}

function WeatherLoadState({ loading, failed, onRetry }: { loading: boolean; failed: boolean; onRetry: () => void }) {
  if (loading) return <div className="weather-unavailable">{t.common.loading}</div>;
  if (failed) return <div className="weather-error" role="alert"><span>{t.weather.loadFailed}</span><button type="button" className="weather-retry" onClick={onRetry}>{t.weather.retry}</button></div>;
  return null;
}

export function AirportWeatherPanel({ airport, runways = [] }: { airport: Airport; runways?: AirportRunway[] }) {
  const [weather, setWeather] = useState<AirportWeatherResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const loadWeather = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const response = await fetch(`/api/weather/airport/${encodeURIComponent(airport.icaoCode)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("weather request failed");
      const data = await response.json() as AirportWeatherResponse;
      setWeather(data.enabled === false ? null : data);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [airport.icaoCode]);

  useEffect(() => { void loadWeather(); }, [loadWeather]);

  return <div className="airport-weather-panel">
    <WeatherLoadState loading={loading} failed={failed} onRetry={() => void loadWeather()} />
    {!loading && !failed && weather && <><WeatherReports weather={weather} /><RunwayWindPanel runways={runways} metar={weather.metar} /></>}
    {!loading && !failed && !weather && <div className="weather-unavailable">{t.weather.unavailableData}</div>}
  </div>;
}

export function AirportWeatherDisclosure({ airport }: { airport: Airport }) {
  const [open, setOpen] = useState(false);
  const [weather, setWeather] = useState<AirportWeatherResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [requested, setRequested] = useState(false);
  if (!/^[A-Z]{4}$/.test(airport.icaoCode.trim().toUpperCase())) return null;
  const panelId = `airport-weather-${airport.icaoCode.toLowerCase()}`;

  async function loadWeather(): Promise<void> {
    setRequested(true);
    setLoading(true);
    setFailed(false);
    try {
      const response = await fetch(`/api/weather/airport/${encodeURIComponent(airport.icaoCode)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("weather request failed");
      const data = await response.json() as AirportWeatherResponse;
      setWeather(data.enabled === false ? null : data);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  function toggle(): void {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen && !requested) void loadWeather();
  }

  return <section className="weather-card">
    <button type="button" className="weather-toggle" aria-expanded={open} aria-controls={panelId} onClick={toggle}>
      <span><strong>{t.weather.title}</strong><span>{airportLabel(airport)}</span></span><span aria-hidden="true">{open ? "−" : "+"}</span>
    </button>
    {open && <div id={panelId} className="weather-content">
      <WeatherLoadState loading={loading} failed={failed} onRetry={() => void loadWeather()} />
      {!loading && !failed && weather && <WeatherReports weather={weather} />}
      {!loading && !failed && !weather && <div className="weather-unavailable">{t.weather.unavailableData}</div>}
    </div>}
  </section>;
}

export function FlightRouteWeather({ originAirport, destinationAirport }: { originAirport?: Airport | null; destinationAirport?: Airport | null }) {
  const airports = [...new Map([destinationAirport, originAirport]
    .filter((airport): airport is Airport => Boolean(airport && /^[A-Z]{4}$/.test(airport.icaoCode.trim().toUpperCase())))
    .map((airport) => [airport.icaoCode.trim().toUpperCase(), airport] as const)).values()];
  const airportCodes = [...new Set(airports.map((airport) => airport.icaoCode.trim().toUpperCase()))];
  const airportKey = airportCodes.join(",");
  const [weather, setWeather] = useState<AirportWeatherResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (!airportKey) {
      setWeather([]);
      return;
    }
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setFailed(false);
    void fetch(`/api/weather/airport?icao=${encodeURIComponent(airportKey)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("weather request failed");
        return response.json() as Promise<AirportWeatherBatchResponse>;
      })
      .then((data) => {
        if (!active) return;
        setWeather(data.enabled === false || data.available === false ? [] : data.airports ?? []);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [airportKey, retryNonce]);

  if (!airportCodes.length) return null;
  const byIcao = new Map(weather.map((item) => [item.airport?.icaoCode, item]));
  return <section className="route-weather-card" aria-label={t.weather.title}>
    <div className="route-weather-heading"><strong>{t.weather.title}</strong><span>{t.weather.sourceName}</span></div>
    <WeatherLoadState loading={loading} failed={failed} onRetry={() => setRetryNonce((value) => value + 1)} />
    {!loading && !failed && weather.length === 0 && <div className="weather-unavailable">{t.weather.unavailableData}</div>}
    {!loading && !failed && airports.map((airport) => {
      const report = byIcao.get(airport.icaoCode);
      return <section className="route-weather-airport" key={airport.icaoCode}>
        <div className="route-weather-airport-heading"><strong>{airport.icaoCode}</strong><span>{airport === destinationAirport ? t.weather.destination : t.weather.origin} · {airportLabel(airport)}</span></div>
        {report ? <WeatherReports weather={report} /> : <div className="weather-unavailable">{t.weather.unavailableData}</div>}
      </section>;
    })}
  </section>;
}
