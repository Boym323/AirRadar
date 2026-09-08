import type {
  ReceiverStatisticsCoverageBucket,
  ReceiverStatisticsCoverageSummary,
} from "@/lib/aircraft/types";

export const COVERAGE_BUCKET_SIZE_DEGREES = 10;
export const COVERAGE_BUCKET_COUNT = 360 / COVERAGE_BUCKET_SIZE_DEGREES;

export type CoverageChartBucket = ReceiverStatisticsCoverageBucket;

export interface CoverageChartPoint {
  x: number;
  y: number;
  bucket: CoverageChartBucket;
}

/**
 * Summarize only populated receiver coverage buckets. A zero-distance bucket
 * means that no usable receiver observation populated that bearing and must
 * not lower the average.
 */
export function summarizeCoverage(
  buckets: CoverageChartBucket[],
  bestDirectionCount = 5,
): ReceiverStatisticsCoverageSummary {
  const populated = buckets
    .filter((bucket) => Number.isFinite(bucket.maxDistanceKm) && bucket.maxDistanceKm > 0)
    .map((bucket) => ({ ...bucket, maxDistanceKm: bucket.maxDistanceKm }))
    .sort((a, b) => b.maxDistanceKm - a.maxDistanceKm || a.bearingFrom - b.bearingFrom);
  const maximum = populated[0];
  if (!maximum) {
    return {
      maxDistanceKm: 0,
      maxBearing: null,
      populatedBuckets: 0,
      averageDistanceKm: null,
      bestDirections: [],
    };
  }

  return {
    maxDistanceKm: maximum.maxDistanceKm,
    maxBearing: Math.floor((maximum.bearingFrom + maximum.bearingTo - 1) / 2),
    populatedBuckets: populated.length,
    averageDistanceKm: populated.reduce((sum, bucket) => sum + bucket.maxDistanceKm, 0) / populated.length,
    bestDirections: populated.slice(0, Math.min(5, Math.max(0, Math.trunc(bestDirectionCount)))),
  };
}

export function coverageChartPoints(
  buckets: CoverageChartBucket[],
  center = 150,
  radius = 120,
  maxDistanceKm = Math.max(...buckets.map((bucket) => bucket.maxDistanceKm), 0),
): CoverageChartPoint[] {
  if (!Number.isFinite(maxDistanceKm) || maxDistanceKm <= 0) return [];
  const scale = radius / maxDistanceKm;
  return Array.from({ length: COVERAGE_BUCKET_COUNT }, (_, index) => {
    const bucket = buckets[index] ?? {
      bearingFrom: index * COVERAGE_BUCKET_SIZE_DEGREES,
      bearingTo: (index + 1) * COVERAGE_BUCKET_SIZE_DEGREES,
      maxDistanceKm: 0,
    };
    const bearing = (bucket.bearingFrom + bucket.bearingTo) / 2;
    const angle = ((bearing - 90) * Math.PI) / 180;
    const distance = Math.max(0, Number.isFinite(bucket.maxDistanceKm) ? bucket.maxDistanceKm : 0) * scale;
    return {
      x: center + Math.cos(angle) * distance,
      y: center + Math.sin(angle) * distance,
      bucket,
    };
  });
}

export function coveragePolygonPath(points: CoverageChartPoint[]): string {
  if (!points.length) return "";
  return `${points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ")} Z`;
}

export function coverageRingRadius(
  ringRatio: number,
  radius = 120,
): number {
  return Math.max(0, Math.min(1, ringRatio)) * radius;
}
