export const COVERAGE_BUCKET_SIZE_DEGREES = 10;
export const COVERAGE_BUCKET_COUNT = 360 / COVERAGE_BUCKET_SIZE_DEGREES;

export interface CoverageChartBucket {
  bearingFrom: number;
  bearingTo: number;
  maxDistanceKm: number;
}

export interface CoverageChartPoint {
  x: number;
  y: number;
  bucket: CoverageChartBucket;
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
