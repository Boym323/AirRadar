import { formatNumber, formatSpeed } from "@/lib/i18n";

export function formatFiledAltitude(value: number): string {
  const feet = value * 100;
  const formattedFeet = `${formatNumber(feet)} ft`;
  return value >= 180 ? `FL${formatNumber(value)} · ${formattedFeet}` : formattedFeet;
}

export function hasFiniteFlightPlanValue(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value);
}

export function formatFiledAirspeed(value: number): string {
  return formatSpeed(value);
}

export function formatFiledEte(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (!hours) return `${minutes} min`;
  return remainingMinutes ? `${hours} h ${remainingMinutes} min` : `${hours} h`;
}

export function formatRouteDistance(statuteMiles: number): string {
  const nauticalMiles = Math.round(statuteMiles * 0.868976);
  return `${formatNumber(statuteMiles)} mi · ${formatNumber(nauticalMiles)} NM`;
}
