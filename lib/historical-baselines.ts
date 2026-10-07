export type BaselineState = "ABOVE" | "NEAR" | "BELOW" | "INSUFFICIENT";

export interface BaselineMetric {
  current: number | null;
  baselineMedian: number | null;
  deltaPercent: number | null;
  state: BaselineState;
  sampleDays: number;
}

export interface HistoricalBaselineSummary {
  currentDate: string;
  uniqueAircraft: BaselineMetric;
  maxConcurrentAircraft: BaselineMetric;
  maxDistanceKm: BaselineMetric;
}

interface TrendPoint {
  date: string;
  uniqueAircraft: number | null;
  maxConcurrentAircraft: number | null;
  maxDistanceKm: number | null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function metric(current: number | null, values: Array<number | null>): BaselineMetric {
  const samples = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
  const baselineMedian = median(samples);
  if (current === null || !Number.isFinite(current) || baselineMedian === null || samples.length < 7) {
    return { current, baselineMedian, deltaPercent: null, state: "INSUFFICIENT", sampleDays: samples.length };
  }
  if (baselineMedian === 0) {
    return { current, baselineMedian, deltaPercent: current === 0 ? 0 : null, state: current === 0 ? "NEAR" : "ABOVE", sampleDays: samples.length };
  }
  const deltaPercent = ((current - baselineMedian) / baselineMedian) * 100;
  return {
    current,
    baselineMedian,
    deltaPercent,
    state: deltaPercent >= 20 ? "ABOVE" : deltaPercent <= -20 ? "BELOW" : "NEAR",
    sampleDays: samples.length,
  };
}

export function buildHistoricalBaseline(input: {
  currentDate: string;
  current: {
    uniqueAircraft: number | null;
    maxConcurrentAircraft: number | null;
    maxDistanceKm: number | null;
  };
  trend: readonly TrendPoint[];
}): HistoricalBaselineSummary {
  const completed = input.trend.filter((point) => point.date !== input.currentDate);
  return {
    currentDate: input.currentDate,
    uniqueAircraft: metric(input.current.uniqueAircraft, completed.map((point) => point.uniqueAircraft)),
    maxConcurrentAircraft: metric(input.current.maxConcurrentAircraft, completed.map((point) => point.maxConcurrentAircraft)),
    maxDistanceKm: metric(input.current.maxDistanceKm, completed.map((point) => point.maxDistanceKm)),
  };
}
