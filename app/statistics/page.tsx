"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReceiverStatisticsResponse } from "@/lib/aircraft/types";
import { coverageChartPoints, coveragePolygonPath, coverageRingRadius } from "@/lib/statistics-coverage";
import { formatDistance, formatNumber, t } from "@/lib/i18n";

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

export default function StatisticsPage() {
  const [data, setData] = useState<ReceiverStatisticsResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/statistics", { cache: "no-store" });
        if (!response.ok) throw new Error("statistics request failed");
        const next = await response.json() as ReceiverStatisticsResponse;
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
        // The next statistics poll remains the source of truth for daily data.
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
  }, []);

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
      {data && <>
        <div className="statistics-date">{t.statistics.today} · {data.date} · {data.timezone}</div>
        <section className="statistics-overview">
          <SummaryCard label={t.statistics.currentAircraft} value={formatNumber(data.live.aircraftCount)} />
          <SummaryCard label={t.statistics.maxConcurrent} value={formatNumber(data.daily.maxConcurrentAircraft)} />
          <SummaryCard label={t.statistics.uniqueAircraft} value={formatNumber(data.daily.uniqueAircraft)} />
          <SummaryCard label={t.statistics.maxDistance} value={formatDistance(data.daily.maxDistanceKm)} />
          <SummaryCard label={t.statistics.messagesPerSecond} value={data.live.messagesPerSecond === null ? t.common.emptyValue : formatNumber(data.live.messagesPerSecond, 1)} />
        </section>

        {data.daily.uniqueAircraft === 0 && <div className="statistics-empty-banner">{t.statistics.insufficientData}</div>}

        <section className="statistics-card coverage-card">
          <div className="statistics-card-header"><h2>{t.statistics.coverage}</h2><span>{t.statistics.coverageDescription}</span></div>
          <CoverageChart buckets={data.coverage} />
        </section>

        <div className="statistics-ranking-grid">
          <Ranking title={t.statistics.aircraftTypes} items={data.topAircraftTypes} />
          <Ranking title={t.statistics.airlines} items={data.topAirlines} />
        </div>
      </>}
    </main>
  );
}
