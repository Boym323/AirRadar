"use client";

import { useEffect, useState } from "react";
import { formatNumber } from "@/lib/i18n";
import { statisticsTrafficText as text } from "@/lib/i18n/statistics-traffic";
import {
  statisticsTrafficCsv,
  type StatisticsTrafficRankingItem,
  type StatisticsTrafficRange,
  type StatisticsTrafficResponse,
  type StatisticsTrafficRouteItem,
} from "@/lib/statistics-traffic";
import styles from "./statistics-traffic-intelligence.module.css";

function rangeLabel(range: StatisticsTrafficRange): string {
  return range === "today" ? text.today : range === "7d" ? text.sevenDays : text.thirtyDays;
}

function Ranking({ title, items }: { title: string; items: StatisticsTrafficRankingItem[] }) {
  return (
    <section className={styles.ranking}>
      <h3>{title}</h3>
      {items.length > 0 ? (
        <ol>
          {items.map((item) => (
            <li key={item.name}>
              <span title={item.name}>{item.name}</span>
              <strong>{formatNumber(item.count)}</strong>
            </li>
          ))}
        </ol>
      ) : <p className={styles.empty}>{text.noData}</p>}
    </section>
  );
}

function Routes({ items }: { items: StatisticsTrafficRouteItem[] }) {
  return (
    <section className={styles.ranking}>
      <h3>{text.routes}</h3>
      {items.length > 0 ? (
        <ol>
          {items.map((item) => {
            const route = `${item.origin} → ${item.destination}`;
            return (
              <li key={`${item.origin}:${item.destination}`}>
                <span title={route}>{route}</span>
                <strong>{formatNumber(item.count)}</strong>
              </li>
            );
          })}
        </ol>
      ) : <p className={styles.empty}>{text.noData}</p>}
    </section>
  );
}

export default function StatisticsTrafficIntelligence() {
  const [range, setRange] = useState<StatisticsTrafficRange>("today");
  const [data, setData] = useState<StatisticsTrafficResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    void fetch(`/api/statistics/traffic?range=${range}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("statistics traffic request failed");
        return await response.json() as StatisticsTrafficResponse;
      })
      .then((next) => {
        if (!controller.signal.aborted) setData(next);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setFailed(true);
        if (error instanceof Error && error.name === "AbortError") return;
      });
    return () => controller.abort();
  }, [range]);

  function exportCsv(): void {
    if (!data || data.source !== "postgres") return;
    const blob = new Blob([statisticsTrafficCsv(data)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `airradar-traffic-${data.range}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const unavailable = failed || data?.source === "unavailable";
  return (
    <div className={styles.wrapper}>
      <section className={`statistics-card ${styles.panel}`} aria-labelledby="statistics-traffic-title">
        <div className={`statistics-card-header ${styles.header}`}>
          <div className={styles.headerCopy}>
            <h2 id="statistics-traffic-title">{text.title}</h2>
            <p>{text.description}</p>
          </div>
          <div className={styles.controls}>
            <div className="statistics-range-tabs" role="tablist" aria-label={text.rangeSelector}>
              {(["today", "7d", "30d"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={range === item}
                  className={range === item ? "active" : ""}
                  onClick={() => setRange(item)}
                >
                  {rangeLabel(item)}
                </button>
              ))}
            </div>
            <button type="button" className="primary-button statistics-export-button" onClick={exportCsv} disabled={!data || data.source !== "postgres"}>
              {text.exportCsv}
            </button>
          </div>
        </div>

        {!data && !failed ? <p className={styles.status}>{text.loading}</p> : unavailable ? (
          <p className={styles.status}>{text.unavailable}</p>
        ) : data ? <>
          <div className={styles.summary}>
            <div className={styles.metric}>
              <strong>{formatNumber(data.observedFlights)}</strong>
              <span>{text.observedFlights}</span>
            </div>
            <p className={styles.note}>{text.metricNote}</p>
          </div>
          <div className={styles.rankings}>
            <Ranking title={text.aircraftTypes} items={data.topAircraftTypes} />
            <Ranking title={text.airlines} items={data.topAirlines} />
            <Routes items={data.topRoutes} />
            <Ranking title={text.origins} items={data.topOrigins} />
            <Ranking title={text.destinations} items={data.topDestinations} />
            <Ranking title={text.registrationCountries} items={data.registrationCountries} />
          </div>
        </> : null}
      </section>
    </div>
  );
}
