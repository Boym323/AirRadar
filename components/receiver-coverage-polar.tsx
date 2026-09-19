"use client";

import { useId, useState } from "react";
import type { CoverageResponse } from "@/lib/server/receiver-coverage-analytics";
import { annularSectorPath, coverageCellState, coverageRatio } from "@/lib/receiver-coverage-polar";

const AZIMUTHS = 36;
const RANGES = [0, 25, 50, 75, 100, 125, 150, 175];
const SIZE = 520;
const CENTER = SIZE / 2;
const PLOT = 205;
type Cell = { azimuthStartDeg: number; azimuthEndDeg: number; rangeStartNm: number; rangeEndNm: number; captured: number; available: number };

function cells(data: CoverageResponse): Cell[] {
  const values = new Map(data.polar.map((item) => [item.key, item]));
  return Array.from({ length: AZIMUTHS }, (_, azimuth) => Array.from({ length: RANGES.length - 1 }, (_, range) => {
    const value = values.get(`polar:${azimuth}:${range}`);
    return { azimuthStartDeg: azimuth * 10, azimuthEndDeg: (azimuth + 1) * 10, rangeStartNm: RANGES[range], rangeEndNm: RANGES[range + 1], captured: value?.captured ?? 0, available: value?.available ?? 0 };
  })).flat();
}

function periodLabel(period: CoverageResponse["period"]): string { return period === "7d" ? "7 days" : period === "30d" ? "30 days" : period === "today" ? "Today" : "Live"; }
function ratioText(cell: Cell): string { const ratio = coverageRatio(cell.captured, cell.available); return ratio === null ? "No data" : `${ratio.toFixed(2)} %`; }

export function ReceiverCoveragePolar({ data }: { data: CoverageResponse }) {
  const [selected, setSelected] = useState<Cell | null>(null);
  const titleId = useId();
  const allCells = cells(data);
  const threshold = data.metadata.insufficientThreshold;
  const noData = data.summary.available === 0;
  return <section className="statistics-card receiver-polar-card" aria-labelledby={titleId}>
    <div className="statistics-card-header"><div><h2 id={titleId}>Polar coverage map</h2><p className="receiver-polar-subtitle">Bearing clockwise from North · distance from receiver · {data.comparisonRadiusNm} NM radius</p></div><span>{periodLabel(data.period)} · {data.metadata.referenceProviders.join(", ") || "No reference"}</span></div>
    {noData ? <p className="statistics-empty receiver-polar-empty">No coverage observations for this period.</p> : <div className="receiver-polar-layout">
      <div className="receiver-polar-plot-wrap"><svg className="receiver-polar-plot" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-labelledby={`${titleId}-svg-title ${titleId}-svg-desc`}>
        <title id={`${titleId}-svg-title`}>Receiver polar coverage map</title><desc id={`${titleId}-svg-desc`}>Each cell shows captured network-reference observations divided by available observations.</desc>
        {[25, 50, 75, 100, 125, 150, 175].map((ring) => <circle key={ring} className="receiver-polar-ring" cx={CENTER} cy={CENTER} r={ring / 175 * PLOT} />)}
        {allCells.map((cell, index) => { const state = coverageCellState(cell.available, threshold); const ratio = coverageRatio(cell.captured, cell.available) ?? 0; const opacity = state === "SUFFICIENT" ? 0.2 + ratio / 125 : 0.25; return <path key={`${cell.azimuthStartDeg}-${cell.rangeStartNm}`} className={`receiver-polar-cell ${state.toLowerCase()}`} d={annularSectorPath(cell.rangeStartNm / 175 * PLOT, cell.rangeEndNm / 175 * PLOT, cell.azimuthStartDeg, cell.azimuthEndDeg, CENTER)} style={{ opacity: state === "SUFFICIENT" ? opacity : undefined, fill: state === "SUFFICIENT" ? `hsl(${170 + ratio * 0.45} 62% ${30 + ratio * 0.18}%)` : undefined }} tabIndex={index === 0 ? 0 : -1} role="button" aria-label={`Azimuth ${cell.azimuthStartDeg} to ${cell.azimuthEndDeg} degrees, range ${cell.rangeStartNm} to ${cell.rangeEndNm} nautical miles, captured ${cell.captured} of ${cell.available}, ${ratioText(cell)}.`} onFocus={() => setSelected(cell)} onMouseEnter={() => setSelected(cell)} onClick={() => setSelected(cell)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(cell); } if (event.key === "Escape") setSelected(null); }} />; })}
        {["N", "E", "S", "W"].map((label, index) => { const points = [{ x: CENTER, y: 16 }, { x: SIZE - 16, y: CENTER }, { x: CENTER, y: SIZE - 16 }, { x: 16, y: CENTER }]; return <text key={label} className="receiver-polar-cardinal" x={points[index].x} y={points[index].y} textAnchor="middle" dominantBaseline="middle">{label}</text>; })}
        <circle className="receiver-polar-center" cx={CENTER} cy={CENTER} r="3" /><text className="receiver-polar-center-label" x={CENTER} y={CENTER + 18} textAnchor="middle">Receiver</text>
        {[50, 100, 150, 175].map((ring) => <text key={ring} className="receiver-polar-range-label" x={CENTER + 5} y={CENTER - ring / 175 * PLOT + 3}>{ring} NM</text>)}
      </svg></div>
      <div className="receiver-polar-side"><div className="receiver-polar-legend"><strong>Capture ratio</strong><div className="receiver-polar-gradient" /><div className="receiver-polar-legend-labels"><span>0 %</span><span>25 %</span><span>50 %</span><span>75 %</span><span>100 %</span></div><p><i className="receiver-polar-swatch insufficient" /> Insufficient data (&lt; {threshold})</p><p><i className="receiver-polar-swatch no-data" /> No data</p></div>{selected && <div className="receiver-polar-detail" role="status"><strong>{selected.azimuthStartDeg}–{selected.azimuthEndDeg}° · {selected.rangeStartNm}–{selected.rangeEndNm} NM</strong><span>Captured: {selected.captured.toLocaleString()}</span><span>Available: {selected.available.toLocaleString()}</span><span>Capture ratio: {ratioText(selected)}</span><span>Period: {periodLabel(data.period)}</span><span>Reference: {data.metadata.mixedProviders ? "Mixed" : data.metadata.referenceProviders.join(", ") || "—"}</span>{coverageCellState(selected.available, threshold) !== "SUFFICIENT" && <em>{coverageCellState(selected.available, threshold) === "NO_DATA" ? "No data" : "Insufficient data · low confidence"}</em>}</div>}</div>
    </div>}
  </section>;
}
