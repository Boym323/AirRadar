"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { airflowDestinationDegrees, confidenceRank, formatFlightLevel, weatherSourceLabel, type AircraftWeatherProfileMode } from "@/lib/weather/aircraft-weather-ui";

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
  if (!Number.isFinite(age)) return "age unavailable";
  if (age < 60_000) return `${Math.round(age / 1_000)} s ago`;
  return `${Math.round(age / 60_000)} min ago`;
}

function temperature(value: number | null): string { return value === null ? "—" : `${value < 0 ? "−" : ""}${Math.abs(value).toFixed(0)} °C`; }
function wind(direction: number | null, speed: number | null): string { return direction === null || speed === null ? "—" : `${Math.round(direction).toString().padStart(3, "0")}° / ${Math.round(speed)} kt`; }
function observationKey(value: AircraftWeatherObservationView): string { return `${value.aircraftHex}|${value.observedAt}`; }
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
    if (!response.ok) throw new Error("Aircraft observations unavailable");
    const value = await response.json() as ObservationsResponse;
    setObservations(value.observations ?? []);
    setTotalApproximate(value.totalApproximate ?? value.observations?.length ?? 0);
    setUpdatedAt(value.generatedAt ?? new Date().toISOString());
  }, [center, query, windowMinutes]);

  const loadProfile = useCallback(async (signal: AbortSignal) => {
    const params = new URLSearchParams({ radiusKm: String(radiusKm), windowMinutes: String(windowMinutes), binSizeFt: "2000" });
    if (center) { params.set("lat", String(center.lat)); params.set("lon", String(center.lon)); } else params.set("center", "receiver");
    const response = await fetch(`/api/weather/aircraft/profile?${params}`, { cache: "no-store", signal });
    if (!response.ok) throw new Error("Aircraft profile unavailable");
    setProfile(await response.json() as ProfileResponse);
  }, [center, radiusKm, windowMinutes]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    void Promise.all([loadObservations(controller.signal), loadProfile(controller.signal)]).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Aircraft weather unavailable");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    const timer = window.setInterval(() => {
      setRefreshing(true);
      void Promise.all([loadObservations(controller.signal), loadProfile(controller.signal)]).catch(() => undefined).finally(() => setRefreshing(false));
    }, 60_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [loadObservations, loadProfile]);

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

  return <section className="aircraft-weather-panel" aria-label="Aircraft Weather">
    <header className="aircraft-weather-header">
      <div><span className="aircraft-weather-kicker">WEATHER</span><h2>Aircraft Weather</h2><p>{center ? `${center.name} · ${radiusKm} km` : `Configured receiver area · ${radiusKm} km`}</p></div>
      <button type="button" className="aircraft-weather-close" onClick={onClose} aria-label="Close Aircraft Weather">×</button>
    </header>
    <div className="aircraft-weather-controls" role="group" aria-label="Aircraft Weather filters">
      <label>Window<select value={windowMinutes} onChange={(event) => setWindowMinutes(Number(event.target.value))}>{WINDOWS.map((value) => <option key={value} value={value}>{value} min</option>)}</select></label>
      <label>Radius<select value={radiusKm} onChange={(event) => setRadiusKm(Number(event.target.value))}>{RADII.map((value) => <option key={value} value={value}>{value} km</option>)}</select></label>
      <label>Altitude<select value={altitudeFilter} onChange={(event) => setAltitudeFilter(event.target.value)}><option value="all">All</option><option value="below">&lt; FL100</option><option value="100-200">FL100–200</option><option value="200-300">FL200–300</option><option value="300-400">FL300–400</option><option value="above">&gt; FL400</option></select></label>
      <label>Profile<select value={field} onChange={(event) => setField(event.target.value as AircraftWeatherProfileMode)}><option value="temperature">Temperature · SAT</option><option value="wind">Wind</option></select></label>
    </div>
    {loading && <p className="aircraft-weather-status" role="status">Loading aircraft observations…</p>}
    {error && <p className="aircraft-weather-status aircraft-weather-error" role="alert">{error}</p>}
    {!loading && !error && <>
      <div className="aircraft-weather-overview" aria-label="Aircraft Weather overview">
        <div><strong>{uniqueAircraft}</strong><span>aircraft</span></div><div><strong>{totalApproximate}</strong><span>observations</span></div><div><strong>{altitudeCoverage}</strong><span>altitude coverage</span></div><div><strong>{newest ? ageLabel(newest) : "—"}</strong><span>newest observation</span></div><div><strong>{overallConfidence}</strong><span>confidence</span></div>
      </div>
      {observations.length === 0 ? <div className="aircraft-weather-empty"><strong>No aircraft weather observations in this area during the selected period.</strong><span>Try increasing the radius or time window.</span></div> : <>
        <div className="aircraft-weather-section-heading"><h3>Vertical profile</h3><span>{refreshing ? "Refreshing…" : updatedAt ? `Updated ${ageLabel(updatedAt)}` : ""}</span></div>
        <p className="aircraft-weather-note">SAT = Static Air Temperature. Wind direction is meteorological: where the wind comes from. Airflow arrows point to destination.</p>
        <div className="aircraft-weather-profile" role="img" aria-label={`${field === "temperature" ? "Static air temperature" : "Wind"} vertical profile`}>
          {visibleProfileBins.slice().sort((a, b) => a.altitudeFt - b.altitudeFt).map((bin) => <div className={`aircraft-weather-bin confidence-${bin.confidence.toLowerCase()}`} key={bin.altitudeFt}>
            <span className="aircraft-weather-bin-altitude">{formatFlightLevel(bin.altitudeFt)}</span>
            <span className="aircraft-weather-bin-value">{field === "temperature" ? temperature(bin.temperatureC) : wind(bin.windDirectionDeg, bin.windSpeedKt)} {field === "wind" && bin.windDirectionDeg !== null && <i aria-hidden="true" style={{ transform: `rotate(${airflowDestinationDegrees(bin.windDirectionDeg)}deg)` }}>↑</i>}</span>
            <span className="aircraft-weather-bin-meta">{bin.aircraftCount} aircraft · {bin.sampleCount} observations · {bin.confidence} · newest {ageLabel(bin.newestObservedAt)}</span>
          </div>)}
        </div>
        <div className="aircraft-weather-section-heading"><h3>Live observations</h3><label>Sort<select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="newest">Newest</option><option value="altitude">Altitude</option><option value="distance">Distance</option></select></label></div>
        <div className="aircraft-weather-observation-list">{visibleObservations.map((value) => <button type="button" className="aircraft-weather-observation" key={observationKey(value)} onClick={() => setSelectedKey(observationKey(value))}><span><strong>{value.callsign || value.aircraftHex}</strong><small>{formatFlightLevel(value.altitudeFt)} · {ageLabel(value.observedAt)}</small></span><span><strong>{temperature(value.staticAirTemperatureC)}</strong><small>Wind {wind(value.windDirectionDeg, value.windSpeedKt)}</small></span></button>)}</div>
      </>}
    </>}
    {selected && <div className="aircraft-weather-detail" role="dialog" aria-label="Observation detail"><div className="aircraft-weather-section-heading"><h3>Observation detail</h3><button type="button" onClick={() => setSelectedKey(null)} aria-label="Close observation detail">×</button></div><div className="aircraft-weather-detail-fields">
      <span>ICAO</span><strong>{selected.aircraftHex}</strong>{selected.callsign && <><span>Callsign</span><strong>{selected.callsign}</strong></>}<span>Observed</span><strong>{new Date(selected.observedAt).toISOString()} · {ageLabel(selected.observedAt)}</strong><span>Altitude</span><strong>{formatFlightLevel(selected.altitudeFt)} · {selected.altitudeFt.toLocaleString()} ft</strong><span>Position</span><strong>{selected.lat.toFixed(4)}, {selected.lon.toFixed(4)}</strong>{selected.windDirectionDeg !== null && <><span>Wind</span><strong>{wind(selected.windDirectionDeg, selected.windSpeedKt)}</strong></>}{selected.staticAirTemperatureC !== null && <><span>SAT</span><strong>{temperature(selected.staticAirTemperatureC)}</strong></>}{selected.totalAirTemperatureC !== null && <><span>TAT</span><strong>{temperature(selected.totalAirTemperatureC)}</strong></>}{selected.staticPressureHpa !== null && <><span>Static pressure</span><strong>{selected.staticPressureHpa.toFixed(1)} hPa</strong></>}{selected.humidityPct !== null && <><span>Humidity</span><strong>{selected.humidityPct.toFixed(0)} %</strong></>}{selected.turbulenceLevel !== null && <><span>Turbulence</span><strong>{selected.turbulenceLevel}</strong></>}<span>Source</span><strong>{weatherSourceLabel(selected.source)}{selected.source === "BDS_4_4" && selected.weatherSourceQuality ? ` · quality ${selected.weatherSourceQuality}` : ""}</strong><span>Quality</span><strong>{selected.quality}</strong>
    </div></div>}
    <div className="aircraft-weather-model-unavailable"><strong>Observed vs ICON-EU unavailable</strong><span>The current ICON-EU service exposes pressure-level forecast grids, but not a validated same-time, same-position, flight-level match for these observations. Aircraft observations remain available independently.</span></div>
  </section>;
}
