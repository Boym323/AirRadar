"use client";

import { useEffect, useState } from "react";
import { formatAge, t } from "@/lib/i18n";

interface AircraftObservedWeather {
  observedAt: string;
  windDirectionDeg: number | null;
  windSpeedKt: number | null;
  staticAirTemperatureC: number | null;
  totalAirTemperatureC: number | null;
  staticPressureHpa: number | null;
  humidityPct: number | null;
  turbulenceLevel: number | null;
  source: string;
  quality: "HIGH" | "GOOD" | "LOW" | string;
}

function sourceLabel(source: string): string {
  if (source === "BDS_4_4") return t.weather.aircraftObservedSourceBds44;
  if (source === "READSB_JSON") return t.weather.aircraftObservedSourceReadsb;
  if (source === "DERIVED") return t.weather.aircraftObservedSourceDerived;
  return t.weather.aircraftObservedSourceUnknown;
}

function qualityLabel(quality: string): string {
  if (quality === "HIGH") return t.weather.aircraftObservedQualityHigh;
  if (quality === "GOOD") return t.weather.aircraftObservedQualityGood;
  if (quality === "LOW") return t.weather.aircraftObservedQualityLow;
  return quality;
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return value ? <div className="aircraft-quick-detail-value"><span className="detail-item-label">{label}</span><strong className="detail-item-value">{value}</strong></div> : null;
}

export function AircraftObservedWeather({ aircraftHex }: { aircraftHex: string }) {
  const [observation, setObservation] = useState<AircraftObservedWeather | null>(null);
  const [state, setState] = useState<"loading" | "available" | "unavailable">("loading");
  useEffect(() => {
    const controller = new AbortController();
    setObservation(null);
    setState("loading");
    const from = new Date(Date.now() - 30 * 60_000).toISOString();
    const to = new Date().toISOString();
    void fetch(`/api/weather/aircraft/observations?aircraftHex=${encodeURIComponent(aircraftHex)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=1`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? await response.json() as { observations?: AircraftObservedWeather[] } : null)
      .then((value) => {
        if (controller.signal.aborted) return;
        const latest = value?.observations?.[0] ?? null;
        setObservation(latest);
        setState(latest ? "available" : "unavailable");
      })
      .catch(() => { if (!controller.signal.aborted) setState("unavailable"); });
    return () => controller.abort();
  }, [aircraftHex]);

  const age = observation ? formatAge(Math.max(0, (Date.now() - Date.parse(observation.observedAt)) / 1_000)) : null;
  const temperature = (value: number | null) => value === null ? null : `${value < 0 ? "−" : ""}${Math.abs(value).toFixed(0)} °C`;
  const wind = observation?.windDirectionDeg !== null && observation?.windDirectionDeg !== undefined && observation?.windSpeedKt !== null && observation?.windSpeedKt !== undefined
    ? `${Math.round(observation.windDirectionDeg).toString().padStart(3, "0")}° / ${Math.round(observation.windSpeedKt)} kt`
    : null;
  return <section className="aircraft-quick-section aircraft-quick-observed-weather" aria-labelledby="aircraft-quick-observed-weather-title">
    <h2 id="aircraft-quick-observed-weather-title">{t.weather.aircraftObservedTitle}</h2>
    {state === "loading" && <p className="aircraft-quick-empty" role="status">{t.weather.aircraftObservedLoading}</p>}
    {state === "unavailable" && <p className="aircraft-quick-empty">{t.weather.aircraftObservedUnavailable}</p>}
    {observation && <>
      <div className="aircraft-quick-detail-grid" data-testid="aircraft-observed-weather">
        <Detail label={t.weather.aircraftObservedSat} value={temperature(observation.staticAirTemperatureC)} />
        <Detail label={t.weather.aircraftObservedWind} value={wind} />
        <Detail label={t.weather.aircraftObservedObserved} value={age} />
        <Detail label={t.weather.aircraftObservedSource} value={sourceLabel(observation.source)} />
        <Detail label={t.weather.aircraftObservedQuality} value={qualityLabel(observation.quality)} />
        <Detail label={t.weather.aircraftObservedTat} value={temperature(observation.totalAirTemperatureC)} />
        <Detail label={t.weather.aircraftObservedPressure} value={observation.staticPressureHpa === null ? null : `${observation.staticPressureHpa.toFixed(1)} hPa`} />
        <Detail label={t.weather.aircraftObservedHumidity} value={observation.humidityPct === null ? null : `${observation.humidityPct.toFixed(0)} %`} />
        <Detail label={t.weather.aircraftObservedTurbulence} value={observation.turbulenceLevel === null ? null : String(observation.turbulenceLevel)} />
      </div>
      <p className="aircraft-quick-disclaimer">{t.weather.aircraftObservedModelDisclaimer}</p>
    </>}
  </section>;
}
