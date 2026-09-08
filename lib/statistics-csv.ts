import type { ReceiverStatisticsRangeResponse, ReceiverStatisticsResponse } from "@/lib/aircraft/types";

export type StatisticsExportData = ReceiverStatisticsResponse | ReceiverStatisticsRangeResponse;

function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvRow(values: Array<string | number | null>): string {
  return values.map(csvCell).join(",");
}

function isRangeResponse(data: StatisticsExportData): data is ReceiverStatisticsRangeResponse {
  return "period" in data;
}

/**
 * Serializes only the bounded statistics response. Empty coverage buckets are
 * represented as blank cells so missing data is not confused with zero range.
 */
export function statisticsCsv(data: StatisticsExportData): string {
  const rows = [
    csvRow(["section", "date", "unique_aircraft", "max_concurrent_aircraft", "max_distance_km"]),
  ];

  if (isRangeResponse(data)) {
    for (const point of data.period.trend) {
      rows.push(csvRow(["daily", point.date, point.uniqueAircraft, point.maxConcurrentAircraft, point.maxDistanceKm]));
    }
    for (const point of data.period.coverageTrend) {
      rows.push(csvRow(["coverage_daily", point.date, null, null, point.maxDistanceKm]));
    }
  } else {
    rows.push(csvRow(["daily", data.date, data.daily.uniqueAircraft, data.daily.maxConcurrentAircraft, data.daily.maxDistanceKm]));
  }

  rows.push("");
  rows.push(csvRow(["section", "date", "bearing_from", "bearing_to", "max_distance_km"]));
  for (const bucket of data.coverage) {
    rows.push(csvRow(["coverage", data.date, bucket.bearingFrom, bucket.bearingTo, bucket.maxDistanceKm > 0 ? bucket.maxDistanceKm : null]));
  }

  return `${rows.join("\n")}\n`;
}
