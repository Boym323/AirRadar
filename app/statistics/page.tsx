"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type {
  ReceiverStatisticsRangeResponse,
  ReceiverStatisticsResponse,
  ReceiverStatisticsTrendPoint,
} from "@/lib/aircraft/types";
import { coverageChartPoints, coveragePolygonPath, coverageRingRadius } from "@/lib/statistics-coverage";
import { formatDistance, formatNumber, t } from "@/lib/i18n";

type StatisticsPageData = ReceiverStatisticsResponse | ReceiverStatisticsRangeResponse;
type SelectedRange = "today" | "7d" | "30d";
type TrendMetric = "uniqueAircraft" | "maxConcurrentAircraft" | "maxDistanceKm";

function isRangeResponse(data: StatisticsPageData): data is ReceiverStatisticsRangeResponse {
  return "period" in data;
}

function formatChartDate(date: string): string {
  return new Intl.DateTimeFormat(t.locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

function formatTrendValue(value: number | null, metric: TrendMetric): string {
  return metric === "maxDistanceKm" ? formatDistance(value) : formatNumber(value);
}

function CoverageChart({ buckets }: { buckets: ReceiverStatisticsResponse["coverage"] }) {
  const [selectedBucket, setSelectedBucket] = useState<number | null>(null);
  const maxDistanceKm = Math.max(...buckets.map((bucket) => bucket.maxDistanceKm), 0);
  const points = useMemo(() => coverageChartPoints(buckets), [buckets]);
  const path = coveragePolygonPath(points);
  const selected = selectedBucket === null ? null : buckets[selectedBucket] ?? null;
  const rings = [0.25, 0.5, 0.75, 1];

  return (
    <div className="coverage-visual">
      <svg className="coverage-chart" viewBox="0 0 300 300" role="img" aria-label={t.statistics.coverageChart}>
        <g className="coverage-grid" aria-hidden="true">
          {rings.map((ratio) => <circle key={ratio} cx="150" cy="150" r={coverageRingRadius(ratio)} />)}
          <line x1="150" y1="25" x2="150" y2="275" />
          <line x1="25" y1="150" x2="275" y2="150" />
        </g>
        {path && <path className="coverage-polygon" d={path} />}
        {points.map((point, index) => point.bucket.maxDistanceKm > 0 ? (
          <circle
            key={`${point.bucket.bearingFrom}-${point.bucket.bearingTo}`}
            className={`coverage-point ${selectedBucket === index ? "selected" : ""}`}
            cx={point.x}
            cy={point.y}
            r="7"
            tabIndex={0}
            role="button"
            aria-label={t.statistics.azimuth(point.bucket.bearingFrom, point.bucket.bearingTo)}
            onMouseEnter={() => setSelectedBucket(index)}
            onFocus={() => setSelectedBucket(index)}
            onClick={() => setSelectedBucket(index)}
          />
        ) : null)}
        <g className="coverage-labels" aria-hidden="true">
          <text x="150" y="14" textAnchor="middle">N</text>
          <text x="286" y="154" textAnchor="end">E</text>
          <text x="150" y="294" textAnchor="middle">S</text>
          <text x="14" y="154">W</text>
        </g>
        {maxDistanceKm > 0 && <g className="coverage-ring-labels" aria-hidden="true">
          {rings.map((ratio) => <text key={ratio} x="154" y={150 - coverageRingRadius(ratio) + 4}>{formatDistance(maxDistanceKm * ratio)}</text>)}
        </g>}
      </svg>
      <div className="coverage-detail" aria-live="polite">
        {selected
          ? <><strong>{t.statistics.azimuth(selected.bearingFrom, selected.bearingTo)}</strong><span>{formatDistance(selected.maxDistanceKm)}</span></>
          : maxDistanceKm > 0
            ? <span>{t.statistics.coverageHint}</span>
            : <span>{t.statistics.insufficientData}</span>}
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return <div className="statistics-stat-card"><div className="statistics-stat-value">{value}</div><div className="statistics-stat-label">{label}</div></div>;
}

function Ranking({ title, items }: { title: string; items: Array<{ name: string; count: number }> }) {
  return (
    <section className="statistics-card">
      <h2>{title}</h2>
      {items.length ? <ol className="statistics-ranking">{items.map((item) => <li key={item.name}><span>{item.name}</span><strong>{formatNumber(item.count)}</strong></li>)}</ol> : <p className="statistics-empty">{t.statistics.insufficientData}</p>}
    </section>
  );
}

function chartSegments(points: ReceiverStatisticsTrendPoint[], metric: TrendMetric, width: number, height: number, padding: number, maximum: number): string[] {
  const segments: string[] = [];
  let current: string[] = [];
  const xFor = (index: number) => padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
  const yFor = (value: number) => height - padding - (value / maximum) * (height - padding * 2);
  for (const [index, point] of points.entries()) {
    const value = point[metric];
    if (value === null) {
      if (current.length) segments.push(current.join(" "));
      current = [];
      continue;
    }
    current.push(`${xFor(index).toFixed(1)},${yFor(value).toFixed(1)}`);
  }
  if (current.length) segments.push(current.join(" "));
  return segments;
}

function TrendChart({
  title,
  points,
  metric,
}: {
  title: string;
  points: ReceiverStatisticsTrendPoint[];
  metric: TrendMetric;
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const width = 640;
  const height = 190;
  const padding = 20;
  const values = points.map((point) => point[metric]).filter((value): value is number => value !== null);
  const maximum = Math.max(...values, 1);
  const segments = chartSegments(points, metric, width, height, padding, maximum);
  const selected = selectedIndex === null ? null : points[selectedIndex] ?? null;
  const selectedValue = selected ? selected[metric] : null;
  const xFor = (index: number) => padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
  const yFor = (value: number) => height - padding - (value / maximum) * (height - padding * 2);

  return (
    <section className="statistics-card trend-card">
      <div className="statistics-card-header"><h2>{title}</h2><span>{t.statistics.trendHint}</span></div>
      {values.length > 0 ? <>
        <div className="trend-visual">
          <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
            <g className="trend-grid" aria-hidden="true">
              <line x1={padding} y1={padding} x2={width - padding} y2={padding} />
              <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} />
              <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} />
            </g>
            {segments.map((segment, index) => <polyline key={index} className="trend-line" points={segment} />)}
            {points.map((point, index) => {
              const value = point[metric];
              if (value === null) return null;
              return (
                <circle
                  key={point.date}
                  className={`trend-point ${selectedIndex === index ? "selected" : ""}`}
                  cx={xFor(index)}
                  cy={yFor(value)}
                  r="5"
                  tabIndex={0}
                  role="button"
                  aria-label={`${formatChartDate(point.date)}: ${formatTrendValue(value, metric)}`}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onFocus={() => setSelectedIndex(index)}
                  onClick={() => setSelectedIndex(index)}
                >
                  <title>{`${formatChartDate(point.date)} · ${formatTrendValue(value, metric)}`}</title>
                </circle>
              );
            })}
          </svg>
          <div className="trend-axis" aria-hidden="true">
            <span>{formatChartDate(points[0]?.date ?? "")}</span>
            <span>{formatChartDate(points[points.length - 1]?.date ?? "")}</span>
          </div>
        </div>
        <div className="trend-detail" aria-live="polite">
          {selected && selectedValue !== null
            ? <><strong>{formatChartDate(selected.date)}</strong><span>{formatTrendValue(selectedValue, metric)}</span></>
            : <span>{t.statistics.trendHint}</span>}
        </div>
      </> : <p className="statistics-empty-chart">{t.statistics.insufficientPeriodData}</p>}
    </section>
  );
}

function RangeSelector({ value, onChange }: { value: SelectedRange; onChange: (range: SelectedRange) => void }) {
  return (
    <div className="statistics-range-tabs" role="tablist" aria-label={t.statistics.rangeSelector}>
      {(["today", "7d", "30d"] as const).map((range) => (
        <button
          key={range}
          type="button"
          role="tab"
          aria-selected={value === range}
          className={value === range ? "active" : ""}
          onClick={() => onChange(range)}
        >
          {range === "today" ? t.statistics.rangeToday : range === "7d" ? t.statistics.rangeSevenDays : t.statistics.rangeThirtyDays}
        </button>
      ))}
    </div>
  );
}

function RangeCharts({ data }: { data: ReceiverStatisticsRangeResponse }) {
  return (
    <div className="statistics-trend-grid">
      <TrendChart title={t.statistics.uniqueTrend} points={data.period.trend} metric="uniqueAircraft" />
      <TrendChart title={t.statistics.concurrentTrend} points={data.period.trend} metric="maxConcurrentAircraft" />
      <TrendChart title={t.statistics.coverageTrend} points={data.period.coverageTrend.map((point) => ({
        date: point.date,
        uniqueAircraft: null,
        maxConcurrentAircraft: null,
        maxDistanceKm: point.maxDistanceKm,
      }))} metric="maxDistanceKm" />
    </div>
  );
}

export default function StatisticsPage() {
  const [range, setRange] = useState<SelectedRange>("today");
  const [data, setData] = useState<StatisticsPageData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const query = range === "today" ? "today" : range;
        const response = await fetch(`/api/statistics?range=${query}`, { cache: "no-store" });
        if (!response.ok) throw new Error("statistics request failed");
        const next = await response.json() as StatisticsPageData;
        if (active) {
          setData(next);
          setError(false);
        }
      } catch {
        if (active) setError(true);
      }
    };
    void load();
    const stream = new EventSource("/api/stream");
    const handleSnapshot = (event: MessageEvent<string>) => {
      try {
        const snapshot = JSON.parse(event.data) as { stats?: { currentAircraft?: number; messagesPerSecond?: number | null } };
        if (snapshot.stats && active) {
          setData((current) => current ? {
            ...current,
            live: {
              aircraftCount: snapshot.stats?.currentAircraft ?? current.live.aircraftCount,
              messagesPerSecond: snapshot.stats?.messagesPerSecond ?? null,
            },
          } : current);
        }
      } catch {
        // The existing statistics request remains the source of truth for daily data.
      }
    };
    stream.addEventListener("snapshot", handleSnapshot as EventListener);
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
      stream.removeEventListener("snapshot", handleSnapshot as EventListener);
      stream.close();
    };
  }, [range]);

  const rangeData = data && isRangeResponse(data) ? data : null;
  const summary = rangeData?.period.summary ?? data?.daily;

  return (
    <main className="history-page statistics-page">
      <header className="history-page-header statistics-page-header">
        <div>
          <h1>{t.statistics.title}</h1>
          <p className="statistics-subtitle">{t.statistics.subtitle}</p>
        </div>
        <nav className="statistics-nav" aria-label={t.statistics.navigation}>
          <Link className="back-link" href="/">{t.statistics.backToRadar}</Link>
          <Link className="back-link" href="/history">{t.statistics.viewHistory}</Link>
        </nav>
      </header>

      <RangeSelector value={range} onChange={setRange} />
      {error && <div className="statistics-error">{t.statistics.requestFailed}</div>}
      {!data && !error && <div className="statistics-card statistics-loading">{t.common.loading}</div>}
      {data && summary && <>
        <div className="statistics-date">
          {rangeData
            ? <>{t.statistics.periodLabel(rangeData.period.days)} · {rangeData.period.from} → {rangeData.period.to} · {data.timezone}</>
            : <>{t.statistics.today} · {data.date} · {data.timezone}</>}
        </div>
        <section className="statistics-overview">
          <SummaryCard label={t.statistics.currentAircraft} value={formatNumber(data.live.aircraftCount)} />
          <SummaryCard label={rangeData ? t.statistics.periodMaxConcurrent : t.statistics.maxConcurrent} value={formatNumber(summary.maxConcurrentAircraft)} />
          <SummaryCard label={rangeData ? t.statistics.periodUniqueAircraft : t.statistics.uniqueAircraft} value={formatNumber(summary.uniqueAircraft)} />
          <SummaryCard label={rangeData ? t.statistics.periodMaxDistance : t.statistics.maxDistance} value={formatDistance(summary.maxDistanceKm)} />
          <SummaryCard label={t.statistics.messagesPerSecond} value={data.live.messagesPerSecond === null ? t.common.emptyValue : formatNumber(data.live.messagesPerSecond, 1)} />
        </section>

        {((rangeData && !rangeData.period.hasData) || (!rangeData && data.daily.uniqueAircraft === 0)) && <div className="statistics-empty-banner">{rangeData ? t.statistics.insufficientPeriodData : t.statistics.insufficientData}</div>}

        {rangeData && <RangeCharts data={rangeData} />}

        <section className="statistics-card coverage-card">
          <div className="statistics-card-header"><h2>{t.statistics.coverage}</h2><span>{rangeData ? t.statistics.periodCoverageDescription : t.statistics.coverageDescription}</span></div>
          <CoverageChart buckets={data.coverage} />
        </section>

        {!rangeData && <div className="statistics-ranking-grid">
          <Ranking title={t.statistics.aircraftTypes} items={data.topAircraftTypes} />
          <Ranking title={t.statistics.airlines} items={data.topAirlines} />
        </div>}
      </>}
    </main>
  );
}
