"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatNumber, t } from "@/lib/i18n";
import type {
  StatisticsTrafficRange,
  StatisticsTrafficRankingItem,
  StatisticsTrafficResponse,
} from "@/lib/statistics-traffic";
import {
  EmptyState,
  MetricCard,
  MetricStrip,
  PageHeader,
  Panel,
  SectionHeader,
  SegmentedControl,
  StatusBadge,
} from "@/components/ui-primitives";
import styles from "./traffic-geography.module.css";

const RANGES: StatisticsTrafficRange[] = ["today", "7d", "30d"];

function rangeLabel(range: StatisticsTrafficRange, cs: boolean): string {
  if (range === "today") return cs ? "Dnes" : "Today";
  return range === "7d" ? (cs ? "7 dní" : "7 days") : (cs ? "30 dní" : "30 days");
}

function Ranking({
  items,
  empty,
  suffix,
}: {
  items: StatisticsTrafficRankingItem[];
  empty: string;
  suffix: string;
}) {
  if (!items.length) return <EmptyState title={empty} />;
  return (
    <ol className={styles.ranking}>
      {items.map((item, index) => (
        <li key={item.name}>
          <span className={styles.rank}>{index + 1}</span>
          <strong title={item.name}>{item.name}</strong>
          <span>{formatNumber(item.count)} {suffix}</span>
        </li>
      ))}
    </ol>
  );
}

export function TrafficGeography() {
  const cs = t.locale.startsWith("cs");
  const copy = cs ? {
    title: "Geografie provozu",
    subtitle: "Receiver-observed geografická struktura persisted Flight instancí bez nové heatmapy nebo heuristických country inferencí.",
    back: "Zpět na radar",
    statistics: "Statistiky",
    range: "Období",
    observed: "Pozorované lety",
    countries: "Země registrace",
    origins: "Top odletová letiště",
    destinations: "Top příletová letiště",
    representedCountries: "Země v bounded odpovědi",
    topOrigin: "Top origin",
    topDestination: "Top destination",
    flights: "letů",
    countriesDescription: "Canonical registration-country hodnoty z aircraft metadata. Nejde o zemi odletu ani zemi operátora.",
    originsDescription: "Canonical origin ICAO hodnoty z persisted Flight statistik.",
    destinationsDescription: "Canonical destination ICAO hodnoty z persisted Flight statistik.",
    emptyCountries: "Pro toto období nejsou v bounded rankingu země registrace.",
    emptyOrigins: "Pro toto období nejsou v bounded rankingu odletová letiště.",
    emptyDestinations: "Pro toto období nejsou v bounded rankingu příletová letiště.",
    loading: "Načítám geografii provozu…",
    unavailable: "Traffic statistics jsou dočasně nedostupné.",
    bounded: "BOUNDED TOP 8",
    disclosure: "registrationCountries znamená zemi registrace letadla, nikoli origin country nebo operator country. Top origins/destinations jsou pouze airport observations z tohoto přijímače a nejsou reprezentativní statistikou celého regionu. V1 nepoužívá per-airport síťový fan-out ani heuristické domestic/international odvození.",
  } : {
    title: "Traffic Geography",
    subtitle: "Receiver-observed geography of persisted Flight instances without a new heatmap or heuristic country inference.",
    back: "Back to radar",
    statistics: "Statistics",
    range: "Range",
    observed: "Observed flights",
    countries: "Registration countries",
    origins: "Top origin airports",
    destinations: "Top destination airports",
    representedCountries: "Countries in bounded response",
    topOrigin: "Top origin",
    topDestination: "Top destination",
    flights: "flights",
    countriesDescription: "Canonical registration-country values from aircraft metadata. This is neither origin country nor operator country.",
    originsDescription: "Canonical origin ICAO values from persisted Flight statistics.",
    destinationsDescription: "Canonical destination ICAO values from persisted Flight statistics.",
    emptyCountries: "No registration country is present in the bounded ranking for this period.",
    emptyOrigins: "No origin airport is present in the bounded ranking for this period.",
    emptyDestinations: "No destination airport is present in the bounded ranking for this period.",
    loading: "Loading traffic geography…",
    unavailable: "Traffic statistics are temporarily unavailable.",
    bounded: "BOUNDED TOP 8",
    disclosure: "registrationCountries means aircraft registration country, not origin country or operator country. Top origins/destinations are airport observations from this receiver and are not representative statistics for an entire region. V1 performs no per-airport network fan-out and no heuristic domestic/international inference.",
  };

  const [range, setRange] = useState<StatisticsTrafficRange>("today");
  const [data, setData] = useState<StatisticsTrafficResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setFailed(false);
    void fetch("/api/statistics/traffic?range=" + range, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("traffic statistics unavailable");
        return response.json() as Promise<StatisticsTrafficResponse>;
      })
      .then((payload) => {
        if (!controller.signal.aborted) {
          setData(payload);
          setFailed(payload.source === "unavailable");
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted && (error as Error).name !== "AbortError") setFailed(true);
      });
    return () => controller.abort();
  }, [range]);

  const unavailable = failed || data?.source === "unavailable";
  const topOrigin = data?.topOrigins[0] ?? null;
  const topDestination = data?.topDestinations[0] ?? null;

  return (
    <main className={styles.page} data-testid="traffic-geography-v1">
      <PageHeader
        kicker="AIRRADAR · TRAFFIC ANALYTICS"
        title={copy.title}
        description={copy.subtitle}
        backLink={<Link className="back-link" href="/">{copy.back}</Link>}
        actions={<Link className="back-link" href="/statistics">{copy.statistics}</Link>}
      />

      <div className={styles.controls}>
        <span>{copy.range}</span>
        <SegmentedControl role="tablist" aria-label={copy.range}>
          {RANGES.map((item) => <button key={item} type="button" role="tab" aria-selected={range === item} className={range === item ? "active" : ""} onClick={() => setRange(item)}>{rangeLabel(item, cs)}</button>)}
        </SegmentedControl>
      </div>

      <MetricStrip className={styles.metrics}>
        <MetricCard value={data?.observedFlights === null || !data ? "—" : formatNumber(data.observedFlights)} label={copy.observed} />
        <MetricCard value={data ? formatNumber(data.registrationCountries.length) : "—"} label={copy.representedCountries} detail={copy.bounded} />
        <MetricCard value={topOrigin?.name ?? "—"} label={copy.topOrigin} detail={topOrigin ? formatNumber(topOrigin.count) + " " + copy.flights : undefined} />
        <MetricCard value={topDestination?.name ?? "—"} label={copy.topDestination} detail={topDestination ? formatNumber(topDestination.count) + " " + copy.flights : undefined} />
      </MetricStrip>

      {!data && !failed ? <p className={styles.status}>{copy.loading}</p> : unavailable ? <EmptyState title={copy.unavailable} /> : data ? (
        <div className={styles.grid}>
          <Panel>
            <SectionHeader kicker="REGISTRATION" title={copy.countries} description={copy.countriesDescription} actions={<StatusBadge variant="neutral">{copy.bounded}</StatusBadge>} />
            <Ranking items={data.registrationCountries} empty={copy.emptyCountries} suffix={copy.flights} />
          </Panel>
          <Panel>
            <SectionHeader kicker="ORIGIN ICAO" title={copy.origins} description={copy.originsDescription} actions={<StatusBadge variant="neutral">{copy.bounded}</StatusBadge>} />
            <Ranking items={data.topOrigins} empty={copy.emptyOrigins} suffix={copy.flights} />
          </Panel>
          <Panel>
            <SectionHeader kicker="DESTINATION ICAO" title={copy.destinations} description={copy.destinationsDescription} actions={<StatusBadge variant="neutral">{copy.bounded}</StatusBadge>} />
            <Ranking items={data.topDestinations} empty={copy.emptyDestinations} suffix={copy.flights} />
          </Panel>
        </div>
      ) : null}

      <p className={styles.disclosure}>{copy.disclosure}</p>
    </main>
  );
}
