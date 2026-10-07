import type {
  TrafficProfileHourlyBucket,
  TrafficProfileWeekdayBucket,
} from "@/lib/statistics-traffic-profile";

export function busiestHour(items: TrafficProfileHourlyBucket[]): TrafficProfileHourlyBucket | null {
  if (items.reduce((sum, item) => sum + item.count, 0) <= 0) return null;
  return items.reduce((best, item) => item.count > best.count ? item : best);
}

export function quietestHour(items: TrafficProfileHourlyBucket[]): TrafficProfileHourlyBucket | null {
  if (items.reduce((sum, item) => sum + item.count, 0) <= 0) return null;
  return items.reduce((best, item) => item.count < best.count ? item : best);
}

export function busiestWeekday(items: TrafficProfileWeekdayBucket[]): TrafficProfileWeekdayBucket | null {
  if (items.reduce((sum, item) => sum + item.count, 0) <= 0) return null;
  return items.reduce((best, item) => item.count > best.count ? item : best);
}
