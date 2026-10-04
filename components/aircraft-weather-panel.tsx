"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { airflowDestinationDegrees, confidenceRank, formatFlightLevel, weatherSourceLabel, type AircraftWeatherProfileMode } from "@/lib/weather/aircraft-weather-ui";
import { formatAge, t } from "@/lib/i18n";
import type { PirepObservation } from "@/lib/weather/types";

export interface AircraftWeatherObservationView {
  aircraftHex: string;
  callsign: string | null;
  observedAt: string;
  lat: number;
  lon: number;
  altitudeFt: number;
  windDirectionDeg: number | null;
  windSpeedKt: number | null;
  staticAirTemperatureC: number | null;
  totalAirTemperatureC: number | null;
  staticPressureHpa: number | null;
  humidityPct: number | null;
  turbulenceLevel: number | null;
  source: string;
  quality: string;
  weatherSourceQuality: string | null;
}

interface ProfileBin {
  altitudeFt: number;
  temperatureC: number | null;
  totalAirTemperatureC: number | null;
  windDirectionDeg: number | null;
  windSpeedKt: number | null;
  staticPressureHpa: number | null;
  humidityPct: number | null;
  turbulenceLevel: number | null;
  sampleCount: number;
  aircraftCount: number;
  confidence: string;
  oldestObservedAt: string;
  newestObservedAt: string;
}

interface ProfileResponse { generatedAt: string; window: { from: string; to: string; minutes: number }; bins: ProfileBin[]; }
interface ObservationsResponse { generatedAt: string; totalApproximate: number; observations: AircraftWeatherObservationView[]; }

export type AircraftWeatherMapObservation = AircraftWeatherObservationView;

interface Props {
  center: { lat: number; lon: number; name: string } | null;
  onClose: () => void;
  onMapDataChange: (observations: AircraftWeatherMapObservation[], field: AircraftWeatherProfileMode) => void;
  focusedObservationKey?: string | null;
}

const WINDOWS = [15, 30, 60] as const;
const RADII = [40, 80, 120, 200] as const;

function ageLabel(value: string, now = Date.now()): string {
  const age = Math.max(0, now - Date.parse(value));
  if (!Number.isFinite(age)) return t.weather.aircraftWeatherUnavailable;
  return formatAge(age / 1_000);
}

function temperature(value: number | null): string { return value === null ? "—" : `${value < 0 ? "−" : ""}${Math.abs(value).toFixed(0)} °C`; }
function wind(direction: number | null, speed: number | null): string { return direction === null || speed === null ? "—" : `${Math.round(direction).toString().padStart(3, "0")}° / ${Math.round(speed)} kt`; }
function observationKey(value: AircraftWeatherObservationView): string { return `${value.aircraftHex}|${value.observedAt}`; }
function pirepHazard(value: PirepObservation): string {
  const parts = [
    value.turbulence?.intensity ? `${t.weather.pirepTurbulence} ${value.turbulence.intensity}` : null,
    value.icing?.intensity ? `${t.weather.pirepIcing} ${value.icing.intensity}` : null,
    value.weather,
  ].filter(Boolean);
  return parts.join(" · ") || "—";
}
function altitudeRange(value: string): { min?: number; max?: number } {
  if (value === "below") return { max: 10_000 };
  if (value === "100-200") return { min: 10_000, max: 20_000 };
  if (value === "200-300") return { min: 20_000, max: 30_000 };
  if (value === "300-400") return { min: 30_000, max: 40_000 };
  if (value === "above") return { min: 40_000 };
  return {};
}

export function AircraftWeatherPanel({ center, onClose, onMapDataChange, focusedObservationKey }: Props) {
  const [windowMinutes, setWindowMinutes] = useState<number>(30);
  const [radiusKm, setRadiusKm] = useState<number>(80);
  const [altitudeFilter, setAltitudeFilter] = useState("all");
  const [field, setField] = useState<AircraftWeatherProfileMode>("temperature");
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [observations, setObservations] = useState<AircraftWeatherObservationView[]>([]);
  const [totalApproximate, setTotalApproximate] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [sort, setSort] = useState<"newest" | "altitude" | "distance">("newest");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [pireps, setPireps] = useState<PirepObservation[]>([]);
  const [pirepLoading, setPirepLoading] = useState(false);
  const [pirepUnavailable, setPirepUnavailable] = useState(false);
  const pirepCenterLat = center?.lat ?? null;
  const pirepCenterLon = center?.lon ?? null;

  const query = useMemo(() => {
    const range = altitudeRange(altitudeFilter);
    return { ...range, lat: center?.lat, lon: center?.lon, windowMinutes, radiusKm };
  }, [altitudeFilter, center?.lat, center?.lon, radiusKm, windowMinutes]);

  const loadObservations = useCallback(async (signal: AbortSignal) => {
    const params = new URLSearchParams({ radiusKm: String(query.radiusKm), from: new Date(Date.now() - windowMinutes * 60_000).toISOString(), to: new Date().toISOString(), limit: "500" });
    if (center) { params.set("lat", String(query.lat)); params.set("lon", String(query.lon)); } else params.set("center", "receiver");
    if (query.min !== undefined) params.set("minAltitude", String(query.min));
    if (query.max !== undefined) params.set("maxAltitude", String(query.max));
    const response = await fetch(`/api/weather/aircraft/observations?${params}`, { cache: "no-store", signal });
    if (!response.ok) throw new Error(t.weather.aircraftWeatherUnavailable);
    const value = await response.json() as ObservationsResponse;
    setObservations(value.observations ?? []);
    setTotalApproximate(value.totalApproximate ?? value.observations?.length ?? 0);
    setUpdatedAt(value.generatedAt ?? new Date().toISOString());
  }, [center, query, windowMinutes]);

  const loadProfile = useCallback(async (signal: AbortSignal) => {
    const params = new URLSearchParams({ radiusKm: String(radiusKm), windowMinutes: String(windowMinutes), binSizeFt: "2000" });
    if (center) { params.set("lat", String(center.lat)); params.set("lon", String(center.lon)); } else params.set("center", "receiver");
    const response = await fetch(`/api/weather/aircraft/profile?${params}`, { cache: "no-store", signal });
    if (!response.ok) throw new Error(t.weather.aircraftWeatherUnavailable);
    setProfile(await response.json() as ProfileResponse);
  }, [center, radiusKm, windowMinutes]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    void Promise.all([loadObservations(controller.signal), loadProfile(controller.signal)]).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : t.weather.aircraftWeatherUnavailable);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    const timer = window.setInterval(() => {
      setRefreshing(true);
      void Promise.all([loadObservations(controller.signal), loadProfile(controller.signal)]).catch(() => undefined).finally(() => setRefreshing(false));
    }, 60_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [loadObservations, loadProfile]);

  useEffect(() => {
    if (pirepCenterLat === null || pirepCenterLon === null) {
      setPireps([]);
      setPirepUnavailable(false);
      return;
    }
    const controller = new AbortController();
    let active = true;
    const load = async () => {
      setPirepLoading(true);
      try {
        const params = new URLSearchParams({
          lat: String(pirepCenterLat),
          lon: String(pirepCenterLon),
          radiusNm: String(Math.max(20, Math.min(300, Math.round(radiusKm / 1.852)))),
          hours: "6",
        });
        const response = await fetch(`/api/weather/pirep?${params}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("pirep unavailable");
        const data = await response.json() as { reports?: PirepObservation[] };
        if (!active) return;
        setPireps(Array.isArray(data.reports) ? data.reports.slice(0, 24) : []);
        setPirepUnavailable(false);
      } catch {
        if (active && !controller.signal.aborted) setPirepUnavailable(true);
      } finally {
        if (active) setPirepLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 5 * 60_000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [pirepCenterLat, pirepCenterLon, radiusKm]);

  useEffect(() => {
    const representative = new Map<string, AircraftWeatherObservationView>();
    for (const value of observations) {
      if (field === "temperature" && value.staticAirTemperatureC === null) continue;
      if (field === "wind" && (value.windDirectionDeg === null || value.windSpeedKt === null)) continue;
      const previous = representative.get(value.aircraftHex);
      if (!previous || Date.parse(value.observedAt) > Date.parse(previous.observedAt)) representative.set(value.aircraftHex, value);
    }
    onMapDataChange([...representative.values()], field);
  }, [field, observations, onMapDataChange]);

  useEffect(() => { if (focusedObservationKey) setSelectedKey(focusedObservationKey); }, [focusedObservationKey]);

  const uniqueAircraft = useMemo(() => new Set(observations.map((value) => value.aircraftHex)).size, [observations]);
  const altitudeCoverage = useMemo(() => {
    if (!observations.length) return "—";
    return `${Math.round(Math.min(...observations.map((value) => value.altitudeFt)) / 100) * 100}–${Math.round(Math.max(...observations.map((value) => value.altitudeFt)) / 100) * 100} ft`;
  }, [observations]);
  const newest = observations[0]?.observedAt ?? null;
  const overallConfidence = useMemo(() => profile?.bins.reduce((best, bin) => confidenceRank(bin.confidence) < confidenceRank(best) ? bin.confidence : best, "HIGH") ?? "INSUFFICIENT", [profile]);
  const visibleProfileBins = useMemo(() => {
    const range = altitudeRange(altitudeFilter);
    return (profile?.bins ?? []).filter((bin) => (range.min === undefined || bin.altitudeFt >= range.min) && (range.max === undefined || bin.altitudeFt <= range.max));
  }, [altitudeFilter, profile]);
  const visibleObservations = useMemo(() => [...observations].sort((a, b) => sort === "altitude" ? b.altitudeFt - a.altitudeFt : sort === "distance" ? Math.hypot(a.lat - (center?.lat ?? a.lat), a.lon - (center?.lon ?? a.lon)) - Math.hypot(b.lat - (center?.lat ?? b.lat), b.lon - (center?.lon ?? b.lon)) : Date.parse(b.observedAt) - Date.parse(a.observedAt)).slice(0, 120), [center?.lat, center?.lon, observations, sort]);
  const selected = selectedKey ? observations.find((value) => observationKey(value) === selectedKey) ?? null : null;

  return <section className="aircraft-weather-panel" aria-label={t.weather.aircraftObservedTitle}>
    <header className="aircraft-weather-header">
      <div><span className="aircraft-weather-kicker">{t.weather.aircraftWeatherKicker}</span><h2>{t.weather.aircraftObservedTitle}</h2><p>{center ? `${center.name} · ${radiusKm} km` : `${t.weather.aircraftWeatherReceiverArea} · ${radiusKm} km`}</p></div>
      <button type="button" className="aircraft-weather-close" onClick={onClose} aria-label={t.weather.aircraftWeatherClose}>×</button>
    </header>
    <div className="aircraft-weather-controls" role="group" aria-label={t.weather.aircraftWeatherFilters}>
      <label>{t.weather.aircraftWeatherWindow}<select value={windowMinutes} onChange={(event) => setWindowMinutes(Number(event.target.value))}>{WINDOWS.map((value) => <option key={value} value={value}>{value} min</option>)}</select></label>
      <label>{t.weather.aircraftWeatherRadius}<select value={radiusKm} onChange={(event) => setRadiusKm(Number(event.target.value))}>{RADII.map((value) => <option key={value} value={value}>{value} km</option>)}</select></label>
      <label>{t.weather.aircraftWeatherAltitude}<select value={altitudeFilter} onChange={(event) => setAltitudeFilter(event.target.value)}><option value="all">{t.weather.aircraftWeatherAll}</option><option value="below">&lt; FL100</option><option value="100-200">FL100–200</option><option value="200-300">FL200–300</option><option value="300-400">FL300–400</option><option value="above">&gt; FL400</option></select></label>
      <label>{t.weather.aircraftWeatherProfile}<select value={field} onChange={(event) => setField(event.target.value as AircraftWeatherProfileMode)}><option value="temperature">{t.weather.temperature} · SAT</option><option value="wind">{t.weather.wind}</option></select></label>
    </div>
    {loading && <p className="aircraft-weather-status" role="status">{t.weather.aircraftWeatherLoading}</p>}
    {error && <p className="aircraft-weather-status aircraft-weather-error" role="alert">{error}</p>}
    {!loading && !error && <>
      <div className="aircraft-weather-overview" aria-label={t.weather.aircraftObservedTitle}>
        <div><strong>{uniqueAircraft}</strong><span>{t.weather.aircraftWeatherAircraft}</span></div><div><strong>{totalApproximate}</strong><span>{t.weather.aircraftWeatherObservations}</span></div><div><strong>{altitudeCoverage}</strong><span>{t.weather.aircraftWeatherAltitudeCoverage}</span></div><div><strong>{newest ? ageLabel(newest) : "—"}</strong><span>{t.weather.aircraftWeatherNewest}</span></div><div><strong>{overallConfidence}</strong><span>{t.weather.aircraftWeatherConfidence}</span></div>
      </div>
      {observations.length === 0 ? <div className="aircraft-weather-empty"><strong>{t.weather.aircraftWeatherNoData}</strong><span>{t.weather.aircraftWeatherTryWider}</span></div> : <>
        <div className="aircraft-weather-section-heading"><h3>{t.weather.aircraftWeatherVerticalProfile}</h3><span>{refreshing ? t.weather.aircraftWeatherRefreshing : updatedAt ? t.weather.aircraftWeatherUpdated(ageLabel(updatedAt)) : ""}</span></div>
        <p className="aircraft-weather-note">{t.weather.aircraftWeatherNote}</p>
        <div className="aircraft-weather-profile" role="img" aria-label={`${field === "temperature" ? t.weather.temperature : t.weather.wind} · ${t.weather.aircraftWeatherVerticalProfile}`}>
          {visibleProfileBins.slice().sort((a, b) => a.altitudeFt - b.altitudeFt).map((bin) => <div className={`aircraft-weather-bin confidence-${bin.confidence.toLowerCase()}`} key={bin.altitudeFt}>
            <span className="aircraft-weather-bin-altitude">{formatFlightLevel(bin.altitudeFt)}</span>
            <span className="aircraft-weather-bin-value">{field === "temperature" ? temperature(bin.temperatureC) : wind(bin.windDirectionDeg, bin.windSpeedKt)} {field === "wind" && bin.windDirectionDeg !== null && <i aria-hidden="true" style={{ transform: `rotate(${airflowDestinationDegrees(bin.windDirectionDeg)}deg)` }}>↑</i>}</span>
            <span className="aircraft-weather-bin-meta">{bin.aircraftCount} {t.weather.aircraftWeatherAircraft} · {bin.sampleCount} {t.weather.aircraftWeatherObservations} · {bin.confidence} · {t.weather.aircraftWeatherNewest} {ageLabel(bin.newestObservedAt)}</span>
          </div>)}
        </div>
        <div className="aircraft-weather-section-heading"><h3>{t.weather.aircraftWeatherLive}</h3><label>{t.weather.aircraftWeatherSort}<select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="newest">{t.weather.aircraftWeatherNewestSort}</option><option value="altitude">{t.weather.aircraftWeatherAltitudeSort}</option><option value="distance">{t.weather.aircraftWeatherDistanceSort}</option></select></label></div>
        <div className="aircraft-weather-observation-list">{visibleObservations.map((value) => <button type="button" className="aircraft-weather-observation" key={observationKey(value)} onClick={() => setSelectedKey(observationKey(value))}><span><strong>{value.callsign || value.aircraftHex}</strong><small>{formatFlightLevel(value.altitudeFt)} · {ageLabel(value.observedAt)}</small></span><span><strong>{temperature(value.staticAirTemperatureC)}</strong><small>{t.weather.wind} {wind(value.windDirectionDeg, value.windSpeedKt)}</small></span></button>)}</div>
      </>}
    </>}
    {center && <section className="aircraft-weather-pirep" aria-label={t.weather.pirepTitle}>
      <div className="aircraft-weather-section-heading"><div><h3>{t.weather.pirepTitle}</h3><small>{t.weather.pirepSubtitle}</small></div></div>
      {pirepLoading && pireps.length === 0 && <p className="aircraft-weather-status">{t.weather.pirepLoading}</p>}
      {pirepUnavailable && pireps.length === 0 && <p className="aircraft-weather-status aircraft-weather-error">{t.weather.pirepUnavailable}</p>}
      {!pirepLoading && !pirepUnavailable && pireps.length === 0 && <div className="aircraft-weather-empty"><strong>{t.weather.pirepEmpty}</strong></div>}
      {pireps.length > 0 && <div className="aircraft-weather-observation-list">
        {pireps.map((value) => <div className="aircraft-weather-observation" key={value.id}>
          <span>
            <strong>{value.reportType}{value.urgent ? ` · ${t.weather.pirepUrgent}` : ""}</strong>
            <small>{value.aircraftType ?? "—"} · {value.altitudeFt === null ? "—" : formatFlightLevel(value.altitudeFt)} · {ageLabel(value.observedAt)}</small>
          </span>
          <span>
            <strong>{pirepHazard(value)}</strong>
            <small>{value.temperatureC === null ? "" : `${temperature(value.temperatureC)} · `}{value.windDirectionDeg === null || value.windSpeedKt === null ? "" : wind(value.windDirectionDeg, value.windSpeedKt)}</small>
          </span>
        </div>)}
      </div>}
      <p className="aircraft-weather-note">{t.weather.pirepExternalDisclaimer}</p>
    </section>}
    {selected && <div className="aircraft-weather-detail" role="dialog" aria-label={t.weather.aircraftWeatherObservationDetail}><div className="aircraft-weather-section-heading"><h3>{t.weather.aircraftWeatherObservationDetail}</h3><button type="button" onClick={() => setSelectedKey(null)} aria-label={t.weather.aircraftWeatherCloseDetail}>×</button></div><div className="aircraft-weather-detail-fields">
      <span>ICAO</span><strong>{selected.aircraftHex}</strong>{selected.callsign && <><span>{t.aircraft.currentCallsign}</span><strong>{selected.callsign}</strong></>}<span>{t.weather.observed}</span><strong>{new Date(selected.observedAt).toISOString()} · {ageLabel(selected.observedAt)}</strong><span>{t.aircraft.altitude}</span><strong>{formatFlightLevel(selected.altitudeFt)} · {selected.altitudeFt.toLocaleString()} ft</strong><span>{t.aircraft.position}</span><strong>{selected.lat.toFixed(4)}, {selected.lon.toFixed(4)}</strong>{selected.windDirectionDeg !== null && <><span>{t.weather.wind}</span><strong>{wind(selected.windDirectionDeg, selected.windSpeedKt)}</strong></>}{selected.staticAirTemperatureC !== null && <><span>SAT</span><strong>{temperature(selected.staticAirTemperatureC)}</strong></>}{selected.totalAirTemperatureC !== null && <><span>TAT</span><strong>{temperature(selected.totalAirTemperatureC)}</strong></>}{selected.staticPressureHpa !== null && <><span>{t.weather.aircraftObservedPressure}</span><strong>{selected.staticPressureHpa.toFixed(1)} hPa</strong></>}{selected.humidityPct !== null && <><span>{t.weather.aircraftObservedHumidity}</span><strong>{selected.humidityPct.toFixed(0)} %</strong></>}{selected.turbulenceLevel !== null && <><span>{t.weather.aircraftObservedTurbulence}</span><strong>{selected.turbulenceLevel}</strong></>}<span>{t.weather.aircraftObservedSource}</span><strong>{weatherSourceLabel(selected.source)}{selected.source === "BDS_4_4" && selected.weatherSourceQuality ? ` · ${t.weather.aircraftWeatherQuality(selected.weatherSourceQuality)}` : ""}</strong><span>{t.weather.aircraftObservedQuality}</span><strong>{selected.quality}</strong>
    </div></div>}
    <div className="aircraft-weather-model-unavailable"><strong>{t.weather.aircraftWeatherObservedVsModel}</strong><span>{t.weather.aircraftWeatherObservedVsModelNote}</span></div>
  </section>;
}
