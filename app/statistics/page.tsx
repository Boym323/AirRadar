"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type {
  ReceiverReceptionRecord,
  ReceiverReceptionRecordsResponse,
  ReceiverStatisticsCoverageSummary,
  ReceiverStatisticsComparison,
  ReceiverStatisticsRangeResponse,
  ReceiverStatisticsResponse,
  ReceiverStatisticsTrendPoint,
} from "@/lib/aircraft/types";
import {
  COVERAGE_BUCKET_COUNT,
  coverageChartPoints,
  coveragePolygonPath,
  coverageRingRadius,
} from "@/lib/statistics-coverage";
import { formatDateTime, formatDistance, formatNumber, formatTrack, t } from "@/lib/i18n";
import { statisticsCsv } from "@/lib/statistics-csv";

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
          >
            <title>{`${t.statistics.azimuth(point.bucket.bearingFrom, point.bucket.bearingTo)} · ${formatDistance(point.bucket.maxDistanceKm)}`}</title>
          </circle>
        ) : null)}
        <g className="coverage-labels" aria-hidden="true">
          <text x="150" y="14" textAnchor="middle">N</text>
          <text x="286" y="154" textAnchor="end">E</text>
          <text x="150" y="294" textAnchor="middle">S</text>
          <text x="14" y="154">W</text>
        </g>
        <g className="coverage-degree-labels" aria-hidden="true">
          <text x="150" y="28" textAnchor="middle">0°</text>
          <text x="296" y="166" textAnchor="end">90°</text>
          <text x="150" y="286" textAnchor="middle">180°</text>
          <text x="4" y="166">270°</text>
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

function coverageDistance(summary: ReceiverStatisticsCoverageSummary): string {
  return summary.populatedBuckets > 0 ? formatDistance(summary.maxDistanceKm) : t.common.emptyValue;
}

function CoverageAnalysis({
  summary,
  todaySummary,
  range,
}: {
  summary: ReceiverStatisticsCoverageSummary;
  todaySummary: ReceiverStatisticsCoverageSummary;
  range: SelectedRange;
}) {
  const rangeLabel = range === "7d" ? t.statistics.rangeSevenDays : t.statistics.rangeThirtyDays;

  return (
    <div className="coverage-analysis">
      <div className="coverage-summary-grid">
        <div className="coverage-summary-item">
          <span>{t.statistics.coverageMaxDistance}</span>
          <strong>{coverageDistance(summary)}</strong>
        </div>
        <div className="coverage-summary-item">
          <span>{t.statistics.coverageMaxBearing}</span>
          <strong>{summary.maxBearing === null ? t.common.emptyValue : `${String(summary.maxBearing).padStart(3, "0")}°`}</strong>
        </div>
        <div className="coverage-summary-item">
          <span>{t.statistics.coveragePopulatedBuckets}</span>
          <strong>{`${formatNumber(summary.populatedBuckets)} / ${COVERAGE_BUCKET_COUNT}`}</strong>
        </div>
        <div className="coverage-summary-item">
          <span>{t.statistics.coverageAverageDistance}</span>
          <strong>{formatDistance(summary.averageDistanceKm)}</strong>
        </div>
      </div>

      <section className="coverage-best-directions" aria-labelledby="coverage-best-directions-title">
        <h3 id="coverage-best-directions-title">{t.statistics.bestDirections}</h3>
        {summary.bestDirections.length > 0 ? (
          <ol className="statistics-ranking">
            {summary.bestDirections.map((item) => (
              <li key={item.bearingFrom}>
                <span>{t.statistics.azimuth(item.bearingFrom, item.bearingTo)}</span>
                <strong>{formatDistance(item.maxDistanceKm)}</strong>
              </li>
            ))}
          </ol>
        ) : <p className="statistics-empty">{t.statistics.insufficientData}</p>}
      </section>

      {range !== "today" && (
        <section className="coverage-comparison" aria-labelledby="coverage-comparison-title">
          <h3 id="coverage-comparison-title">{t.statistics.coverageComparison}</h3>
          <dl>
            <div><dt>{t.statistics.rangeToday}</dt><dd>{coverageDistance(todaySummary)}</dd></div>
            <div><dt>{rangeLabel}</dt><dd>{coverageDistance(summary)}</dd></div>
          </dl>
        </section>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return <div className="statistics-stat-card"><div className="statistics-stat-value">{value}</div><div className="statistics-stat-label">{label}</div></div>;
}

function PeriodComparison({ comparison }: { comparison: ReceiverStatisticsComparison }) {
  const currentLabel = `${comparison.current.from} → ${comparison.current.to}`;
  const previousLabel = `${comparison.previous.from} → ${comparison.previous.to}`;
  const displayValue = (value: number | null, distance = false) => value === null
    ? t.common.emptyValue
    : distance ? formatDistance(value) : formatNumber(value);

  return <section className="statistics-card statistics-period-comparison" aria-labelledby="statistics-period-comparison-title">
    <div className="statistics-card-header">
      <div className="coverage-card-heading">
        <h2 id="statistics-period-comparison-title">{t.statistics.periodComparison}</h2>
        <span>{t.statistics.periodComparisonDescription}</span>
      </div>
    </div>
    <div className="statistics-period-comparison-scroll">
      <table className="statistics-comparison-table">
        <thead><tr><th>{t.statistics.comparisonMetric}</th><th>{t.statistics.comparisonCurrent}<small>{currentLabel}</small></th><th>{t.statistics.comparisonPrevious}<small>{previousLabel}</small></th></tr></thead>
        <tbody>
          <tr><th>{t.statistics.periodUniqueAircraft}</th><td>{displayValue(comparison.current.uniqueAircraft)}</td><td>{displayValue(comparison.previous.uniqueAircraft)}</td></tr>
          <tr><th>{t.statistics.periodMaxConcurrent}</th><td>{displayValue(comparison.current.maxConcurrentAircraft)}</td><td>{displayValue(comparison.previous.maxConcurrentAircraft)}</td></tr>
          <tr><th>{t.statistics.periodMaxDistance}</th><td>{displayValue(comparison.current.maxDistanceKm, true)}</td><td>{displayValue(comparison.previous.maxDistanceKm, true)}</td></tr>
          <tr><th>{t.statistics.coverageMaxDistance}</th><td>{displayValue(comparison.current.coverageMaxDistanceKm, true)}</td><td>{displayValue(comparison.previous.coverageMaxDistanceKm, true)}</td></tr>
        </tbody>
      </table>
    </div>
  </section>;
}

function Ranking({ title, items }: { title: string; items: Array<{ name: string; count: number }> }) {
  return (
    <section className="statistics-card">
      <h2>{title}</h2>
      {items.length ? <ol className="statistics-ranking">{items.map((item) => <li key={item.name}><span>{item.name}</span><strong>{formatNumber(item.count)}</strong></li>)}</ol> : <p className="statistics-empty">{t.statistics.insufficientData}</p>}
    </section>
  );
}

function ReceptionRecordContent({ record }: { record: ReceiverReceptionRecord }) {
  return <>
    <div className="reception-record-heading">
      <Link href={`/aircraft/${encodeURIComponent(record.icaoHex)}`}>{record.icaoHex}</Link>
      <strong>{formatDistance(record.distanceKm)}</strong>
    </div>
    <div className="reception-record-meta">
      <span>{t.statistics.recordRegistration}: {record.registration ?? t.common.emptyValue}</span>
      <span>{t.statistics.recordBearing}: {formatTrack(record.bearing)}</span>
      <span>{t.statistics.recordObservedAt}: {formatDateTime(record.recordedAt)}</span>
    </div>
  </>;
}

function ReceptionRecord({ record }: { record: ReceiverReceptionRecord }) {
  return <li className="reception-record"><ReceptionRecordContent record={record} /></li>;
}

function ReceptionRecordsCard() {
  const [data, setData] = useState<ReceiverReceptionRecordsResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/reception-records", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("reception records request failed");
        return await response.json() as ReceiverReceptionRecordsResponse;
      })
      .then((next) => {
        if (!active) return;
        setData(next);
        setFailed(false);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => { active = false; };
  }, []);

  return <section className="statistics-card reception-records-card" aria-labelledby="reception-records-title">
    <div className="statistics-card-header">
      <div>
        <h2 id="reception-records-title">{t.statistics.receptionRecords}</h2>
        <span>{t.statistics.receptionRecordsDescription}</span>
      </div>
    </div>
    {failed ? <p className="statistics-empty">{t.statistics.receptionRecordsEmpty}</p> : !data ? <p className="statistics-empty">{t.common.loading}</p> : <>
      {data.lifetime ? <div className="reception-record-featured">
        <div><span>{t.statistics.todayReceptionRecord}</span>{data.today ? <div className="reception-record"><ReceptionRecordContent record={data.today} /></div> : <p className="statistics-empty">{t.statistics.receptionRecordsEmpty}</p>}</div>
        <div><span>{t.statistics.lifetimeReceptionRecord}</span><div className="reception-record"><ReceptionRecordContent record={data.lifetime} /></div></div>
      </div> : <p className="statistics-empty">{t.statistics.receptionRecordsEmpty}</p>}
      {data.top.length > 0 && <div className="reception-records-top"><h3>{t.statistics.topReceptionRecords}</h3><ol>{data.top.map((record) => <ReceptionRecord key={`${record.date}-${record.icaoHex}`} record={record} />)}</ol></div>}
      {data.source === "unavailable" && <p className="statistics-empty reception-records-note">{t.statistics.receptionRecordsUnavailable}</p>}
      <p className="statistics-empty reception-records-note">{t.statistics.receptionRecordsLegacyNote}</p>
    </>}
  </section>;
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

function RangeSelector({
  value,
  onChange,
  className = "statistics-range-tabs",
  ariaLabel = t.statistics.rangeSelector,
}: {
  value: SelectedRange;
  onChange: (range: SelectedRange) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div className={className} role="tablist" aria-label={ariaLabel}>
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

  function exportCsv(): void {
    if (!data) return;
    const blob = new Blob([statisticsCsv(data)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `airradar-statistics-${range}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

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

      {error && <div className="statistics-error">{t.statistics.requestFailed}</div>}
      {!data && !error && <div className="statistics-card statistics-loading">{t.common.loading}</div>}
      {data && summary && <>
        <div className="statistics-date-row">
          <div className="statistics-date">
            {rangeData
              ? <>{t.statistics.periodLabel(rangeData.period.days)} · {rangeData.period.from} → {rangeData.period.to} · {data.timezone}</>
              : <>{t.statistics.today} · {data.date} · {data.timezone}</>}
          </div>
          <button type="button" className="primary-button statistics-export-button" onClick={exportCsv} disabled={!data}>{t.statistics.exportCsv}</button>
        </div>
        <section className="statistics-overview">
          <SummaryCard label={t.statistics.currentAircraft} value={formatNumber(data.live.aircraftCount)} />
          <SummaryCard label={rangeData ? t.statistics.periodMaxConcurrent : t.statistics.maxConcurrent} value={formatNumber(summary.maxConcurrentAircraft)} />
          <SummaryCard label={rangeData ? t.statistics.periodUniqueAircraft : t.statistics.uniqueAircraft} value={formatNumber(summary.uniqueAircraft)} />
          <SummaryCard label={rangeData ? t.statistics.periodMaxDistance : t.statistics.maxDistance} value={formatDistance(summary.maxDistanceKm)} />
          <SummaryCard label={t.statistics.messagesPerSecond} value={data.live.messagesPerSecond === null ? t.common.emptyValue : formatNumber(data.live.messagesPerSecond, 1)} />
        </section>

        {((rangeData && !rangeData.period.hasData) || (!rangeData && data.daily.uniqueAircraft === 0)) && <div className="statistics-empty-banner">{rangeData ? t.statistics.insufficientPeriodData : t.statistics.insufficientData}</div>}

        {rangeData && <PeriodComparison comparison={rangeData.comparison} />}
        {rangeData && <RangeCharts data={rangeData} />}

        <section className="statistics-card coverage-card">
          <div className="statistics-card-header coverage-card-header">
            <div className="coverage-card-heading">
              <h2>{t.statistics.coverage}</h2>
              <span>{rangeData ? t.statistics.periodCoverageDescription : t.statistics.coverageDescription}</span>
            </div>
            <RangeSelector
              value={range}
              onChange={setRange}
              className="statistics-range-tabs coverage-range-tabs"
              ariaLabel={t.statistics.coverageRangeSelector}
            />
          </div>
          <CoverageChart buckets={data.coverage} />
          <CoverageAnalysis
            summary={rangeData?.period.coverageSummary ?? data.coverageSummary}
            todaySummary={rangeData?.todayCoverageSummary ?? data.coverageSummary}
            range={range}
          />
        </section>

        {!rangeData && <div className="statistics-ranking-grid">
          <Ranking title={t.statistics.aircraftTypes} items={data.topAircraftTypes} />
          <Ranking title={t.statistics.airlines} items={data.topAirlines} />
        </div>}
      </>}
      <ReceptionRecordsCard />
    </main>
  );
}
