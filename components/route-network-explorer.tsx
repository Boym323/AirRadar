"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import type { StatisticsTrafficRange, StatisticsTrafficResponse, StatisticsTrafficRouteItem } from "@/lib/statistics-traffic";
import { formatNumber, t } from "@/lib/i18n";
import { EmptyState, MetricCard, MetricStrip, PageHeader, Panel, SectionHeader, StatusBadge } from "@/components/ui-primitives";
import styles from "./route-network-explorer.module.css";

const RANGES: StatisticsTrafficRange[] = ["today", "7d", "30d"];

function routeKey(route: StatisticsTrafficRouteItem): string {
  return route.origin + ":" + route.destination;
}

function airportHref(code: string) {
  return { pathname: "/airports/" + encodeURIComponent(code) } as const;
}

function routeDetailHref(origin: string, destination: string): Route {
  return ("/routes/" + encodeURIComponent(origin) + "/" + encodeURIComponent(destination)) as Route;
}

export function RouteNetworkExplorer() {
  const cs = t.locale.startsWith("cs");
  const copy = cs ? {
    title: "Síť tras",
    subtitle: "Přehled nejčastěji pozorovaných tras mezi odletovými a příletovými letišti z uložených letů.",
    today: "Dnes",
    seven: "7 dní",
    thirty: "30 dní",
    observedFlights: "Pozorované lety",
    routePairs: "Nejčastější trasy",
    activeOrigins: "Aktivní odlety",
    activeDestinations: "Aktivní přílety",
    routeNetwork: "Síť tras",
    routeNetworkDescription: "Pořadí vychází ze souhrnných údajů o uložených letech, nikoli z jednotlivých bodů polohy.",
    routeDetail: "Detail trasy",
    routeDetailDescription: "Vyberte trasu a zobrazte její podíl na provozu v aktuálním období.",
    flights: "letů",
    share: "Podíl na všech pozorovaných letech",
    rank: "Pořadí",
    origin: "Odlet",
    destination: "Přílet",
    openAirport: "Otevřít letiště",
    openRoute: "Otevřít detail trasy",
    sourceUnavailable: "Údaje o provozu jsou dočasně nedostupné.",
    noRoutes: "Pro toto období zatím nejsou k dispozici žádné úplné trasy mezi odletovým a příletovým letištěm.",
    filter: "Filtrovat trasu",
    filterPlaceholder: "LKPR, EGLL…",
    generated: "Aktualizováno",
    persisted: "DATABÁZE / SOUHRN LETŮ",
  } : {
    title: "Route Network",
    subtitle: "Explorer for the receiver's most frequently observed origin/destination routes from persisted Flight records.",
    today: "Today",
    seven: "7 days",
    thirty: "30 days",
    observedFlights: "Observed flights",
    routePairs: "Top routes",
    activeOrigins: "Active origins",
    activeDestinations: "Active destinations",
    routeNetwork: "Route Network",
    routeNetworkDescription: "Ranking uses bounded Flight aggregates only and never scans individual FlightPosition rows.",
    routeDetail: "Route detail",
    routeDetailDescription: "Select a route to inspect its share of traffic in the current period.",
    flights: "flights",
    share: "Share of all observed flights",
    rank: "Rank",
    origin: "Origin",
    destination: "Destination",
    openAirport: "Open airport",
    openRoute: "Open route detail",
    sourceUnavailable: "Traffic data is temporarily unavailable.",
    noRoutes: "No complete origin/destination routes are available for this period yet.",
    filter: "Filter route",
    filterPlaceholder: "LKPR, EGLL…",
    generated: "Updated",
    persisted: "POSTGRES / FLIGHT AGGREGATES",
  };

  const [range, setRange] = useState<StatisticsTrafficRange>("7d");
  const [data, setData] = useState<StatisticsTrafficResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setFailed(false);
    void fetch("/api/statistics/traffic?range=" + encodeURIComponent(range), { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("route network request failed");
        return await response.json() as StatisticsTrafficResponse;
      })
      .then((next) => {
        if (!active) return;
        setData(next);
        setSelectedKey((current) => current && next.topRoutes.some((route) => routeKey(route) === current)
          ? current
          : next.topRoutes[0] ? routeKey(next.topRoutes[0]) : null);
      })
      .catch((error) => {
        if (!active || (error as Error).name === "AbortError") return;
        setFailed(true);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [range]);

  const filteredRoutes = useMemo(() => {
    const normalized = query.trim().toUpperCase();
    if (!normalized) return data?.topRoutes ?? [];
    return (data?.topRoutes ?? []).filter((route) =>
      route.origin.includes(normalized)
      || route.destination.includes(normalized)
      || (route.origin + " " + route.destination).includes(normalized),
    );
  }, [data?.topRoutes, query]);

  const selected = useMemo(
    () => (data?.topRoutes ?? []).find((route) => routeKey(route) === selectedKey) ?? null,
    [data?.topRoutes, selectedKey],
  );
  const selectedRank = selected ? (data?.topRoutes.findIndex((route) => routeKey(route) === routeKey(selected)) ?? -1) + 1 : null;
  const selectedShare = selected && data?.observedFlights
    ? (selected.count / data.observedFlights) * 100
    : null;

  return <main className={styles.page} data-testid="route-network-explorer-v1">
    <PageHeader
      kicker="AIRRADAR / ROUTES"
      title={copy.title}
      description={copy.subtitle}
      actions={<div className={styles.headerMeta}>
        <StatusBadge variant={data?.source === "postgres" ? "success" : data?.source === "unavailable" || failed ? "warning" : "neutral"}>
          {data?.source === "postgres" ? copy.persisted : data?.source === "unavailable" || failed ? copy.sourceUnavailable : t.common.loading}
        </StatusBadge>
        {data ? <small>{copy.generated} {new Intl.DateTimeFormat(t.locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(data.generatedAt))}</small> : null}
      </div>}
    />

    <div className={styles.rangeTabs} role="group" aria-label={copy.title}>
      {RANGES.map((value) => <button type="button" key={value} aria-pressed={range === value} onClick={() => setRange(value)}>
        {value === "today" ? copy.today : value === "7d" ? copy.seven : copy.thirty}
      </button>)}
    </div>

    <MetricStrip>
      <MetricCard value={data?.observedFlights === null || data?.observedFlights === undefined ? t.common.emptyValue : formatNumber(data.observedFlights)} label={copy.observedFlights} detail={data ? data.from + " → " + data.to : undefined} />
      <MetricCard value={formatNumber(data?.topRoutes.length ?? 0)} label={copy.routePairs} />
      <MetricCard value={formatNumber(data?.topOrigins.length ?? 0)} label={copy.activeOrigins} />
      <MetricCard value={formatNumber(data?.topDestinations.length ?? 0)} label={copy.activeDestinations} />
    </MetricStrip>

    <div className={styles.grid}>
      <Panel className={styles.routesPanel}>
        <SectionHeader kicker="NETWORK" title={copy.routeNetwork} description={copy.routeNetworkDescription} />
        <label className={styles.search}>
          <span>{copy.filter}</span>
          <input value={query} placeholder={copy.filterPlaceholder} onChange={(event) => setQuery(event.target.value.toUpperCase())} />
        </label>
        {failed ? <EmptyState title={copy.sourceUnavailable} /> : !data ? <p className={styles.loading}>{t.common.loading}</p> : filteredRoutes.length ? (
          <ol className={styles.routeList}>
            {filteredRoutes.map((route) => {
              const key = routeKey(route);
              const active = key === selectedKey;
              return <li key={key}>
                <button type="button" className={active ? styles.selected : undefined} aria-pressed={active} onClick={() => setSelectedKey(key)}>
                  <span className={styles.routeCodes}><strong>{route.origin}</strong><span>→</span><strong>{route.destination}</strong></span>
                  <span className={styles.routeCount}>{formatNumber(route.count)} <small>{copy.flights}</small></span>
                </button>
              </li>;
            })}
          </ol>
        ) : <EmptyState title={copy.noRoutes} />}
      </Panel>

      <Panel className={styles.detailPanel}>
        <SectionHeader kicker="ROUTE" title={copy.routeDetail} description={copy.routeDetailDescription} />
        {selected ? <div className={styles.detail}>
          <div className={styles.routeHero}>
            <Link href={airportHref(selected.origin)}>{selected.origin}</Link>
            <span>→</span>
            <Link href={airportHref(selected.destination)}>{selected.destination}</Link>
          </div>
          <dl className={styles.detailMetrics}>
            <div><dt>{copy.flights}</dt><dd>{formatNumber(selected.count)}</dd></div>
            <div><dt>{copy.rank}</dt><dd>#{selectedRank}</dd></div>
            <div><dt>{copy.share}</dt><dd>{selectedShare === null ? t.common.emptyValue : selectedShare.toLocaleString(t.locale, { maximumFractionDigits: 1 }) + " %"}</dd></div>
          </dl>
          <div className={styles.airportActions}>
            <Link href={airportHref(selected.origin)}><span>{copy.origin}</span><strong>{selected.origin}</strong><small>{copy.openAirport} →</small></Link>
            <Link href={airportHref(selected.destination)}><span>{copy.destination}</span><strong>{selected.destination}</strong><small>{copy.openAirport} →</small></Link>
            <Link className={styles.routeDetailAction} href={routeDetailHref(selected.origin, selected.destination)}><span>ROUTE V2</span><strong>{selected.origin} → {selected.destination}</strong><small>{copy.openRoute} →</small></Link>
          </div>
        </div> : <EmptyState title={copy.noRoutes} />}
      </Panel>

      <Panel>
        <SectionHeader kicker="ORIGINS" title={copy.activeOrigins} />
        <ol className={styles.ranking}>
          {(data?.topOrigins ?? []).map((item) => <li key={item.name}><Link href={airportHref(item.name)}>{item.name}</Link><strong>{formatNumber(item.count)}</strong></li>)}
        </ol>
      </Panel>

      <Panel>
        <SectionHeader kicker="DESTINATIONS" title={copy.activeDestinations} />
        <ol className={styles.ranking}>
          {(data?.topDestinations ?? []).map((item) => <li key={item.name}><Link href={airportHref(item.name)}>{item.name}</Link><strong>{formatNumber(item.count)}</strong></li>)}
        </ol>
      </Panel>
    </div>
  </main>;
}
