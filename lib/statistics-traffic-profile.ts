export const TRAFFIC_PROFILE_RANGES = ["7d", "30d"] as const;

export type TrafficProfileRange = (typeof TRAFFIC_PROFILE_RANGES)[number];

export interface TrafficProfileBucket {
  count: number;
}

export interface TrafficProfileHourlyBucket extends TrafficProfileBucket {
  hour: number;
}

export interface TrafficProfileWeekdayBucket extends TrafficProfileBucket {
  /** ISO weekday: 1 = Monday, 7 = Sunday. */
  weekday: number;
}

export interface TrafficProfileResponse {
  source: "postgres" | "unavailable";
  range: TrafficProfileRange;
  from: string;
  to: string;
  timezone: string;
  generatedAt: string;
  observedFlights: number | null;
  hourly: TrafficProfileHourlyBucket[];
  weekdays: TrafficProfileWeekdayBucket[];
}

export function parseTrafficProfileRange(value: string | null): TrafficProfileRange | null {
  return value === "7d" || value === "30d" ? value : null;
}
