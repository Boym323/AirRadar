"use client";

import { useMemo, useState } from "react";
import type { CoverageIntelligenceSector } from "@/lib/statistics-coverage-intelligence";
import { polarPoint } from "@/lib/receiver-coverage-polar";
import { formatDistance, formatNumber, t } from "@/lib/i18n";
import { receiverExplorerCopy, receiverRangeChartAria, receiverRangeSectorAria, receiverCardinals } from "@/lib/i18n/receiver-explorer";
import styles from "./receiver-explorer.module.css";

const SIZE = 520;
const CENTER = SIZE / 2;
const PLOT_RADIUS = 205;

function polygonPoints(
  sectors: readonly CoverageIntelligenceSector[],
  scaleKm: number,
  value: (sector: CoverageIntelligenceSector) => number | null,
): string {
  return sectors.map((sector) => {
    const distance = value(sector) ?? 0;
    const radius = Math.max(0, Math.min(PLOT_RADIUS, distance / scaleKm * PLOT_RADIUS));
    const bearing = (sector.bearingFrom + sector.bearingTo) / 2;
    const point = polarPoint(radius, bearing, CENTER);
    return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
  }).join(" ");
}

function scaleFor(sectors: readonly CoverageIntelligenceSector[]): number {
  const maximum = Math.max(...sectors.map((sector) => sector.maxDistanceKm ?? 0), 1);
  return Math.max(50, Math.ceil(maximum / 50) * 50);
}

export function ReceiverRangePolar({
  sectors,
  periodDays,
}: {
  sectors: readonly CoverageIntelligenceSector[];
  periodDays: number;
}) {
  const copy = receiverExplorerCopy(t.locale);
  const [selected, setSelected] = useState<CoverageIntelligenceSector | null>(null);
  const scaleKm = useMemo(() => scaleFor(sectors), [sectors]);
  const median = useMemo(
    () => polygonPoints(sectors, scaleKm, (sector) => sector.medianDailyMaxDistanceKm),
    [sectors, scaleKm],
  );
  const p95 = useMemo(
    () => polygonPoints(sectors, scaleKm, (sector) => sector.p95DailyMaxDistanceKm),
    [sectors, scaleKm],
  );
  const maximum = useMemo(
    () => polygonPoints(sectors, scaleKm, (sector) => sector.maxDistanceKm),
    [sectors, scaleKm],
  );
  const rings = [0.25, 0.5, 0.75, 1];

  return (
    <div className={styles.rangePolarLayout}>
      <div className={styles.rangePolarPlotWrap}>
        <svg
          className={styles.rangePolarPlot}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={receiverRangeChartAria(t.locale, periodDays)}
        >
          {rings.map((fraction) => (
            <g key={fraction}>
              <circle
                className={styles.rangeRing}
                cx={CENTER}
                cy={CENTER}
                r={PLOT_RADIUS * fraction}
              />
              <text
                className={styles.rangeRingLabel}
                x={CENTER + 6}
                y={CENTER - PLOT_RADIUS * fraction + 14}
              >
                {formatNumber(scaleKm * fraction)} km
              </text>
            </g>
          ))}
          {Array.from({ length: 12 }, (_, index) => index * 30).map((bearing) => {
            const end = polarPoint(PLOT_RADIUS, bearing, CENTER);
            return <line key={bearing} className={styles.rangeAxis} x1={CENTER} y1={CENTER} x2={end.x} y2={end.y} />;
          })}
          <polygon className={styles.rangeMaximum} points={maximum} />
          <polygon className={styles.rangeP95} points={p95} />
          <polygon className={styles.rangeMedian} points={median} />
          {sectors.map((sector) => {
            const bearing = (sector.bearingFrom + sector.bearingTo) / 2;
            const distance = sector.maxDistanceKm ?? 0;
            const radius = Math.max(0, Math.min(PLOT_RADIUS, distance / scaleKm * PLOT_RADIUS));
            const point = polarPoint(radius, bearing, CENTER);
            return (
              <circle
                key={sector.bearingFrom}
                className={styles.rangeHit}
                cx={point.x}
                cy={point.y}
                r="8"
                tabIndex={0}
                role="button"
                aria-label={receiverRangeSectorAria(t.locale, sector.bearingFrom, sector.bearingTo, formatDistance(sector.medianDailyMaxDistanceKm), formatDistance(sector.p95DailyMaxDistanceKm), formatDistance(sector.maxDistanceKm))}
                onFocus={() => setSelected(sector)}
                onMouseEnter={() => setSelected(sector)}
                onClick={() => setSelected(sector)}
              />
            );
          })}
          {[
            [receiverCardinals(t.locale)[0], CENTER, 17],
            [receiverCardinals(t.locale)[1], SIZE - 17, CENTER],
            [receiverCardinals(t.locale)[2], CENTER, SIZE - 17],
            [receiverCardinals(t.locale)[3], 17, CENTER],
          ].map(([label, x, y]) => (
            <text
              key={String(label)}
              className={styles.rangeCardinal}
              x={Number(x)}
              y={Number(y)}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {label}
            </text>
          ))}
          <circle className={styles.rangeCenter} cx={CENTER} cy={CENTER} r="3" />
        </svg>
      </div>
      <div className={styles.rangePolarSide}>
        <div className={styles.legend}>
          <strong>{copy.rangeLegend}</strong>
          <span><i className={styles.legendMedian} /> {copy.rangeMedian}</span>
          <span><i className={styles.legendP95} /> {copy.rangeP95}</span>
          <span><i className={styles.legendMaximum} /> {copy.rangeMax}</span>
          <small>{copy.rangeDisclaimer}</small>
        </div>
        {selected ? (
          <div className={styles.rangeDetail} role="status">
            <strong>{String(selected.bearingFrom).padStart(3, "0")}°–{String(selected.bearingTo).padStart(3, "0")}°</strong>
            <span>{copy.median}: {formatDistance(selected.medianDailyMaxDistanceKm)}</span>
            <span>P95: {formatDistance(selected.p95DailyMaxDistanceKm)}</span>
            <span>Maximum: {formatDistance(selected.maxDistanceKm)}</span>
            <span>{copy.observed}: {selected.observedDays}/{periodDays} {copy.days}</span>
            <span>{selected.reliable ? copy.reliable : copy.limited}</span>
          </div>
        ) : (
          <p className={styles.rangeHint}>{copy.rangeSelect}</p>
        )}
      </div>
    </div>
  );
}
