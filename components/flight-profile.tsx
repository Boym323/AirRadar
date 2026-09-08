import type { ReactNode } from "react";
import type { HistoryFlightDetail } from "@/lib/server/history";
import { formatNumber, t } from "@/lib/i18n";

const CHART_WIDTH = 720;
const CHART_HEIGHT = 190;
const PADDING = { top: 16, right: 52, bottom: 25, left: 12 };

export interface FlightProfileSeriesPoint {
  recordedAt: string;
  value: number;
  index: number;
}

export type FlightProfileMetric = "altitude" | "groundSpeed" | "verticalRate";

export function buildFlightProfileSeries(
  positions: HistoryFlightDetail["positions"],
  metric: FlightProfileMetric,
): FlightProfileSeriesPoint[] {
  return positions.flatMap((position, index) => {
    const value = position[metric];
    return typeof value === "number" && Number.isFinite(value)
      ? [{ recordedAt: position.recordedAt, value, index }]
      : [];
  });
}

interface ProfileChartProps {
  title: string;
  series: FlightProfileSeriesPoint[];
  color: string;
  unit: string;
}

function chartCoordinates(series: FlightProfileSeriesPoint[]): Array<{ x: number; y: number; value: number }> {
  if (!series.length) return [];
  const plotWidth = CHART_WIDTH - PADDING.left - PADDING.right;
  const plotHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const values = series.map((point) => point.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const padding = minimum === maximum ? Math.max(Math.abs(minimum) * 0.08, 1) : (maximum - minimum) * 0.08;
  const lower = minimum - padding;
  const upper = maximum + padding;
  const firstTime = Date.parse(series[0].recordedAt);
  const lastTime = Date.parse(series[series.length - 1].recordedAt);
  const hasTimeRange = Number.isFinite(firstTime) && Number.isFinite(lastTime) && lastTime > firstTime;
  const lastIndex = Math.max(series[series.length - 1].index, 1);

  return series.map((point) => {
    const timestamp = Date.parse(point.recordedAt);
    const position = hasTimeRange && Number.isFinite(timestamp)
      ? (timestamp - firstTime) / (lastTime - firstTime)
      : point.index / lastIndex;
    return {
      x: PADDING.left + Math.min(1, Math.max(0, position)) * plotWidth,
      y: PADDING.top + (1 - (point.value - lower) / (upper - lower)) * plotHeight,
      value: point.value,
    };
  });
}

function ProfileChart({ title, series, color, unit }: ProfileChartProps) {
  const coordinates = chartCoordinates(series);
  if (!coordinates.length) return <div className="flight-profile-empty">{t.history.profileNoData}</div>;

  const values = coordinates.map((coordinate) => coordinate.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const padding = minimum === maximum ? Math.max(Math.abs(minimum) * 0.08, 1) : (maximum - minimum) * 0.08;
  const lower = minimum - padding;
  const upper = maximum + padding;
  const points = coordinates.map((coordinate) => `${coordinate.x},${coordinate.y}`).join(" ");
  const axisLabel = `${formatNumber(maximum, 0)}${unit} – ${formatNumber(minimum, 0)}${unit}`;

  return (
    <div className="flight-profile-chart">
      <div className="flight-profile-chart-heading">
        <h3>{title}</h3>
        <span>{axisLabel}</span>
      </div>
      <svg className="flight-profile-svg" viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-label={title} preserveAspectRatio="none">
        {[0, 0.5, 1].map((ratio) => {
          const y = PADDING.top + ratio * (CHART_HEIGHT - PADDING.top - PADDING.bottom);
          const value = upper - ratio * (upper - lower);
          return (
            <g key={ratio}>
              <line x1={PADDING.left} x2={CHART_WIDTH - PADDING.right} y1={y} y2={y} className="flight-profile-grid-line" />
              <text x={CHART_WIDTH - PADDING.right + 8} y={y + 3} className="flight-profile-axis-label">{formatNumber(value, 0)}</text>
            </g>
          );
        })}
        <polyline points={points} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {coordinates.length === 1 && <circle cx={coordinates[0].x} cy={coordinates[0].y} r="4" fill={color} />}
      </svg>
    </div>
  );
}

export function FlightProfile({ positions }: { positions: HistoryFlightDetail["positions"] }): ReactNode {
  const altitude = buildFlightProfileSeries(positions, "altitude");
  const speed = buildFlightProfileSeries(positions, "groundSpeed");
  const verticalRate = buildFlightProfileSeries(positions, "verticalRate");

  return (
    <section className="flight-profiles" aria-labelledby="flight-profiles-title">
      <h2 id="flight-profiles-title">{t.history.profilesTitle}</h2>
      <div className="flight-profile-grid">
        <ProfileChart title={t.history.altitudeProfile} series={altitude} color="#f3b95f" unit=" ft" />
        <ProfileChart title={t.history.speedProfile} series={speed} color="#37d6c0" unit=" kt" />
        <ProfileChart title={t.history.verticalRateProfile} series={verticalRate} color="#9b8cff" unit=" fpm" />
      </div>
    </section>
  );
}
