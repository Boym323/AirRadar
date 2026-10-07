"use client";

import { useEffect, useMemo, useState } from "react";
import type { Airport } from "@/lib/airports/types";
import { t } from "@/lib/i18n";
import {
  EmptyState,
  MetricCard,
  MetricStrip,
  Panel,
  SectionHeader,
  SegmentedControl,
  StatusBadge,
} from "@/components/ui-primitives";
import styles from "./airport-movement-analytics.module.css";

type Period = "today" | "24h" | "7d";
type MovementKind = "APPROACH" | "LANDING" | "TAKEOFF" | "DEPARTURE" | "GO_AROUND" | "HOLDING" | "OVERFLIGHT";

interface Movement {
  movement: MovementKind;
  observedAt: string;
  runway: { designator: string } | null;
}

interface MovementsResponse {
  airport: { icao: string; name: string };
  period: Period;
  generatedAt: string;
  complete: boolean;
  truncated: boolean;
  movements: Movement[];
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

interface HourBucket {
  hour: number;
  arrivals: number;
  departures: number;
  other: number;
  total: number;
}

const PERIODS: Period[] = ["today", "24h", "7d"];

function movementSide(kind: MovementKind): "arrival" | "departure" | "other" {
  if (kind === "APPROACH" || kind === "LANDING") return "arrival";
  if (kind === "TAKEOFF" || kind === "DEPARTURE") return "departure";
  return "other";
}

function hourlyBuckets(movements: Movement[]): HourBucket[] {
  const buckets: HourBucket[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    arrivals: 0,
    departures: 0,
    other: 0,
    total: 0,
  }));
  for (const movement of movements) {
    if (movement.movement === "OVERFLIGHT") continue;
    const date = new Date(movement.observedAt);
    if (!Number.isFinite(date.getTime())) continue;
    const bucket = buckets[date.getUTCHours()];
    if (!bucket) continue;
    const side = movementSide(movement.movement);
    if (side === "arrival") bucket.arrivals += 1;
    else if (side === "departure") bucket.departures += 1;
    else bucket.other += 1;
    bucket.total += 1;
  }
  return buckets;
}

function runwayShare(count: number, total: number): number {
  return total > 0 ? count / total : 0;
}

export function AirportMovementAnalytics({ airport }: { airport: Airport }) {
  const cs = t.locale.startsWith("cs");
  const copy = cs ? {
    title: "Movement Analytics",
    subtitle: "Historická analytika receiver-inferred pohybů nad existujícím bounded airport movement API.",
    arrivals: "Přílety",
    departures: "Odlety",
    total: "Celkem",
    peak: "Peak UTC hour",
    goArounds: "Go-around",
    holding: "Holding",
    runwayUsage: "Runway usage",
    trafficTrend: "Provoz podle UTC hodiny",
    noRunway: "Pro toto období nejsou k dispozici runway-inferred pohyby.",
    noData: "Pro toto období nejsou k dispozici movement data.",
    loading: "Načítám movement analytics…",
    failed: "Movement analytics nejsou dočasně dostupné.",
    incomplete: "Vzorek je neúplný nebo oříznutý bounded limity backendu.",
    inferred: "Pohyby a runway assignment jsou odvozené z pozorování přijímače; nejde o autoritativní FIDS/ATC data.",
    classified: "klasifikováno",
    unknown: "bez určené dráhy",
  } : {
    title: "Movement Analytics",
    subtitle: "Historical analytics over the existing bounded receiver-inferred airport movement API.",
    arrivals: "Arrivals",
    departures: "Departures",
    total: "Total",
    peak: "Peak UTC hour",
    goArounds: "Go-arounds",
    holding: "Holding",
    runwayUsage: "Runway usage",
    trafficTrend: "Traffic by UTC hour",
    noRunway: "No runway-inferred movements are available for this period.",
    noData: "No movement data is available for this period.",
    loading: "Loading movement analytics…",
    failed: "Movement analytics is temporarily unavailable.",
    incomplete: "The sample is incomplete or truncated by bounded backend limits.",
    inferred: "Movements and runway assignments are inferred from receiver observations; they are not authoritative FIDS/ATC data.",
    classified: "classified",
    unknown: "unknown runway",
  };

  const [period, setPeriod] = useState<Period>("24h");
  const [data, setData] = useState<MovementsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    void fetch(
      "/api/airports/" + encodeURIComponent(airport.icaoCode) + "/movements?period=" + period,
      { cache: "no-store", signal: controller.signal },
    ).then(async (response) => {
      if (!response.ok) throw new Error("airport movements unavailable");
      return await response.json() as MovementsResponse;
    }).then((response) => {
      if (controller.signal.aborted) return;
      setData(response);
      setLoading(false);
    }).catch(() => {
      if (controller.signal.aborted) return;
      setFailed(true);
      setLoading(false);
    });
    return () => controller.abort();
  }, [airport.icaoCode, period]);

  const buckets = useMemo(() => hourlyBuckets(data?.movements ?? []), [data]);
  const maximum = Math.max(...buckets.map((bucket) => bucket.total), 1);
  const peak = buckets.reduce<HourBucket | null>((best, bucket) => {
    if (bucket.total === 0) return best;
    if (!best || bucket.total > best.total || (bucket.total === best.total && bucket.hour < best.hour)) return bucket;
    return best;
  }, null);

  const arrivals = data ? data.summary.approaches + data.summary.landings : 0;
  const departures = data ? data.summary.takeoffs + data.summary.departures : 0;
  const total = arrivals + departures;
  const runwayTotal = data?.summary.runwayRelevantMovements ?? 0;

  return (
    <Panel className={styles.panel} aria-labelledby="airport-movement-analytics-title">
      <SectionHeader
        title={copy.title}
        description={copy.subtitle}
        actions={
          <SegmentedControl role="tablist" aria-label={copy.title}>
            {PERIODS.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={period === item}
                className={period === item ? "active" : ""}
                onClick={() => setPeriod(item)}
              >
                {item}
              </button>
            ))}
          </SegmentedControl>
        }
      />

      {failed ? <div className={styles.notice} role="alert">{copy.failed}</div> : null}
      {loading && !data ? <div className={styles.notice}>{copy.loading}</div> : null}
      {data && (data.truncated || !data.complete) ? <div className={styles.notice}>{copy.incomplete}</div> : null}

      {data ? (
        <>
          <MetricStrip className={styles.metrics}>
            <MetricCard value={arrivals} label={copy.arrivals} />
            <MetricCard value={departures} label={copy.departures} />
            <MetricCard value={total} label={copy.total} />
            <MetricCard
              value={peak ? String(peak.hour).padStart(2, "0") + ":00" : "—"}
              label={copy.peak}
              detail={peak ? String(peak.total) + " movements" : undefined}
            />
            <MetricCard value={data.summary.goArounds} label={copy.goArounds} />
            <MetricCard value={data.summary.holding} label={copy.holding} />
          </MetricStrip>

          <div className={styles.grid}>
            <section className={styles.card} aria-labelledby="movement-traffic-trend-title">
              <div className={styles.cardHeader}>
                <h3 id="movement-traffic-trend-title">{copy.trafficTrend}</h3>
                <StatusBadge variant="neutral">UTC</StatusBadge>
              </div>
              {total === 0 && data.summary.goArounds === 0 && data.summary.holding === 0 ? (
                <EmptyState title={copy.noData} />
              ) : (
                <div className={styles.chart} role="img" aria-label={copy.trafficTrend}>
                  {buckets.map((bucket) => (
                    <div className={styles.bucket} key={bucket.hour}>
                      <div className={styles.barWrap}>
                        <span
                          className={styles.bar}
                          style={{ height: Math.max(bucket.total > 0 ? 6 : 1, (bucket.total / maximum) * 100) + "%" }}
                          title={String(bucket.hour).padStart(2, "0") + ":00 UTC · " + String(bucket.total)}
                        />
                      </div>
                      {bucket.hour % 3 === 0 ? <span>{String(bucket.hour).padStart(2, "0")}</span> : <span aria-hidden="true">·</span>}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className={styles.card} aria-labelledby="movement-runway-usage-title">
              <div className={styles.cardHeader}>
                <h3 id="movement-runway-usage-title">{copy.runwayUsage}</h3>
                <span className={styles.small}>
                  {data.summary.probableRunwayMovements} {copy.classified} · {data.summary.unknownRunwayMovements} {copy.unknown}
                </span>
              </div>
              {data.summary.probableRunways.length === 0 ? (
                <EmptyState title={copy.noRunway} />
              ) : (
                <div className={styles.runways}>
                  {data.summary.probableRunways.slice(0, 8).map((runway) => {
                    const share = runwayShare(runway.count, runwayTotal);
                    return (
                      <div className={styles.runwayRow} key={runway.designator}>
                        <div>
                          <strong>RWY {runway.designator}</strong>
                          <span>{runway.count} · {Math.round(share * 100)}%</span>
                        </div>
                        <span className={styles.track}>
                          <span style={{ width: Math.max(4, share * 100) + "%" }} />
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </>
      ) : null}

      <p className={styles.disclaimer}>{copy.inferred}</p>
    </Panel>
  );
}
