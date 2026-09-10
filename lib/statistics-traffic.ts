export type StatisticsTrafficRange = "today" | "7d" | "30d";

export interface StatisticsTrafficRankingItem {
  name: string;
  count: number;
}

export interface StatisticsTrafficRouteItem {
  origin: string;
  destination: string;
  count: number;
}

export interface StatisticsTrafficResponse {
  source: "postgres" | "unavailable";
  range: StatisticsTrafficRange;
  from: string;
  to: string;
  timezone: string;
  generatedAt: string;
  /** Counts persisted receiver-observed Flight instances, never position samples. */
  observedFlights: number | null;
  topAircraftTypes: StatisticsTrafficRankingItem[];
  topAirlines: StatisticsTrafficRankingItem[];
  topRoutes: StatisticsTrafficRouteItem[];
  topOrigins: StatisticsTrafficRankingItem[];
  topDestinations: StatisticsTrafficRankingItem[];
  registrationCountries: StatisticsTrafficRankingItem[];
}

export const STATISTICS_TRAFFIC_RANKING_LIMIT = 8;

export function parseStatisticsTrafficRange(value: string | null | undefined): StatisticsTrafficRange | null {
  if (value === null || value === undefined || value === "today") return "today";
  return value === "7d" || value === "30d" ? value : null;
}

function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvRow(values: Array<string | number | null>): string {
  return values.map(csvCell).join(",");
}

/** Export only the bounded traffic-intelligence response already sent to the browser. */
export function statisticsTrafficCsv(data: StatisticsTrafficResponse): string {
  const rows = [
    csvRow(["section", "range", "name", "count"]),
    csvRow(["summary", data.range, "observed_flights", data.observedFlights]),
  ];
  for (const item of data.topAircraftTypes) rows.push(csvRow(["aircraft_type", data.range, item.name, item.count]));
  for (const item of data.topAirlines) rows.push(csvRow(["airline", data.range, item.name, item.count]));
  for (const item of data.topRoutes) rows.push(csvRow(["route", data.range, `${item.origin} → ${item.destination}`, item.count]));
  for (const item of data.topOrigins) rows.push(csvRow(["origin", data.range, item.name, item.count]));
  for (const item of data.topDestinations) rows.push(csvRow(["destination", data.range, item.name, item.count]));
  for (const item of data.registrationCountries) rows.push(csvRow(["registration_country", data.range, item.name, item.count]));
  return `${rows.join("\n")}\n`;
}
