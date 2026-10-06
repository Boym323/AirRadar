"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatNumber, t } from "@/lib/i18n";
import type {
  StatisticsTrafficRange,
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
import { aircraftTypeShare } from "./aircraft-type-explorer-metrics";
import styles from "./aircraft-type-explorer.module.css";

const RANGES: StatisticsTrafficRange[] = ["today", "7d", "30d"];

function rangeLabel(range: StatisticsTrafficRange, cs: boolean): string {
  if (range === "today") return cs ? "Dnes" : "Today";
  return range === "7d" ? (cs ? "7 dní" : "7 days") : (cs ? "30 dní" : "30 days");
}

function percent(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat(t.locale, { maximumFractionDigits: 1 }).format(value) + " %";
}

export function AircraftTypeExplorer() {
  const cs = t.locale.startsWith("cs");
  const copy = cs ? {
    title: "Typy letadel",
    subtitle: "Receiver-observed struktura provozu podle uložených Flight instancí.",
    back: "Zpět na radar",
    statistics: "Statistiky",
    range: "Období",
    observedFlights: "Pozorované lety",
    represented: "Typy v bounded odpovědi",
    topType: "Nejčastější typ",
    topShare: "Podíl top typu",
    ranking: "Pořadí typů",
    rankingDescription: "Nejvýše osm typů vrácených existujícím traffic statistics API.",
    flights: "letů",
    liveDetail: "Vybraný typ",
    clear: "Zrušit výběr",
    loading: "Načítám typy letadel…",
    unavailable: "Traffic statistics jsou dočasně nedostupné.",
    empty: "Pro zvolené období nejsou v bounded rankingu žádné typy letadel.",
    bounded: "BOUNDED TOP 8",
    disclosure: "Počty znamenají persisted receiver-observed Flight instance, nikoli unikátní airframy. Ranking je bounded top list a nemusí obsahovat všechny typy. Podíl se zobrazuje pouze při dostupném celkovém observedFlights.",
  } : {
    title: "Aircraft Types",
    subtitle: "Receiver-observed traffic structure across persisted Flight instances.",
    back: "Back to radar",
    statistics: "Statistics",
    range: "Range",
    observedFlights: "Observed flights",
    represented: "Types in bounded response",
    topType: "Top aircraft type",
    topShare: "Top type share",
    ranking: "Aircraft type ranking",
    rankingDescription: "At most eight types returned by the existing traffic statistics API.",
    flights: "flights",
    liveDetail: "Selected type",
    clear: "Clear selection",
    loading: "Loading aircraft types…",
    unavailable: "Traffic statistics are temporarily unavailable.",
    empty: "No aircraft types are present in the bounded ranking for this period.",
    bounded: "BOUNDED TOP 8",
    disclosure: "Counts are persisted receiver-observed Flight instances, not unique airframes. The ranking is a bounded top list and may not contain every type. Share is shown only when total observedFlights is available.",
  };

  const [range, setRange] = useState<StatisticsTrafficRange>("today");
  const [data, setData] = useState<StatisticsTrafficResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("type");
    setSelectedType(raw?.trim().toUpperCase() || null);
  }, []);

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

  const top = data?.topAircraftTypes[0] ?? null;
  const selected = useMemo(
    () => data?.topAircraftTypes.find((item) => item.name.toUpperCase() === selectedType) ?? null,
    [data, selectedType],
  );
  const unavailable = failed || data?.source === "unavailable";

  return (
    <main className={styles.page} data-testid="aircraft-type-explorer-v1">
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
          {RANGES.map((item) => (
            <button key={item} type="button" role="tab" aria-selected={range === item} className={range === item ? "active" : ""} onClick={() => setRange(item)}>
              {rangeLabel(item, cs)}
            </button>
          ))}
        </SegmentedControl>
      </div>

      <MetricStrip className={styles.metrics}>
        <MetricCard value={data?.observedFlights === null || !data ? "—" : formatNumber(data.observedFlights)} label={copy.observedFlights} />
        <MetricCard value={data ? formatNumber(data.topAircraftTypes.length) : "—"} label={copy.represented} detail={copy.bounded} />
        <MetricCard value={top?.name ?? "—"} label={copy.topType} />
        <MetricCard value={top ? percent(aircraftTypeShare(top.count, data?.observedFlights ?? null)) : "—"} label={copy.topShare} />
      </MetricStrip>

      <Panel>
        <SectionHeader
          kicker="AIRCRAFT TYPES"
          title={copy.ranking}
          description={copy.rankingDescription}
          actions={<StatusBadge variant={unavailable ? "warning" : data ? "success" : "neutral"}>{unavailable ? "UNAVAILABLE" : data ? copy.bounded : "LOADING"}</StatusBadge>}
        />

        {!data && !failed ? <p className={styles.status}>{copy.loading}</p> : unavailable ? (
          <EmptyState title={copy.unavailable} />
        ) : data && data.topAircraftTypes.length ? (
          <ol className={styles.ranking}>
            {data.topAircraftTypes.map((item, index) => {
              const share = aircraftTypeShare(item.count, data.observedFlights);
              return (
                <li key={item.name} className={selectedType === item.name.toUpperCase() ? styles.selected : undefined}>
                  <span className={styles.rank}>{index + 1}</span>
                  <Link href={`/aircraft-types?type=${encodeURIComponent(item.name)}`} onClick={() => setSelectedType(item.name.toUpperCase())}>{item.name}</Link>
                  <span>{formatNumber(item.count)} {copy.flights}</span>
                  <strong>{percent(share)}</strong>
                </li>
              );
            })}
          </ol>
        ) : <EmptyState title={copy.empty} />}

        {selected ? (
          <div className={styles.selectedDetail}>
            <span>{copy.liveDetail}</span>
            <strong>{selected.name}</strong>
            <small>{formatNumber(selected.count)} {copy.flights} · {percent(aircraftTypeShare(selected.count, data?.observedFlights ?? null))}</small>
            <Link href="/aircraft-types" onClick={() => setSelectedType(null)}>{copy.clear}</Link>
          </div>
        ) : null}
      </Panel>

      <p className={styles.disclosure}>{copy.disclosure}</p>
    </main>
  );
}
