"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { HistoryFlightSummary } from "@/lib/server/history";
import type { StatisticsTrafficResponse } from "@/lib/statistics-traffic";
import { formatNumber, t } from "@/lib/i18n";
import { EmptyState, MetricCard, MetricStrip, PageHeader, Panel, SectionHeader, StatusBadge } from "@/components/ui-primitives";
import styles from "./route-network-detail.module.css";

interface RouteHistoryResponse {
  flights: HistoryFlightSummary[];
  range: "today" | "yesterday" | "7d";
  limit: number;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(t.locale, { dateStyle: "short", timeStyle: "short" }).format(date)
    : t.common.emptyValue;
}

function durationMinutes(flight: HistoryFlightSummary): number | null {
  const start = Date.parse(flight.startTime);
  const end = Date.parse(flight.endTime ?? flight.lastSeenAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 60_000);
}

function formatDuration(minutes: number | null): string {
  if (minutes === null) return t.common.emptyValue;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}h ${String(rest).padStart(2, "0")}m` : `${rest}m`;
}

export function RouteNetworkDetail({ origin, destination }: { origin: string; destination: string }) {
  const cs = t.locale.startsWith("cs");
  const copy = cs ? {
    title: `${origin} → ${destination}`,
    subtitle: "Detail receiver-observed trasy nad existujícími bounded agregacemi a recent Flight historií.",
    back: "Zpět na síť tras",
    observed30d: "Pozorované lety / 30 dní",
    flightsPerDay: "Letů / den",
    recentSample: "Recent lety / 7 dní",
    aircraftTypes: "Typy letadel",
    recentFlights: "Recent flights",
    recentDescription: "Nejnovější uložené Flight instance pro tuto origin/destination dvojici; seznam je omezen na 100 záznamů.",
    typeDescription: "Distribuce typů vychází pouze z bounded recent 7denního vzorku.",
    firstInSample: "Nejstarší ve vzorku",
    lastObserved: "Poslední pozorovaný",
    outsideTop: "MIMO TOP 8",
    topRouteNote: "Přesný 30denní počet veřejný bounded agregát zpřístupňuje jen pro top 8 tras.",
    loading: "Načítám detail trasy…",
    unavailable: "Route data jsou dočasně nedostupná.",
    noFlights: "Pro tuto trasu nejsou v posledních 7 dnech uložené lety.",
    callsign: "Let",
    aircraft: "Letadlo",
    started: "Začátek",
    duration: "Délka",
    maxAltitude: "Max výška",
    openFlight: "Otevřít Flight Story",
    sample: "7D SAMPLE",
    aggregate: "30D AGGREGATE",
  } : {
    title: `${origin} → ${destination}`,
    subtitle: "Receiver-observed route detail built from existing bounded aggregates and recent Flight history.",
    back: "Back to route network",
    observed30d: "Observed flights / 30 days",
    flightsPerDay: "Flights / day",
    recentSample: "Recent flights / 7 days",
    aircraftTypes: "Aircraft types",
    recentFlights: "Recent flights",
    recentDescription: "Newest persisted Flight instances for this origin/destination pair; the list is capped at 100 records.",
    typeDescription: "Type distribution is based only on the bounded recent 7-day sample.",
    firstInSample: "Earliest in sample",
    lastObserved: "Last observed",
    outsideTop: "OUTSIDE TOP 8",
    topRouteNote: "The public bounded 30-day aggregate exposes an exact route count only for the top 8 routes.",
    loading: "Loading route detail…",
    unavailable: "Route data is temporarily unavailable.",
    noFlights: "No persisted flights were observed on this route in the last 7 days.",
    callsign: "Flight",
    aircraft: "Aircraft",
    started: "Started",
    duration: "Duration",
    maxAltitude: "Max altitude",
    openFlight: "Open Flight Story",
    sample: "7D SAMPLE",
    aggregate: "30D AGGREGATE",
  };

  const [traffic, setTraffic] = useState<StatisticsTrafficResponse | null>(null);
  const [history, setHistory] = useState<RouteHistoryResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setFailed(false);
    void Promise.all([
      fetch("/api/statistics/traffic?range=30d", { cache: "no-store", signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error("traffic unavailable");
        return response.json() as Promise<StatisticsTrafficResponse>;
      }),
      fetch(`/api/history/flights?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&range=7d&limit=100`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error("history unavailable");
        return response.json() as Promise<RouteHistoryResponse>;
      }),
    ]).then(([nextTraffic, nextHistory]) => {
      if (!active) return;
      setTraffic(nextTraffic);
      setHistory(nextHistory);
    }).catch((error) => {
      if (!active || (error as Error).name === "AbortError") return;
      setFailed(true);
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [origin, destination]);

  const flights = history?.flights ?? [];
  const routeAggregate = traffic?.topRoutes.find((route) => route.origin === origin && route.destination === destination) ?? null;
  const oldest = flights.at(-1) ?? null;
  const newest = flights[0] ?? null;
  const typeRanking = useMemo(() => {
    const counts = new Map<string, number>();
    for (const flight of flights) {
      const type = flight.aircraftType?.trim().toUpperCase();
      if (type) counts.set(type, (counts.get(type) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([type, count]) => ({ type, count, share: flights.length ? (count / flights.length) * 100 : 0 }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type))
      .slice(0, 8);
  }, [flights]);

  const observed30d = routeAggregate?.count ?? null;
  const flightsPerDay = observed30d === null ? null : observed30d / 30;

  return <main className={styles.page} data-testid="route-network-detail-v2">
    <PageHeader
      kicker="AIRRADAR / ROUTES / DETAIL"
      title={copy.title}
      description={copy.subtitle}
      actions={<div className={styles.headerActions}>
        <Link href="/routes">← {copy.back}</Link>
        <StatusBadge variant={failed ? "warning" : traffic && history ? "success" : "neutral"}>
          {failed ? copy.unavailable : traffic && history ? "POSTGRES / FLIGHT" : copy.loading}
        </StatusBadge>
      </div>}
    />

    <div className={styles.routeHero}>
      <Link href={`/airports/${encodeURIComponent(origin)}`}>{origin}</Link>
      <span>→</span>
      <Link href={`/airports/${encodeURIComponent(destination)}`}>{destination}</Link>
    </div>

    <MetricStrip>
      <MetricCard value={observed30d === null ? copy.outsideTop : formatNumber(observed30d)} label={copy.observed30d} detail={copy.aggregate} />
      <MetricCard value={flightsPerDay === null ? t.common.emptyValue : flightsPerDay.toLocaleString(t.locale, { maximumFractionDigits: 1 })} label={copy.flightsPerDay} detail={copy.aggregate} />
      <MetricCard value={formatNumber(flights.length)} label={copy.recentSample} detail={history?.limit === flights.length ? "≤100 · " + copy.sample : copy.sample} />
      <MetricCard value={oldest ? formatDateTime(oldest.startTime) : t.common.emptyValue} label={copy.firstInSample} detail={copy.sample} />
      <MetricCard value={newest ? formatDateTime(newest.startTime) : t.common.emptyValue} label={copy.lastObserved} detail={copy.sample} />
    </MetricStrip>

    {observed30d === null && traffic ? <p className={styles.aggregateNote}>{copy.topRouteNote}</p> : null}

    <div className={styles.grid}>
      <Panel>
        <SectionHeader kicker="AIRCRAFT MIX" title={copy.aircraftTypes} description={copy.typeDescription} />
        {typeRanking.length ? <div className={styles.typeList}>
          {typeRanking.map((item) => <div key={item.type}>
            <span><strong>{item.type}</strong><small>{formatNumber(item.count)} / {formatNumber(flights.length)}</small></span>
            <b>{item.share.toLocaleString(t.locale, { maximumFractionDigits: 1 })}%</b>
          </div>)}
        </div> : <EmptyState title={history ? copy.noFlights : copy.loading} />}
      </Panel>

      <Panel className={styles.flightsPanel}>
        <SectionHeader kicker="HISTORY" title={copy.recentFlights} description={copy.recentDescription} />
        {failed ? <EmptyState title={copy.unavailable} /> : !history ? <p className={styles.loading}>{copy.loading}</p> : flights.length ? <div className={styles.flightList}>
          {flights.slice(0, 16).map((flight) => <Link key={flight.id} href={`/flights/${flight.id}`}>
            <span className={styles.flightIdentity}>
              <strong>{flight.callsign || t.common.emptyValue}</strong>
              <small>{flight.registration || flight.icaoHex} · {flight.aircraftType || t.common.emptyValue}</small>
            </span>
            <span><small>{copy.started}</small><b>{formatDateTime(flight.startTime)}</b></span>
            <span><small>{copy.duration}</small><b>{formatDuration(durationMinutes(flight))}</b></span>
            <span><small>{copy.maxAltitude}</small><b>{flight.maxAltitude === null ? t.common.emptyValue : `FL${Math.round(flight.maxAltitude / 100)}`}</b></span>
            <em>{copy.openFlight} →</em>
          </Link>)}
        </div> : <EmptyState title={copy.noFlights} />}
      </Panel>
    </div>
  </main>;
}
