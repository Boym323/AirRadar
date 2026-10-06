"use client";

import { useEffect, useState } from "react";
import { formatNumber } from "@/lib/i18n";
import { statisticsHeatmapText as text } from "@/lib/i18n/statistics-heatmap";
import { statisticsHeatmapCsv, type StatisticsHeatmapRange, type StatisticsHeatmapResponse } from "@/lib/statistics-heatmap";
import styles from "./statistics-heatmap.module.css";

function rangeLabel(range: StatisticsHeatmapRange): string { return range === "today" ? text.today : range === "7d" ? text.sevenDays : text.thirtyDays; }

export default function StatisticsHeatmap() {
  const [range, setRange] = useState<StatisticsHeatmapRange>("today");
  const [data, setData] = useState<StatisticsHeatmapResponse | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); setData(null); setFailed(false);
    void fetch(`/api/statistics/heatmap?range=${range}`, { cache: "no-store", signal: controller.signal }).then(async (response) => { if (!response.ok) throw new Error("heatmap request failed"); return await response.json() as StatisticsHeatmapResponse; }).then((next) => { if (!controller.signal.aborted) setData(next); }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [range]);
  function exportCsv(): void { if (!data || data.source !== "postgres") return; const url = URL.createObjectURL(new Blob([statisticsHeatmapCsv(data)], { type: "text/csv;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `airradar-heatmap-${range}.csv`; anchor.click(); URL.revokeObjectURL(url); }
  const unavailable = failed || data?.source === "unavailable";
  return <div className={styles.wrapper}><section className={`statistics-card ${styles.panel}`} aria-labelledby="statistics-heatmap-title"><div className={`statistics-card-header ${styles.header}`}><div className={styles.headerCopy}><h2 id="statistics-heatmap-title">{text.title}</h2><p>{text.description}</p></div><div className={styles.controls}><div className="statistics-range-tabs" role="tablist" aria-label={text.rangeSelector}>{(["today", "7d", "30d"] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={range === item} className={range === item ? "active" : ""} onClick={() => setRange(item)}>{rangeLabel(item)}</button>)}</div><button type="button" className="primary-button statistics-export-button" onClick={exportCsv} disabled={!data || data.source !== "postgres"}>{text.exportCsv}</button></div></div>{!data && !failed ? <p className={styles.status}>{text.loading}</p> : unavailable ? <p className={styles.status}>{text.unavailable}</p> : data && data.cells.length === 0 ? <p className={styles.status}>{text.noData}</p> : data ? <><div className={styles.map}><svg className={styles.grid} viewBox="0 0 28 14" role="img" aria-label={text.title}>{data.cells.map((cell) => <rect key={`${cell.x}:${cell.y}`} className={styles.cell} x={cell.x} y={cell.y / 2} width="1" height=".5" opacity={0.08 + cell.intensity * .82}><title>{`${cell.count} · ${Math.round(cell.intensity * 100)}%`}</title></rect>)}</svg><div className={styles.mapLabels}><span>180°W</span><span>0°</span><span>180°E</span></div></div><div className={styles.meta}><span>{formatNumber(data.sampledPositions)} {text.sampled}</span><span>{formatNumber(data.maxCellCount)} {text.maxCell}</span></div><p className={styles.disclaimer}>{text.disclaimer}</p></> : null}</section></div>;
}
