import type { FlightEventType } from "@/lib/intelligence/types";

export type IntelligenceAnalyticsRange = "today" | "7d" | "30d";

export interface IntelligenceAnalyticsCount {
  name: string;
  count: number;
}

export interface IntelligenceAnalyticsHour {
  hour: number;
  count: number;
}

export interface IntelligenceAnalyticsTypeCount {
  type: FlightEventType;
  count: number;
}

export interface IntelligenceAnalyticsResponse {
  source: "postgres" | "unavailable";
  range: IntelligenceAnalyticsRange;
  from: string;
  to: string;
  timezone: string;
  generatedAt: string;
  totalEvents: number | null;
  byType: IntelligenceAnalyticsTypeCount[];
  hourly: IntelligenceAnalyticsHour[];
  topAircraft: IntelligenceAnalyticsCount[];
  topAirports: IntelligenceAnalyticsCount[];
  topSectors: IntelligenceAnalyticsCount[];
}
