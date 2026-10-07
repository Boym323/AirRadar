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
import { operatorTrafficShare } from "./operator-explorer-metrics";
import styles from "./operator-explorer.module.css";

type ExplorerTab = "airlines" | "operators";
const RANGES: StatisticsTrafficRange[] = ["today", "7d", "30d"];

function rangeLabel(range: StatisticsTrafficRange, cs: boolean): string {
  if (range === "today") return cs ? "Dnes" : "Today";
  return range === "7d" ? (cs ? "7 dní" : "7 days") : (cs ? "30 dní" : "30 days");
}

function shareLabel(value: number | null): string {
  return value === null ? "—" : new Intl.NumberFormat(t.locale, { maximumFractionDigits: 1 }).format(value) + " %";
}

export function OperatorExplorer() {
  const cs = t.locale.startsWith("cs");
  const copy = cs ? {
    title: "Letecké společnosti & operátoři",
    subtitle: "Receiver-observed struktura uložených Flight instancí podle airline a aircraft operator metadata.",
    back: "Zpět na radar",
    statistics: "Statistiky",
    range: "Období",
    airlines: "Letecké společnosti",
    operators: "Operátoři",
    observedFlights: "Pozorované lety",
    topAirline: "Top airline",
    topOperator: "Top operátor",
    represented: "Hodnoty v bounded odpovědi",
    ranking: "Pořadí",
    airlineDescription: "Canonical airline hodnoty z persisted Flight statistik.",
    operatorDescription: "Canonical operator hodnoty z existující aircraft metadata vrstvy, vážené počtem Flight instancí.",
    flights: "pozorovaných letů",
    loading: "Načítám traffic statistics…",
    unavailable: "Traffic statistics jsou dočasně nedostupné.",
    empty: "Pro zvolené období není v tomto bounded rankingu žádná hodnota.",
    bounded: "BOUNDED TOP 8",
    disclosure: "Airline a aircraft operator jsou dvě odlišné kategorie a AirRadar je neslučuje ani mezi nimi nevytváří vlastní mapping. Ranking obsahuje nejvýše osm hodnot a není kompletním katalogem subjektů. Počty jsou receiver-observed Flight instance, nikoli oficiální airline statistika.",
  } : {
    title: "Airlines & Operators",
    subtitle: "Receiver-observed persisted Flight structure by airline and aircraft-operator metadata.",
    back: "Back to radar",
    statistics: "Statistics",
    range: "Range",
    airlines: "Airlines",
    operators: "Operators",
    observedFlights: "Observed flights",
    topAirline: "Top airline",
    topOperator: "Top operator",
    represented: "Values in bounded response",
    ranking: "Ranking",
    airlineDescription: "Canonical airline values from persisted Flight statistics.",
    operatorDescription: "Canonical operator values from the existing aircraft metadata layer, weighted by Flight instances.",
    flights: "observed flights",
    loading: "Loading traffic statistics…",
    unavailable: "Traffic statistics are temporarily unavailable.",
    empty: "No value is present in this bounded ranking for the selected period.",
    bounded: "BOUNDED TOP 8",
    disclosure: "Airline and aircraft operator are distinct categories; AirRadar neither merges them nor creates its own mapping between them. Rankings contain at most eight values and are not complete subject catalogs. Counts are receiver-observed Flight instances, not official airline statistics.",
  };

  const [range, setRange] = useState<StatisticsTrafficRange>("today");
  const [tab, setTab] = useState<ExplorerTab>("airlines");
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

  const items: StatisticsTrafficRankingItem[] = tab === "airlines"
    ? data?.topAirlines ?? []
    : data?.topOperators ?? [];
  const topAirline = data?.topAirlines[0] ?? null;
  const topOperator = data?.topOperators[0] ?? null;
  const unavailable = failed || data?.source === "unavailable";

  return (
    <main className={styles.page} data-testid="operator-explorer-v1">
      <PageHeader
        kicker="AIRRADAR · TRAFFIC ANALYTICS"
        title={copy.title}
        description={copy.subtitle}
        backLink={<Link className="back-link" href="/">{copy.back}</Link>}
        actions={<Link className="back-link" href="/statistics">{copy.statistics}</Link>}
      />

      <div className={styles.controls}>
        <SegmentedControl role="tablist" aria-label={copy.title}>
          <button type="button" role="tab" aria-selected={tab === "airlines"} className={tab === "airlines" ? "active" : ""} onClick={() => setTab("airlines")}>{copy.airlines}</button>
          <button type="button" role="tab" aria-selected={tab === "operators"} className={tab === "operators" ? "active" : ""} onClick={() => setTab("operators")}>{copy.operators}</button>
        </SegmentedControl>
        <SegmentedControl role="tablist" aria-label={copy.range}>
          {RANGES.map((item) => <button key={item} type="button" role="tab" aria-selected={range === item} className={range === item ? "active" : ""} onClick={() => setRange(item)}>{rangeLabel(item, cs)}</button>)}
        </SegmentedControl>
      </div>

      <MetricStrip className={styles.metrics}>
        <MetricCard value={data?.observedFlights === null || !data ? "—" : formatNumber(data.observedFlights)} label={copy.observedFlights} />
        <MetricCard value={topAirline?.name ?? "—"} label={copy.topAirline} detail={topAirline ? shareLabel(operatorTrafficShare(topAirline.count, data?.observedFlights ?? null)) : undefined} />
        <MetricCard value={topOperator?.name ?? "—"} label={copy.topOperator} detail={topOperator ? shareLabel(operatorTrafficShare(topOperator.count, data?.observedFlights ?? null)) : undefined} />
        <MetricCard value={data ? formatNumber(items.length) : "—"} label={copy.represented} detail={copy.bounded} />
      </MetricStrip>

      <Panel>
        <SectionHeader
          kicker={tab === "airlines" ? "AIRLINES" : "OPERATORS"}
          title={tab === "airlines" ? copy.airlines + " · " + copy.ranking : copy.operators + " · " + copy.ranking}
          description={tab === "airlines" ? copy.airlineDescription : copy.operatorDescription}
          actions={<StatusBadge variant={unavailable ? "warning" : data ? "success" : "neutral"}>{unavailable ? "UNAVAILABLE" : data ? copy.bounded : "LOADING"}</StatusBadge>}
        />

        {!data && !failed ? <p className={styles.status}>{copy.loading}</p> : unavailable ? (
          <EmptyState title={copy.unavailable} />
        ) : items.length ? (
          <ol className={styles.ranking}>
            {items.map((item, index) => (
              <li key={item.name}>
                <span className={styles.rank}>{index + 1}</span>
                <strong title={item.name}>{item.name}</strong>
                <span>{formatNumber(item.count)} {copy.flights}</span>
                <b>{shareLabel(operatorTrafficShare(item.count, data?.observedFlights ?? null))}</b>
              </li>
            ))}
          </ol>
        ) : <EmptyState title={copy.empty} />}
      </Panel>

      <p className={styles.disclosure}>{copy.disclosure}</p>
    </main>
  );
}
