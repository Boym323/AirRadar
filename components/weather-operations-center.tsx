"use client";

import { useEffect, useMemo, useState } from "react";
import type { FlightCategory, MetarMapObservation, PirepObservation, SigmetSnapshot } from "@/lib/weather/types";
import { formatNumber, t } from "@/lib/i18n";
import { EmptyState, MetricCard, MetricStrip, PageHeader, Panel, SectionHeader, StatusBadge } from "@/components/ui-primitives";
import styles from "./weather-operations-center.module.css";

type WindLevelHpa = 700 | 500 | 300;

interface MetarMapResponse {
  enabled?: boolean;
  available?: boolean;
  source?: string;
  stations?: number;
  observations: MetarMapObservation[];
  fetchedAt: string;
  stale: boolean;
}

interface SigmetResponse extends SigmetSnapshot {
  enabled?: boolean;
  available?: boolean;
  source?: string;
}

interface WindPoint {
  lat: number;
  lon: number;
  speedKt: number | null;
  directionDeg: number | null;
}

interface WindResponse {
  provider: string;
  model: string;
  modelRun: string | null;
  validAt: string;
  levelHpa: WindLevelHpa;
  points: WindPoint[];
  fetchedAt: string;
  stale: boolean;
}

interface RadarFrame {
  id: string;
  observedAt: string;
  latest: boolean;
  stale: boolean;
}

interface RadarCatalog {
  available: boolean;
  provider: string;
  product: string;
  frames: RadarFrame[];
  latestFrameId: string | null;
  generatedAt: string;
}

interface PirepResponse {
  enabled?: boolean;
  available?: boolean;
  reports: PirepObservation[];
  fetchedAt?: string;
  stale?: boolean;
  source?: string;
}

const WIND_LEVELS: Array<{ level: WindLevelHpa; label: string }> = [
  { level: 700, label: "FL100" },
  { level: 500, label: "FL180" },
  { level: 300, label: "FL300" },
];

const AIRPORT_PRIORITY = ["LKPR", "LKTB", "LKMT", "LKKV", "LKPD", "LKVO", "LKNA", "LKPO"];

function weatherVariant(category: FlightCategory | null): "success" | "warning" | "danger" | "neutral" {
  if (category === "VFR") return "success";
  if (category === "MVFR") return "warning";
  if (category === "IFR" || category === "LIFR") return "danger";
  return "neutral";
}

function timeLabel(value: string | null | undefined): string {
  if (!value) return t.common.emptyValue;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return t.common.emptyValue;
  return new Intl.DateTimeFormat(t.locale, { hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" }).format(date);
}

function windLabel(observation: MetarMapObservation): string {
  if (observation.windSpeed === null) return t.common.emptyValue;
  const direction = observation.windDirection === null ? "VRB" : String(Math.round(observation.windDirection)).padStart(3, "0") + "°";
  return `${direction} / ${Math.round(observation.windSpeed)} kt${observation.windGust === null ? "" : ` G${Math.round(observation.windGust)}`}`;
}

function sigmetText(properties: SigmetSnapshot["features"][number]["properties"]): string {
  return [properties.phenomenon, properties.hazard, properties.qualifier].filter(Boolean).join(" · ")
    || properties.rawText?.slice(0, 80)
    || "SIGMET";
}

function isThunderstorm(properties: SigmetSnapshot["features"][number]["properties"]): boolean {
  const text = [properties.phenomenon, properties.hazard, properties.qualifier, properties.rawText].filter(Boolean).join(" ").toUpperCase();
  return /\bTS\b|THUNDER|CB/.test(text);
}

export function WeatherOperationsCenter() {
  const cs = t.locale.startsWith("cs");
  const copy = cs ? {
    title: "Provozní přehled počasí",
    subtitle: "Souhrn dostupných meteorologických údajů z METAR, SIGMET, výškového větru, radaru a pilotních hlášení.",
    airportReports: "Letištní hlášení",
    activeSigmets: "Aktivní SIGMET",
    thunderstormAreas: "Bouřkové oblasti",
    strongWindAirports: "Letiště se silným větrem",
    pireps: "PIREP / AIREP",
    airports: "Letiště",
    airportsDescription: "Aktuální stanice METAR v regionální meteorologické oblasti.",
    sigmets: "SIGMET",
    sigmetsDescription: "Aktivní letecké výstrahy ze služby Aviation Weather Center.",
    wind: "Výškový vítr",
    windDescription: "ICON-EU regionální vítr; úrovně jsou zobrazeny jako praktické přibližné FL.",
    radar: "Meteorologický radar",
    radarDescription: "Stav CHMI radarového katalogu a poslední dostupný snímek.",
    reports: "Hlášení pilotů",
    reportsDescription: "Poslední PIREP/AIREP/AMDAR hlášení v regionu ČR.",
    loading: "Načítám meteorologické údaje…",
    partial: "Některý meteorologický zdroj je dočasně nedostupný.",
    noData: "Data nejsou aktuálně dostupná.",
    updated: "Aktualizováno",
    latestFrame: "Poslední snímek",
    frames: "Snímky",
    averageWind: "Průměrný vítr",
    maxWind: "Maximum",
    valid: "Platnost",
    stale: "ZASTARALÉ",
    live: "DOSTUPNÉ",
    urgent: "NALÉHAVÉ",
  } : {
    title: "Weather Operations",
    subtitle: "One operational view over AirRadar's existing METAR, SIGMET, wind-aloft, radar and PIREP sources.",
    airportReports: "Airport reports",
    activeSigmets: "Active SIGMETs",
    thunderstormAreas: "Thunderstorm areas",
    strongWindAirports: "Strong-wind airports",
    pireps: "PIREP / AIREP",
    airports: "Airports",
    airportsDescription: "Current METAR stations inside the regional weather grid.",
    sigmets: "SIGMET",
    sigmetsDescription: "Active aviation advisories from the existing AWC feed.",
    wind: "Wind aloft",
    windDescription: "ICON-EU regional wind; pressure levels are presented as practical approximate FL bands.",
    radar: "Weather radar",
    radarDescription: "CHMI radar catalog state and latest available frame.",
    reports: "Pilot reports",
    reportsDescription: "Recent PIREP/AIREP/AMDAR reports in the Czech regional area.",
    loading: "Loading weather sources…",
    partial: "One or more weather sources are temporarily unavailable.",
    noData: "Data is currently unavailable.",
    updated: "Updated",
    latestFrame: "Latest frame",
    frames: "Frames",
    averageWind: "Average wind",
    maxWind: "Maximum",
    valid: "Valid",
    stale: "STALE",
    live: "AVAILABLE",
    urgent: "URGENT",
  };

  const [metar, setMetar] = useState<MetarMapResponse | null>(null);
  const [sigmet, setSigmet] = useState<SigmetResponse | null>(null);
  const [windLevel, setWindLevel] = useState<WindLevelHpa>(500);
  const [wind, setWind] = useState<WindResponse | null>(null);
  const [radar, setRadar] = useState<RadarCatalog | null>(null);
  const [pirep, setPirep] = useState<PirepResponse | null>(null);
  const [failedSources, setFailedSources] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    void Promise.allSettled([
      fetch("/api/weather/metar-map", { cache: "no-store", signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error("metar unavailable");
        return response.json() as Promise<MetarMapResponse>;
      }),
      fetch("/api/weather/sigmet", { cache: "no-store", signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error("sigmet unavailable");
        return response.json() as Promise<SigmetResponse>;
      }),
      fetch("/api/weather/radar/frames", { cache: "no-store", signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error("radar unavailable");
        return response.json() as Promise<RadarCatalog>;
      }),
      fetch("/api/weather/pirep?lat=50.1&lon=15.9&radiusNm=180&hours=6", { cache: "no-store", signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error("pirep unavailable");
        return response.json() as Promise<PirepResponse>;
      }),
    ]).then((results) => {
      if (!alive) return;
      let failures = 0;
      const [metarResult, sigmetResult, radarResult, pirepResult] = results;
      if (metarResult.status === "fulfilled") setMetar(metarResult.value); else failures += 1;
      if (sigmetResult.status === "fulfilled") setSigmet(sigmetResult.value); else failures += 1;
      if (radarResult.status === "fulfilled") setRadar(radarResult.value); else failures += 1;
      if (pirepResult.status === "fulfilled") setPirep(pirepResult.value); else failures += 1;
      setFailedSources(failures);
    });
    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    void fetch(`/api/weather/wind?level=${windLevel}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("wind unavailable");
        return response.json() as Promise<WindResponse>;
      })
      .then((payload) => { if (alive) setWind(payload); })
      .catch((error) => {
        if (alive && (error as Error).name !== "AbortError") setWind(null);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [windLevel]);

  const airports = useMemo(() => [...(metar?.observations ?? [])].sort((a, b) => {
    const ai = AIRPORT_PRIORITY.indexOf(a.stationId);
    const bi = AIRPORT_PRIORITY.indexOf(b.stationId);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    return a.stationId.localeCompare(b.stationId);
  }), [metar?.observations]);

  const strongWind = airports.filter((item) => (item.windSpeed ?? 0) >= 20 || (item.windGust ?? 0) >= 25);
  const sigmets = sigmet?.features ?? [];
  const thunderstormCount = sigmets.filter((feature) => isThunderstorm(feature.properties)).length;
  const windSpeeds = (wind?.points ?? []).map((point) => point.speedKt).filter((value): value is number => value !== null && Number.isFinite(value));
  const averageWind = windSpeeds.length ? windSpeeds.reduce((sum, value) => sum + value, 0) / windSpeeds.length : null;
  const maxWind = windSpeeds.length ? Math.max(...windSpeeds) : null;
  const latestFrame = radar?.frames.find((frame) => frame.id === radar.latestFrameId) ?? radar?.frames[0] ?? null;

  return <main className={styles.page} data-testid="weather-operations-center-v1">
    <PageHeader
      kicker="AIRRADAR / WEATHER"
      title={copy.title}
      description={copy.subtitle}
      actions={<div className={styles.headerMeta}>
        <StatusBadge variant={failedSources ? "warning" : metar && sigmet && radar ? "success" : "neutral"}>
          {failedSources ? copy.partial : metar && sigmet && radar ? copy.live : copy.loading}
        </StatusBadge>
        {metar?.fetchedAt ? <small>{copy.updated} {timeLabel(metar.fetchedAt)}</small> : null}
      </div>}
    />

    <MetricStrip>
      <MetricCard value={formatNumber(airports.length)} label={copy.airportReports} />
      <MetricCard value={formatNumber(sigmets.length)} label={copy.activeSigmets} />
      <MetricCard value={formatNumber(thunderstormCount)} label={copy.thunderstormAreas} />
      <MetricCard value={formatNumber(strongWind.length)} label={copy.strongWindAirports} />
      <MetricCard value={formatNumber(pirep?.reports.length ?? 0)} label={copy.pireps} />
    </MetricStrip>

    <div className={styles.grid}>
      <Panel className={styles.airportsPanel}>
        <SectionHeader kicker="METAR" title={copy.airports} description={copy.airportsDescription} />
        {airports.length ? <div className={styles.airportList}>
          {airports.slice(0, 12).map((airport) => <article key={airport.stationId}>
            <div>
              <strong>{airport.stationId}</strong>
              <StatusBadge variant={weatherVariant(airport.flightCategory)}>{airport.flightCategory ?? "N/A"}</StatusBadge>
            </div>
            <b>{windLabel(airport)}</b>
            <small>{airport.visibility === null ? t.common.emptyValue : `${Math.round(airport.visibility / 100) / 10} km`} · {timeLabel(airport.observedAt)}</small>
          </article>)}
        </div> : <EmptyState title={metar ? copy.noData : copy.loading} />}
      </Panel>

      <Panel>
        <SectionHeader kicker="ADVISORIES" title={copy.sigmets} description={copy.sigmetsDescription} />
        {sigmets.length ? <div className={styles.sigmetList}>
          {sigmets.slice(0, 10).map((feature) => <article key={feature.id}>
            <div>
              <strong>{feature.properties.firId ?? feature.properties.issuingOffice ?? "SIGMET"}</strong>
              <StatusBadge variant={isThunderstorm(feature.properties) ? "warning" : "neutral"}>{feature.properties.source.toUpperCase()}</StatusBadge>
            </div>
            <span>{sigmetText(feature.properties)}</span>
            <small>{timeLabel(feature.properties.validFrom)}–{timeLabel(feature.properties.validTo)} · {feature.properties.lowerFt === null ? "SFC" : `${Math.round(feature.properties.lowerFt / 100)}`}–{feature.properties.upperFt === null ? "TOP" : `${Math.round(feature.properties.upperFt / 100)}`}</small>
          </article>)}
        </div> : <EmptyState title={sigmet ? copy.noData : copy.loading} />}
      </Panel>

      <Panel>
        <SectionHeader
          kicker="ICON-EU"
          title={copy.wind}
          description={copy.windDescription}
          actions={<div className={styles.windTabs} role="group" aria-label={copy.wind}>
            {WIND_LEVELS.map((item) => <button key={item.level} type="button" aria-pressed={windLevel === item.level} onClick={() => setWindLevel(item.level)}>{item.label}</button>)}
          </div>}
        />
        {wind ? <div className={styles.windBody}>
          <div className={styles.windHero}><strong>{WIND_LEVELS.find((item) => item.level === wind.levelHpa)?.label}</strong><span>{wind.levelHpa} hPa</span></div>
          <dl className={styles.windMetrics}>
            <div><dt>{copy.averageWind}</dt><dd>{averageWind === null ? t.common.emptyValue : `${averageWind.toLocaleString(t.locale, { maximumFractionDigits: 0 })} kt`}</dd></div>
            <div><dt>{copy.maxWind}</dt><dd>{maxWind === null ? t.common.emptyValue : `${Math.round(maxWind)} kt`}</dd></div>
            <div><dt>{copy.valid}</dt><dd>{timeLabel(wind.validAt)}</dd></div>
          </dl>
          <small className={styles.muted}>{wind.provider} · {wind.model}{wind.modelRun ? ` · ${wind.modelRun}` : ""}</small>
        </div> : <EmptyState title={copy.loading} />}
      </Panel>

      <Panel>
        <SectionHeader kicker="CHMI" title={copy.radar} description={copy.radarDescription} />
        {radar ? <div className={styles.radarBody}>
          <div className={styles.radarStatus}>
            <StatusBadge variant={!radar.available ? "warning" : latestFrame?.stale ? "stale" : "success"}>
              {!radar.available ? copy.noData : latestFrame?.stale ? copy.stale : copy.live}
            </StatusBadge>
            <strong>{radar.provider} / {radar.product}</strong>
          </div>
          <dl className={styles.windMetrics}>
            <div><dt>{copy.latestFrame}</dt><dd>{timeLabel(latestFrame?.observedAt)}</dd></div>
            <div><dt>{copy.frames}</dt><dd>{formatNumber(radar.frames.length)}</dd></div>
          </dl>
        </div> : <EmptyState title={copy.loading} />}
      </Panel>

      <Panel className={styles.reportsPanel}>
        <SectionHeader kicker="AWC" title={copy.reports} description={copy.reportsDescription} />
        {pirep?.reports.length ? <div className={styles.reportList}>
          {pirep.reports.slice(0, 12).map((report) => <article key={report.id}>
            <div>
              <strong>{report.reportType}</strong>
              {report.urgent ? <StatusBadge variant="danger">{copy.urgent}</StatusBadge> : null}
            </div>
            <span>{report.aircraftType ?? t.common.emptyValue} · {report.altitudeFt === null ? t.common.emptyValue : `FL${Math.round(report.altitudeFt / 100)}`} · {timeLabel(report.observedAt)}</span>
            <small>{[
              report.turbulence?.intensity ? `TURB ${report.turbulence.intensity}` : null,
              report.icing?.intensity ? `ICE ${report.icing.intensity}` : null,
              report.weather,
            ].filter(Boolean).join(" · ") || report.rawText?.slice(0, 100) || t.common.emptyValue}</small>
          </article>)}
        </div> : <EmptyState title={pirep ? copy.noData : copy.loading} />}
      </Panel>
    </div>
  </main>;
}
