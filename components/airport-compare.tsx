"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import type { Airport } from "@/lib/airports/types";
import type { FlightCategory, MetarObservation } from "@/lib/weather/types";
import { t } from "@/lib/i18n";
import { buildAirportCompareInvestigation, investigationHref, parseAirportCompareInvestigation } from "@/lib/investigation-links";
import {
  Button,
  EmptyState,
  PageHeader,
  Panel,
  SectionHeader,
  SegmentedControl,
  StatusBadge,
} from "@/components/ui-primitives";
import styles from "./airport-compare.module.css";

type Period = "24h" | "7d";
type MovementKind = "APPROACH" | "LANDING" | "TAKEOFF" | "DEPARTURE" | "GO_AROUND" | "HOLDING" | "OVERFLIGHT";

interface AirportMovement {
  movement: MovementKind;
  observedAt: string;
  runway: { designator: string } | null;
}

interface AirportMovementsResponse {
  airport: { icao: string; name: string };
  period: Period | "today";
  generatedAt: string;
  complete: boolean;
  truncated: boolean;
  movements: AirportMovement[];
  summary: {
    approaches: number;
    landings: number;
    takeoffs: number;
    departures: number;
    overflights: number;
    goArounds: number;
    holding: number;
    runwayRelevantMovements: number;
    probableRunwayMovements: number;
    unknownRunwayMovements: number;
    probableRunways: Array<{ designator: string; count: number }>;
  };
}

interface AirportWeatherResponse {
  metar: MetarObservation | null;
  stale: boolean;
  enabled?: boolean;
  available?: boolean;
}

interface SideData {
  movements: AirportMovementsResponse | null;
  weather: AirportWeatherResponse | null;
  movementsFailed: boolean;
  weatherFailed: boolean;
}

interface DerivedMetrics {
  arrivals: number;
  departures: number;
  total: number;
  peakHour: number | null;
  peakHourCount: number;
  runway: string | null;
  runwayShare: number | null;
  goArounds: number;
  holding: number;
  overflights: number;
  flightCategory: FlightCategory | null;
  wind: string;
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
}

function validIcao(value: string): boolean {
  return /^[A-Z0-9]{4}$/.test(value);
}

function airportHref(code: string): Route {
  return ("/airports/" + encodeURIComponent(code)) as Route;
}

function weatherVariant(category: FlightCategory | null): "success" | "warning" | "danger" | "neutral" {
  if (category === "VFR") return "success";
  if (category === "MVFR") return "warning";
  if (category === "IFR" || category === "LIFR") return "danger";
  return "neutral";
}

function movementMetrics(data: SideData | null): DerivedMetrics | null {
  if (!data?.movements) return null;
  const response = data.movements;
  const arrivals = response.summary.approaches + response.summary.landings;
  const departures = response.summary.takeoffs + response.summary.departures;
  const operational = response.movements.filter((item) => item.movement !== "OVERFLIGHT" && item.movement !== "HOLDING");
  const byHour = new Map<number, number>();
  for (const item of operational) {
    const date = new Date(item.observedAt);
    if (!Number.isFinite(date.getTime())) continue;
    const hour = date.getUTCHours();
    byHour.set(hour, (byHour.get(hour) ?? 0) + 1);
  }
  const peak = [...byHour.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0] ?? null;
  const runway = response.summary.probableRunways[0] ?? null;
  const runwayShare = runway && response.summary.runwayRelevantMovements > 0
    ? runway.count / response.summary.runwayRelevantMovements
    : null;
  const metar = data.weather?.metar ?? null;
  let wind = "—";
  if (metar?.windSpeedKt !== null && metar?.windSpeedKt !== undefined) {
    const direction = metar.windVariable ? "VRB" : metar.windDirectionDeg === null ? "—" : String(Math.round(metar.windDirectionDeg)).padStart(3, "0") + "°";
    wind = direction + " / " + Math.round(metar.windSpeedKt) + " kt";
    if (metar.windGustKt !== null) wind += " G" + Math.round(metar.windGustKt);
  }
  return {
    arrivals,
    departures,
    total: arrivals + departures + response.summary.goArounds,
    peakHour: peak?.[0] ?? null,
    peakHourCount: peak?.[1] ?? 0,
    runway: runway?.designator ?? null,
    runwayShare,
    goArounds: response.summary.goArounds,
    holding: response.summary.holding,
    overflights: response.summary.overflights,
    flightCategory: metar?.flightCategory ?? null,
    wind,
  };
}

function percent(value: number | null): string {
  return value === null ? "—" : Math.round(value * 100) + "%";
}

function peakHour(value: number | null): string {
  if (value === null) return "—";
  return String(value).padStart(2, "0") + ":00–" + String((value + 1) % 24).padStart(2, "0") + ":00 UTC";
}

function airportLabel(airport: Airport | undefined, code: string): string {
  if (!airport) return code;
  return (airport.iataCode ? airport.iataCode + " · " : "") + airport.icaoCode + " — " + airport.name;
}

function SideHeader({ airport, code, metrics }: { airport: Airport | undefined; code: string; metrics: DerivedMetrics | null }) {
  return (
    <div className={styles.sideHeader}>
      <div>
        <strong>{airportLabel(airport, code)}</strong>
        {airport ? <span>{[airport.city, airport.country].filter(Boolean).join(" · ")}</span> : null}
      </div>
      {metrics?.flightCategory ? <StatusBadge variant={weatherVariant(metrics.flightCategory)}>{metrics.flightCategory}</StatusBadge> : null}
    </div>
  );
}

function RunwayPanel({ data, title }: { data: AirportMovementsResponse | null; title: string }) {
  const cs = t.locale.startsWith("cs");
  const rows = data?.summary.probableRunways ?? [];
  const total = data?.summary.runwayRelevantMovements ?? 0;
  return (
    <Panel className={styles.runwayPanel}>
      <SectionHeader title={title} description={data ? String(data.summary.probableRunwayMovements) + (cs ? " klasifikováno / " : " classified / ") + String(total) + (cs ? " souvisejících s drahou" : " runway-relevant") : undefined} />
      {!data || rows.length === 0 ? <EmptyState title={cs ? "Chybí údaje o využití drah" : "No runway sample"} /> : (
        <div className={styles.runwayList}>
          {rows.slice(0, 6).map((item) => {
            const share = total > 0 ? item.count / total : 0;
            return (
              <div className={styles.runwayRow} key={item.designator}>
                <div><strong>RWY {item.designator}</strong><span>{item.count} · {Math.round(share * 100)}%</span></div>
                <span className={styles.bar}><span style={{ width: Math.max(4, share * 100) + "%" }} /></span>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

export function AirportCompare() {
  const cs = t.locale.startsWith("cs");
  const copy = cs ? {
    title: "Porovnání letišť",
    subtitle: "Porovnání provozu dvou letišť podle pohybů zachycených přijímačem a meteorologických zpráv METAR.",
    back: "Zpět na radar",
    period: "Období",
    left: "Letiště A",
    right: "Letiště B",
    swap: "Prohodit",
    arrivals: "Přílety",
    departures: "Odlety",
    total: "Celkem pohybů",
    runway: "Dominantní dráha",
    runwayShare: "Využití dominantní dráhy",
    peak: "Nejvytíženější hodina UTC",
    peakCount: "Pohyby v nejvytíženější hodině",
    weather: "Počasí",
    wind: "Vítr",
    goArounds: "Opakovaná přiblížení",
    holding: "Vyčkávání",
    overflights: "Průlety",
    compare: "Srovnání",
    runwayUsage: "Využití drah",
    loading: "Načítám porovnání letišť…",
    invalid: "Zadej dva rozdílné platné ICAO kódy.",
    unavailable: "Údaje o pohybech na jednom či obou letištích nejsou dostupné.",
    bounded: "Pohyby a dráhy jsou odvozené z omezených pozorování přijímače; nejde o oficiální letištní statistiku ani údaje ATC.",
    partial: "Část dat je neúplná nebo byla oříznuta limity backendu.",
    openAirport: "Otevřít letiště",
  } : {
    title: "Airport Compare",
    subtitle: "Side-by-side airport comparison over existing receiver-inferred movement and METAR data.",
    back: "Back to radar",
    period: "Period",
    left: "Airport A",
    right: "Airport B",
    swap: "Swap",
    arrivals: "Arrivals",
    departures: "Departures",
    total: "Total movements",
    runway: "Dominant runway",
    runwayShare: "Dominant runway utilization",
    peak: "Peak UTC hour",
    peakCount: "Movements in peak hour",
    weather: "Weather",
    wind: "Wind",
    goArounds: "Go-arounds",
    holding: "Holding",
    overflights: "Overflights",
    compare: "Comparison",
    runwayUsage: "Runway utilization",
    loading: "Loading airport comparison…",
    invalid: "Enter two different valid ICAO codes.",
    unavailable: "Movement data for one or both airports is unavailable.",
    bounded: "Movements and runway assignments are receiver-inferred and bounded, not authoritative FIDS/ATC statistics.",
    partial: "Some data is incomplete or truncated by backend limits.",
    openAirport: "Open airport",
  };

  const [catalog, setCatalog] = useState<Airport[]>([]);
  const [leftCode, setLeftCode] = useState("LKPR");
  const [rightCode, setRightCode] = useState("LOWW");
  const [period, setPeriod] = useState<Period>("24h");
  const [left, setLeft] = useState<SideData | null>(null);
  const [right, setRight] = useState<SideData | null>(null);
  const [loading, setLoading] = useState(true);
  const [investigationUrlReady, setInvestigationUrlReady] = useState(false);
  const restoringInvestigationUrl = useRef(true);

  useEffect(() => {
    const restore = () => {
      const parsed = parseAirportCompareInvestigation(window.location.search);
      setLeftCode(parsed.a ?? "LKPR");
      setRightCode(parsed.b ?? "LOWW");
      setPeriod(parsed.period);
    };
    restore();
    setInvestigationUrlReady(true);
    const onPopState = () => {
      restoringInvestigationUrl.current = true;
      restore();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!investigationUrlReady || !validIcao(leftCode) || !validIcao(rightCode) || leftCode === rightCode) return;
    const query = buildAirportCompareInvestigation({ a: leftCode, b: rightCode, period });
    const href = investigationHref("/compare/airports", query);
    const currentHref = window.location.pathname + window.location.search;
    if (currentHref === href) {
      restoringInvestigationUrl.current = false;
      return;
    }
    if (restoringInvestigationUrl.current) {
      window.history.replaceState(null, "", href);
      restoringInvestigationUrl.current = false;
    } else {
      window.history.pushState(null, "", href);
    }
  }, [investigationUrlReady, leftCode, period, rightCode]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/airports", { cache: "force-cache", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("airport catalog unavailable");
        return await response.json() as Airport[];
      })
      .then((airports) => {
        if (!controller.signal.aborted) setCatalog(airports);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!validIcao(leftCode) || !validIcao(rightCode) || leftCode === rightCode) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);

    async function load(code: string): Promise<SideData> {
      const [movements, weather] = await Promise.allSettled([
        fetch("/api/airports/" + encodeURIComponent(code) + "/movements?period=" + period, { cache: "no-store", signal: controller.signal })
          .then(async (response) => {
            if (!response.ok) throw new Error("movements unavailable");
            return await response.json() as AirportMovementsResponse;
          }),
        fetch("/api/weather/airport/" + encodeURIComponent(code), { cache: "no-store", signal: controller.signal })
          .then(async (response) => {
            if (!response.ok) throw new Error("weather unavailable");
            return await response.json() as AirportWeatherResponse;
          }),
      ]);
      return {
        movements: movements.status === "fulfilled" ? movements.value : null,
        weather: weather.status === "fulfilled" && weather.value.enabled !== false ? weather.value : null,
        movementsFailed: movements.status === "rejected",
        weatherFailed: weather.status === "rejected",
      };
    }

    void Promise.all([load(leftCode), load(rightCode)]).then(([a, b]) => {
      if (controller.signal.aborted) return;
      setLeft(a);
      setRight(b);
      setLoading(false);
    });

    return () => controller.abort();
  }, [leftCode, period, rightCode]);

  const airportsByIcao = useMemo(() => new Map(catalog.map((airport) => [airport.icaoCode, airport])), [catalog]);
  const leftAirport = airportsByIcao.get(leftCode);
  const rightAirport = airportsByIcao.get(rightCode);
  const leftMetrics = movementMetrics(left);
  const rightMetrics = movementMetrics(right);
  const suggestions = useMemo(() => catalog
    .filter((airport) => airport.scheduledService !== false)
    .sort((a, b) => a.icaoCode.localeCompare(b.icaoCode))
    .slice(0, 800), [catalog]);

  const validSelection = validIcao(leftCode) && validIcao(rightCode) && leftCode !== rightCode;
  const unavailable = validSelection && !loading && (!leftMetrics || !rightMetrics);
  const partial = Boolean(left?.movements?.truncated || right?.movements?.truncated || left?.movements?.complete === false || right?.movements?.complete === false);

  const rows = [
    [copy.arrivals, leftMetrics?.arrivals, rightMetrics?.arrivals],
    [copy.departures, leftMetrics?.departures, rightMetrics?.departures],
    [copy.total, leftMetrics?.total, rightMetrics?.total],
    [copy.runway, leftMetrics?.runway ? "RWY " + leftMetrics.runway : "—", rightMetrics?.runway ? "RWY " + rightMetrics.runway : "—"],
    [copy.runwayShare, percent(leftMetrics?.runwayShare ?? null), percent(rightMetrics?.runwayShare ?? null)],
    [copy.peak, peakHour(leftMetrics?.peakHour ?? null), peakHour(rightMetrics?.peakHour ?? null)],
    [copy.peakCount, leftMetrics?.peakHourCount, rightMetrics?.peakHourCount],
    [copy.weather, leftMetrics?.flightCategory ?? "—", rightMetrics?.flightCategory ?? "—"],
    [copy.wind, leftMetrics?.wind ?? "—", rightMetrics?.wind ?? "—"],
    [copy.goArounds, leftMetrics?.goArounds, rightMetrics?.goArounds],
    [copy.holding, leftMetrics?.holding, rightMetrics?.holding],
    [copy.overflights, leftMetrics?.overflights, rightMetrics?.overflights],
  ];

  function swap(): void {
    setLeftCode(rightCode);
    setRightCode(leftCode);
  }

  return (
    <main className={styles.page}>
      <PageHeader
        backLink={<Link className="back-link" href="/">{copy.back}</Link>}
        kicker="AIRRADAR · AIRPORT INTELLIGENCE"
        title={copy.title}
        description={copy.subtitle}
      />

      <Panel className={styles.controls}>
        <label>
          <span>{copy.left}</span>
          <input list="airport-compare-options" value={leftCode} onChange={(event) => setLeftCode(normalizeCode(event.target.value))} />
        </label>
        <Button size="compact" variant="ghost" onClick={swap}>{copy.swap}</Button>
        <label>
          <span>{copy.right}</span>
          <input list="airport-compare-options" value={rightCode} onChange={(event) => setRightCode(normalizeCode(event.target.value))} />
        </label>
        <div className={styles.period}>
          <span>{copy.period}</span>
          <SegmentedControl role="tablist" aria-label={copy.period}>
            {(["24h", "7d"] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={period === item} className={period === item ? "active" : ""} onClick={() => setPeriod(item)}>{item}</button>)}
          </SegmentedControl>
        </div>
        <datalist id="airport-compare-options">
          {suggestions.map((airport) => <option key={airport.icaoCode} value={airport.icaoCode}>{airport.name}</option>)}
        </datalist>
      </Panel>

      {!validSelection ? <div className={styles.notice}>{copy.invalid}</div> : null}
      {loading && validSelection ? <div className={styles.notice}>{copy.loading}</div> : null}
      {unavailable ? <div className={styles.notice}>{copy.unavailable}</div> : null}
      {partial ? <div className={styles.notice}>{copy.partial}</div> : null}

      {validSelection && !loading && leftMetrics && rightMetrics ? (
        <>
          <Panel className={styles.comparePanel}>
            <SectionHeader title={copy.compare} description={period + " · UTC"} />
            <div className={styles.sideHeaders}>
              <span />
              <SideHeader airport={leftAirport} code={leftCode} metrics={leftMetrics} />
              <SideHeader airport={rightAirport} code={rightCode} metrics={rightMetrics} />
            </div>
            <div className={styles.matrix}>
              {rows.map(([label, a, b]) => (
                <div className={styles.matrixRow} key={String(label)}>
                  <strong>{label}</strong>
                  <span>{a ?? "—"}</span>
                  <span>{b ?? "—"}</span>
                </div>
              ))}
            </div>
            <div className={styles.links}>
              <Link href={airportHref(leftCode)}>{copy.openAirport} · {leftCode}</Link>
              <Link href={airportHref(rightCode)}>{copy.openAirport} · {rightCode}</Link>
            </div>
          </Panel>

          <div className={styles.runwayGrid}>
            <RunwayPanel data={left?.movements ?? null} title={copy.runwayUsage + " · " + leftCode} />
            <RunwayPanel data={right?.movements ?? null} title={copy.runwayUsage + " · " + rightCode} />
          </div>
        </>
      ) : null}

      <p className={styles.disclaimer}>{copy.bounded}</p>
    </main>
  );
}
