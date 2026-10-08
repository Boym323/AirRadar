"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatNumber, t } from "@/lib/i18n";
import type {
  IntelligenceAnalyticsRange,
  IntelligenceAnalyticsResponse,
} from "@/lib/intelligence-analytics";
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
import styles from "./flight-intelligence-analytics.module.css";

const RANGES: IntelligenceAnalyticsRange[] = ["today", "7d", "30d"];

function rangeLabel(range: IntelligenceAnalyticsRange, cs: boolean): string {
  if (range === "today") return cs ? "Dnes" : "Today";
  if (range === "7d") return cs ? "7 dní" : "7 days";
  return cs ? "30 dní" : "30 days";
}

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function FlightIntelligenceAnalytics() {
  const cs = t.locale.startsWith("cs");
  const copy = cs ? {
    title: "Analýza událostí letů",
    subtitle: "Souhrn uložených událostí z analýzy letů za 7 nebo 30 dní bez načítání celé historie do prohlížeče.",
    back: "Zpět na analýzu letů",
    range: "Období",
    events: "Události",
    types: "Typy událostí",
    aircraft: "Letadla mezi 10 nejčastějšími",
    busiestHour: "Nejaktivnější hodina",
    mix: "Složení událostí",
    mixDescription: "Počty uložených detekčních událostí podle typu v zadaném období.",
    rhythm: "Hodinový profil",
    rhythmDescription: "Místní hodina výskytu událostí podle časové zóny aplikace. Nejde o počet letů.",
    topAircraft: "Nejčastější letadla",
    topAircraftDescription: "Identifikátory ICAO s nejvyšším počtem uložených událostí analýzy letů.",
    locations: "Nejčastější lokality",
    locationsDescription: "Kontext letiště nebo sektoru uložený přímo u události analýzy letu.",
    airports: "Letiště",
    sectors: "Sektory",
    loading: "Načítám analýzu událostí…",
    unavailable: "Analýza událostí letů je dočasně nedostupná.",
    empty: "Pro toto období nejsou dostupné žádné uložené události analýzy letů.",
    source: "DATABÁZE · OMEZENÝ VÝPIS",
    disclosure: "Počty představují uložené detekované události, nikoli unikátní lety ani potvrzené události ATC. Kandidátní a diagnostické záznamy mohou tvořit samostatné události. Přehled obsahuje nejvýše deset položek z období maximálně 30 místních dní.",
  } : {
    title: "Flight Intelligence Analytics",
    subtitle: "Bounded aggregation of persisted Flight Intelligence events without sending raw 7/30-day history to the browser.",
    back: "Back to Intelligence",
    range: "Range",
    events: "Events",
    types: "Event types",
    aircraft: "Aircraft in top 10",
    busiestHour: "Busiest hour",
    mix: "Event mix",
    mixDescription: "Counts of persisted detection events by type in the selected period.",
    rhythm: "Hourly profile",
    rhythmDescription: "Local hour of event occurrence in the application timezone. This is not a flight count.",
    topAircraft: "Top aircraft",
    topAircraftDescription: "ICAO hex with the highest number of persisted intelligence events.",
    locations: "Top locations",
    locationsDescription: "Published airport/sector context stored directly on intelligence events.",
    airports: "Airports",
    sectors: "Sectors",
    loading: "Loading intelligence analytics…",
    unavailable: "Flight Intelligence analytics are temporarily unavailable.",
    empty: "No persisted intelligence events are available for this period.",
    source: "POSTGRES · BOUNDED",
    disclosure: "Counts represent persisted detection events, not unique flights or authoritative ATC events. Candidate/diagnostic types may exist as separate events. Rankings are top 10 and the endpoint is date-bounded to at most 30 local days.",
  };

  const [range, setRange] = useState<IntelligenceAnalyticsRange>("7d");
  const [data, setData] = useState<IntelligenceAnalyticsResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setFailed(false);
    void fetch(`/api/intelligence/analytics?range=${range}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("intelligence analytics unavailable");
        return response.json() as Promise<IntelligenceAnalyticsResponse>;
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

  const peakHour = data?.hourly.reduce(
    (best, item) => !best || item.count > best.count ? item : best,
    null as { hour: number; count: number } | null,
  ) ?? null;
  const maxHourCount = Math.max(...(data?.hourly.map((item) => item.count) ?? [0]), 1);
  const unavailable = failed || data?.source === "unavailable";

  return (
    <main className={styles.page} data-testid="flight-intelligence-analytics-v1">
      <PageHeader
        kicker={t.uiExtras.analyticsHeading}
        title={copy.title}
        description={copy.subtitle}
        backLink={<Link className="back-link" href="/intelligence">{copy.back}</Link>}
        actions={<StatusBadge variant={unavailable ? "warning" : data ? "success" : "neutral"}>{unavailable ? t.uiExtras.unavailable : data ? copy.source : t.uiExtras.loading}</StatusBadge>}
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
        <MetricCard value={data?.totalEvents === null || !data ? "—" : formatNumber(data.totalEvents)} label={copy.events} />
        <MetricCard value={data ? formatNumber(data.byType.length) : "—"} label={copy.types} />
        <MetricCard value={data ? formatNumber(data.topAircraft.length) : "—"} label={copy.aircraft} />
        <MetricCard value={peakHour && peakHour.count > 0 ? hourLabel(peakHour.hour) : "—"} label={copy.busiestHour} detail={peakHour && peakHour.count > 0 ? `${formatNumber(peakHour.count)} ${t.uiExtras.events}` : undefined} />
      </MetricStrip>

      {!data && !failed ? <p className={styles.status}>{copy.loading}</p> : unavailable ? <EmptyState title={copy.unavailable} /> : data && data.totalEvents ? (
        <div className={styles.grid}>
          <Panel>
            <SectionHeader kicker={t.uiExtras.eventTypes} title={copy.mix} description={copy.mixDescription} />
            <div className={styles.ranking}>
              {data.byType.map((item, index) => (
                <div key={item.type}><span>{index + 1}</span><strong>{item.type}</strong><b>{formatNumber(item.count)}</b></div>
              ))}
            </div>
          </Panel>

          <Panel>
            <SectionHeader kicker={t.uiExtras.localHour} title={copy.rhythm} description={copy.rhythmDescription} />
            <div className={styles.hours}>
              {data.hourly.map((item) => (
                <div key={item.hour} title={`${hourLabel(item.hour)} · ${item.count}`}>
                  <span style={{ height: `${Math.max(3, item.count / maxHourCount * 100)}%` }} />
                  <small>{item.hour % 3 === 0 ? String(item.hour).padStart(2, "0") : ""}</small>
                </div>
              ))}
            </div>
          </Panel>

          <Panel>
            <SectionHeader kicker="TOP 10" title={copy.topAircraft} description={copy.topAircraftDescription} />
            {data.topAircraft.length ? <div className={styles.ranking}>
              {data.topAircraft.map((item, index) => (
                <div key={item.name}>
                  <span>{index + 1}</span>
                  <Link href={{ pathname: `/aircraft/${item.name.toLowerCase()}` }}>{item.name}</Link>
                  <b>{formatNumber(item.count)}</b>
                </div>
              ))}
            </div> : <EmptyState title={copy.empty} />}
          </Panel>

          <Panel>
            <SectionHeader kicker={t.uiExtras.eventContext} title={copy.locations} description={copy.locationsDescription} />
            <div className={styles.locationColumns}>
              <div>
                <h3>{copy.airports}</h3>
                {data.topAirports.length ? data.topAirports.map((item) => (
                  <Link key={item.name} href={{ pathname: `/airports/${item.name}` }}><span>{item.name}</span><b>{formatNumber(item.count)}</b></Link>
                )) : <small>—</small>}
              </div>
              <div>
                <h3>{copy.sectors}</h3>
                {data.topSectors.length ? data.topSectors.map((item) => (
                  <Link key={item.name} href={{ pathname: `/airspace/sectors/${item.name}` }}><span>{item.name}</span><b>{formatNumber(item.count)}</b></Link>
                )) : <small>—</small>}
              </div>
            </div>
          </Panel>
        </div>
      ) : data ? <EmptyState title={copy.empty} /> : null}

      <p className={styles.disclosure}>{copy.disclosure}</p>
    </main>
  );
}
