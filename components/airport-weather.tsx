"use client";

import { useState } from "react";
import type { Airport } from "@/lib/airports/types";
import type { MetarObservation, TafForecast } from "@/lib/weather/types";
import { formatDateTime, formatNumber, formatSpeed, formatTrack, formatWeatherVisibility, t } from "@/lib/i18n";

interface AirportWeatherResponse {
  airport: Airport;
  metar: MetarObservation | null;
  taf: TafForecast | null;
  fetchedAt: string;
  stale: boolean;
}

function airportLabel(airport: Airport): string {
  return `${airport.iataCode ? `${airport.iataCode} · ` : ""}${airport.city || airport.name}`;
}

function windLabel(metar: MetarObservation): string {
  const direction = metar.windVariable
    ? "VRB"
    : metar.windDirectionDeg === null ? t.common.emptyValue : formatTrack(metar.windDirectionDeg);
  const speed = formatSpeed(metar.windSpeedKt);
  const gust = metar.windGustKt === null ? "" : ` G${formatNumber(metar.windGustKt)} kt`;
  return `${direction} / ${speed}${gust}`;
}

function WeatherValue({ label, value }: { label: string; value: string }) {
  return <div className="weather-value"><span>{label}</span><strong>{value}</strong></div>;
}

function WeatherReports({ weather }: { weather: AirportWeatherResponse }) {
  const metar = weather.metar;
  const taf = weather.taf;
  return <>
    {weather.stale && <div className="weather-stale" role="status">{t.weather.staleData}</div>}
    <div className="weather-meta">{t.weather.observation}: {formatDateTime(metar?.observationTime)} · {weather.fetchedAt ? formatDateTime(weather.fetchedAt) : t.common.emptyValue}</div>
    {metar && <div className="weather-grid">
      <WeatherValue label={t.weather.wind} value={windLabel(metar)} />
      <WeatherValue label={t.weather.visibility} value={formatWeatherVisibility(metar.visibilityMeters, metar.visibilityGreaterThan)} />
      <WeatherValue label={t.weather.temperature} value={metar.temperatureC === null ? t.common.emptyValue : `${formatNumber(metar.temperatureC, 0)} °C`} />
      <WeatherValue label={t.weather.dewpoint} value={metar.dewpointC === null ? t.common.emptyValue : `${formatNumber(metar.dewpointC, 0)} °C`} />
      <WeatherValue label={t.weather.qnh} value={metar.altimeterHpa === null ? t.common.emptyValue : `${formatNumber(metar.altimeterHpa, 0)} hPa`} />
      {metar.flightCategory && <WeatherValue label="VFR / IFR" value={metar.flightCategory} />}
    </div>}
    {!metar && !taf && <div className="weather-unavailable">{t.weather.unavailableData}</div>}
    {metar?.rawText && <details className="weather-raw">
      <summary>{t.weather.metar}</summary>
      <pre>{metar.rawText}</pre>
    </details>}
    {taf && <div className="weather-forecast">
      <div className="weather-meta">{t.weather.forecast}: {formatDateTime(taf.issueTime)} · {formatDateTime(taf.validFrom)}–{formatDateTime(taf.validTo)}</div>
      {taf.rawText && <details className="weather-raw">
        <summary>{t.weather.taf}</summary>
        <pre>{taf.rawText}</pre>
      </details>}
    </div>}
  </>;
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
      setWeather(data);
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
      <span><strong>{t.weather.title}</strong><span>{airportLabel(airport)}</span></span>
      <span aria-hidden="true">{open ? "−" : "+"}</span>
    </button>
    {open && <div id={panelId} className="weather-content">
      {loading && <div className="weather-unavailable">{t.common.loading}</div>}
      {!loading && failed && <div className="weather-error" role="alert"><span>{t.weather.loadFailed}</span><button type="button" className="weather-retry" onClick={() => void loadWeather()}>{t.weather.retry}</button></div>}
      {!loading && !failed && weather && <WeatherReports weather={weather} />}
    </div>}
  </section>;
}
