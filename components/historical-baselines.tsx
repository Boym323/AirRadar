"use client";

import { useEffect, useState } from "react";
import { EmptyState, MetricCard, MetricStrip, PageHeader, Panel, SectionHeader, StatusBadge } from "@/components/ui-primitives";
import { TrustStamp } from "@/components/trust-stamp";
import { formatDistance, formatNumber, t } from "@/lib/i18n";
import { buildHistoricalBaseline, type BaselineMetric, type BaselineState, type HistoricalBaselineSummary } from "@/lib/historical-baselines";
import styles from "./historical-baselines.module.css";

interface Statistics30d {
  date: string;
  daily: { uniqueAircraft: number; maxConcurrentAircraft: number; maxDistanceKm: number };
  period: { range: "30d"; hasData: boolean; trend: Array<{ date: string; uniqueAircraft: number | null; maxConcurrentAircraft: number | null; maxDistanceKm: number | null }> };
}

function badge(state: BaselineState): "neutral" | "success" | "warning" {
  return state === "NEAR" ? "success" : state === "INSUFFICIENT" ? "neutral" : "warning";
}

export function HistoricalBaselines() {
  const cs = t.locale.startsWith("cs");
  const copy = cs ? {
    title: "Historické referenční hodnoty",
    kicker: "AIRRADAR / REFERENČNÍ HODNOTY",
    medianKicker: "MEDIÁN ZA 30 DNÍ",
    subtitle: "Průběžné dnešní hodnoty proti mediánu dokončených dnů z vlastních 30denních agregátů AirRadaru.",
    comparison: "Dnes vs 30 dní",
    description: "Deskriptivní srovnání, ne test statistické významnosti. Dnešek je průběžný, historické dny jsou dokončené.",
    unique: "Unikátní letadla",
    concurrent: "Max. současně",
    distance: "Max. dosah",
    current: "Dnes zatím",
    median: "Medián",
    days: "referenčních dnů",
    above: "NAD REFERENČNÍ HODNOTOU",
    near: "BLÍZKO REFERENČNÍ HODNOTY",
    below: "POD REFERENČNÍ HODNOTOU",
    insufficient: "MÁLO DAT",
    unavailable: "Referenční statistiky za posledních 30 dní nejsou dostupné.",
  } : {
    title: "Historical Baselines",
    kicker: "AIRRADAR / BASELINES",
    medianKicker: "30D MEDIAN",
    subtitle: "Today's in-progress values against the median of completed days from AirRadar's own 30-day aggregates.",
    comparison: "Today vs 30 days",
    description: "Descriptive comparison, not a statistical significance test. Today is partial; historical days are complete.",
    unique: "Unique aircraft",
    concurrent: "Max concurrent",
    distance: "Max range",
    current: "Today so far",
    median: "Median",
    days: "baseline days",
    above: "ABOVE BASELINE",
    near: "NEAR BASELINE",
    below: "BELOW BASELINE",
    insufficient: "INSUFFICIENT",
    unavailable: "The 30-day statistical baseline is unavailable.",
  };
  const [summary, setSummary] = useState<HistoricalBaselineSummary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/statistics?range=30d", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("statistics unavailable");
        return response.json() as Promise<Statistics30d>;
      })
      .then((value) => {
        if (controller.signal.aborted || !value.period?.hasData) return;
        setSummary(buildHistoricalBaseline({
          currentDate: value.date,
          current: value.daily,
          trend: value.period.trend,
        }));
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setFailed(true);
      });
    return () => controller.abort();
  }, []);

  const label = (state: BaselineState) => state === "ABOVE" ? copy.above : state === "BELOW" ? copy.below : state === "NEAR" ? copy.near : copy.insufficient;
  const card = (title: string, value: BaselineMetric, formatter: (n: number) => string) => <article className={styles.card}>
    <div className={styles.cardHead}><strong>{title}</strong><StatusBadge variant={badge(value.state)}>{label(value.state)}</StatusBadge></div>
    <dl>
      <div><dt>{copy.current}</dt><dd>{value.current === null ? "—" : formatter(value.current)}</dd></div>
      <div><dt>{copy.median}</dt><dd>{value.baselineMedian === null ? "—" : formatter(value.baselineMedian)}</dd></div>
      <div><dt>Δ</dt><dd>{value.deltaPercent === null ? "—" : (value.deltaPercent > 0 ? "+" : "") + formatNumber(value.deltaPercent, 0) + "%"}</dd></div>
    </dl>
    <small>{formatNumber(value.sampleDays)} {copy.days}</small>
  </article>;

  return <main className={styles.page} data-testid="historical-baselines-v1">
    <PageHeader kicker={copy.kicker} title={copy.title} description={copy.subtitle} />
    {failed ? <EmptyState title={copy.unavailable} /> : summary ? <>
      <MetricStrip>
        <MetricCard value={summary.uniqueAircraft.deltaPercent === null ? "—" : (summary.uniqueAircraft.deltaPercent > 0 ? "+" : "") + formatNumber(summary.uniqueAircraft.deltaPercent, 0) + "%"} label={copy.unique} />
        <MetricCard value={summary.maxConcurrentAircraft.deltaPercent === null ? "—" : (summary.maxConcurrentAircraft.deltaPercent > 0 ? "+" : "") + formatNumber(summary.maxConcurrentAircraft.deltaPercent, 0) + "%"} label={copy.concurrent} />
        <MetricCard value={summary.maxDistanceKm.deltaPercent === null ? "—" : (summary.maxDistanceKm.deltaPercent > 0 ? "+" : "") + formatNumber(summary.maxDistanceKm.deltaPercent, 0) + "%"} label={copy.distance} />
      </MetricStrip>
      <Panel>
        <SectionHeader kicker={copy.medianKicker} title={copy.comparison} description={copy.description} actions={<TrustStamp provenance={{ kind: "INFERRED", source: "ReceiverDailyStats · 30d" }} />} />
        <div className={styles.grid}>
          {card(copy.unique, summary.uniqueAircraft, (n) => formatNumber(n, 0))}
          {card(copy.concurrent, summary.maxConcurrentAircraft, (n) => formatNumber(n, 0))}
          {card(copy.distance, summary.maxDistanceKm, (n) => formatDistance(n))}
        </div>
      </Panel>
    </> : <p className={styles.loading}>{t.common.loading}</p>}
  </main>;
}
