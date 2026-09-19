"use client";

import { useEffect, useState } from "react";
import type { CoverageResponse, CoveragePeriod } from "@/lib/server/receiver-coverage-analytics";

const periods: CoveragePeriod[] = ["live", "today", "7d", "30d"];
function pct(captured: number, available: number): string { return available ? `${(captured / available * 100).toFixed(2)} %` : "No data"; }

export default function ReceiverCoveragePage() {
  const [period, setPeriod] = useState<CoveragePeriod>("live");
  const [data, setData] = useState<CoverageResponse | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { let active = true; setError(false); void fetch(`/api/receiver/coverage?period=${period}`, { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(); return r.json() as Promise<CoverageResponse>; }).then((value) => { if (active) setData(value); }).catch(() => { if (active) setError(true); }); return () => { active = false; }; }, [period]);
  return <main className="history-page statistics-page">
    <header className="history-page-header statistics-page-header"><div><h1>Receiver coverage analytics</h1><p className="statistics-subtitle">Network-reference capture ratio · not antenna efficiency or message reception rate</p></div><nav className="statistics-nav"><a className="back-link" href="/statistics">Statistics</a><a className="back-link" href="/">Radar</a></nav></header>
    <div className="statistics-date-row"><div className="statistics-range-tabs">{periods.map((item) => <button className={period === item ? "active" : ""} key={item} type="button" onClick={() => setPeriod(item)}>{item.toUpperCase()}</button>)}</div></div>
    {error && <div className="statistics-error">Coverage data is temporarily unavailable.</div>}
    {!data && !error && <div className="statistics-card statistics-loading">Loading…</div>}
    {data && <>
      <section className="statistics-overview"><div className="statistics-stat-card"><div className="statistics-stat-value">{data.summary.captured} / {data.summary.available}</div><div className="statistics-stat-label">Capture ratio · {pct(data.summary.captured, data.summary.available)}</div></div><div className="statistics-stat-card"><div className="statistics-stat-value">{data.comparisonRadiusNm} NM</div><div className="statistics-stat-label">Comparison radius</div></div><div className="statistics-stat-card"><div className="statistics-stat-value">{data.metadata.referenceProviders.join(", ") || "—"}</div><div className="statistics-stat-label">Reference provider</div></div></section>
      <CoverageTable title="Azimuth" rows={data.azimuth} />
      <CoverageTable title="Range" rows={data.range} />
      <CoverageTable title="Altitude" rows={data.altitude} />
      <section className="statistics-card"><h2>Azimuth × range</h2><div className="statistics-period-comparison-scroll"><table className="statistics-comparison-table"><thead><tr><th>Cell</th><th>Captured</th><th>Available</th><th>Ratio</th></tr></thead><tbody>{data.polar.map((row) => <tr key={row.key}><th>{row.label}</th><td>{row.captured}</td><td>{row.available}</td><td>{row.available < data.metadata.insufficientThreshold ? "Insufficient data" : pct(row.captured, row.available)}</td></tr>)}</tbody></table>{data.polar.length === 0 && <p className="statistics-empty">No data</p>}</div></section>
    </>}
  </main>;
}
function CoverageTable({ title, rows }: { title: string; rows: CoverageResponse["azimuth"] }) { return <section className="statistics-card"><h2>{title}</h2><div className="statistics-period-comparison-scroll"><table className="statistics-comparison-table"><thead><tr><th>Bucket</th><th>Captured</th><th>Available</th><th>Ratio</th></tr></thead><tbody>{rows.map((row) => <tr key={row.key}><th>{row.label}</th><td>{row.captured}</td><td>{row.available}</td><td>{row.available < 20 ? "Insufficient data" : pct(row.captured, row.available)}</td></tr>)}</tbody></table>{rows.length === 0 && <p className="statistics-empty">No data</p>}</div></section>; }
