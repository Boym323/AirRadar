import type { SpotterClosestApproach } from "@/lib/spotter-location";
import type { SpotterInterestScore, SpotterInterestReasonCode } from "@/lib/spotter-interest";

export interface SpotterAlertPreferences {
  enabled: boolean;
  maxClosestDistanceKm: number;
  leadMinutes: number;
  minimumInterestScore: number;
  reasons: SpotterInterestReasonCode[];
  favoriteAlertsEnabled: boolean;
}

export interface SpotterAlertCandidate {
  icaoHex: string;
  identity: string;
  aircraftType: string | null;
  routeLabel: string | null;
  interest: SpotterInterestScore;
  closestApproach: SpotterClosestApproach | null;
  favorite?: boolean;
}

const STORAGE_KEY = "airradar.spotter-alerts.v1";

export const DEFAULT_SPOTTER_ALERT_PREFERENCES: SpotterAlertPreferences = {
  enabled: false,
  favoriteAlertsEnabled: false,
  maxClosestDistanceKm: 5,
  leadMinutes: 3,
  minimumInterestScore: 40,
  reasons: ["iconic_type", "rare", "new", "widebody", "emergency", "reception_record"],
};

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function validReason(value: unknown): value is SpotterInterestReasonCode {
  return typeof value === "string" && [
    "emergency",
    "rare",
    "new",
    "returning",
    "iconic_type",
    "widebody",
    "close_pass",
    "reception_record",
  ].includes(value);
}

export function sanitizeSpotterAlertPreferences(value: unknown): SpotterAlertPreferences {
  const input = value && typeof value === "object" ? value as Partial<SpotterAlertPreferences> : {};
  const reasons = Array.isArray(input.reasons)
    ? [...new Set(input.reasons.filter(validReason))].slice(0, 8)
    : DEFAULT_SPOTTER_ALERT_PREFERENCES.reasons;
  return {
    enabled: input.enabled === true,
    favoriteAlertsEnabled: input.favoriteAlertsEnabled === true,
    maxClosestDistanceKm: boundedNumber(input.maxClosestDistanceKm, 5, 0.5, 50),
    leadMinutes: boundedNumber(input.leadMinutes, 3, 1, 15),
    minimumInterestScore: boundedNumber(input.minimumInterestScore, 40, 0, 100),
    reasons: reasons.length ? reasons : DEFAULT_SPOTTER_ALERT_PREFERENCES.reasons,
  };
}

export function readSpotterAlertPreferences(): SpotterAlertPreferences {
  if (typeof window === "undefined") return DEFAULT_SPOTTER_ALERT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeSpotterAlertPreferences(JSON.parse(raw)) : DEFAULT_SPOTTER_ALERT_PREFERENCES;
  } catch {
    return DEFAULT_SPOTTER_ALERT_PREFERENCES;
  }
}

export function writeSpotterAlertPreferences(preferences: SpotterAlertPreferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeSpotterAlertPreferences(preferences)));
  } catch {
    // Storage can be unavailable in private browsing or by policy.
  }
}

export function shouldTriggerSpotterAlert(
  candidate: SpotterAlertCandidate,
  preferences: SpotterAlertPreferences,
): boolean {
  if (!preferences.enabled) return false;
  const approach = candidate.closestApproach;
  if (!approach || approach.phase !== "approaching") return false;
  if (approach.closestHorizontalDistanceKm > preferences.maxClosestDistanceKm) return false;
  if (approach.secondsUntilClosest > preferences.leadMinutes * 60) return false;
  // Favorites are an explicit, independent opt-in; retain all spatial and
  // lead-time limits and require the main notification switch above.
  if (candidate.favorite && preferences.favoriteAlertsEnabled) return true;
  if (candidate.interest.score < preferences.minimumInterestScore) return false;
  return candidate.interest.reasons.some((reason) => preferences.reasons.includes(reason.code));
}

export function spotterAlertTag(candidate: Pick<SpotterAlertCandidate, "icaoHex">): string {
  return "airradar-spotter-" + candidate.icaoHex.toUpperCase();
}
