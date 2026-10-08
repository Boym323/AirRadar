import { describe, expect, it } from "vitest";
import {
  DEFAULT_SPOTTER_ALERT_PREFERENCES,
  sanitizeSpotterAlertPreferences,
  shouldTriggerSpotterAlert,
  spotterAlertTag,
} from "@/lib/spotter-alerts";

const candidate = {
  icaoHex: "ABC123",
  identity: "EK139",
  aircraftType: "A388",
  routeLabel: "OMDB → LKPR",
  interest: {
    score: 80,
    reasons: [
      { code: "iconic_type" as const, points: 30 },
      { code: "rare" as const, points: 30 },
      { code: "close_pass" as const, points: 20 },
    ],
  },
  closestApproach: {
    secondsUntilClosest: 120,
    currentHorizontalDistanceKm: 8,
    closestHorizontalDistanceKm: 2,
    closestSlantDistanceKm: 3,
    elevationAtClosestDeg: 45,
    phase: "approaching" as const,
  },
};

describe("Spotter Alerts V1", () => {
  it("matches an interesting approaching aircraft inside the configured lead window", () => {
    expect(shouldTriggerSpotterAlert(candidate, {
      ...DEFAULT_SPOTTER_ALERT_PREFERENCES,
      enabled: true,
    })).toBe(true);
  });

  it("rejects disabled, distant, late, low-score and departing candidates", () => {
    expect(shouldTriggerSpotterAlert(candidate, DEFAULT_SPOTTER_ALERT_PREFERENCES)).toBe(false);
    expect(shouldTriggerSpotterAlert({
      ...candidate,
      closestApproach: { ...candidate.closestApproach, closestHorizontalDistanceKm: 8 },
    }, { ...DEFAULT_SPOTTER_ALERT_PREFERENCES, enabled: true })).toBe(false);
    expect(shouldTriggerSpotterAlert({
      ...candidate,
      closestApproach: { ...candidate.closestApproach, secondsUntilClosest: 600 },
    }, { ...DEFAULT_SPOTTER_ALERT_PREFERENCES, enabled: true })).toBe(false);
    expect(shouldTriggerSpotterAlert({
      ...candidate,
      interest: { score: 10, reasons: candidate.interest.reasons },
    }, { ...DEFAULT_SPOTTER_ALERT_PREFERENCES, enabled: true })).toBe(false);
    expect(shouldTriggerSpotterAlert({
      ...candidate,
      closestApproach: { ...candidate.closestApproach, phase: "departing" },
    }, { ...DEFAULT_SPOTTER_ALERT_PREFERENCES, enabled: true })).toBe(false);
  });

  it("sanitizes persisted browser preferences into bounded values", () => {
    expect(sanitizeSpotterAlertPreferences({
      enabled: true,
      maxClosestDistanceKm: 500,
      leadMinutes: 0,
      minimumInterestScore: 500,
      reasons: ["rare", "bogus"],
    })).toEqual({
      enabled: true,
      favoriteAlertsEnabled: false,
      maxClosestDistanceKm: 50,
      leadMinutes: 1,
      minimumInterestScore: 100,
      reasons: ["rare"],
    });
  });

  it("keeps opt-in favorite notifications bounded by permission, time and location policy", () => {
    const ordinaryFavorite = {
      ...candidate,
      favorite: true,
      interest: { score: 0, reasons: [] },
    };
    expect(shouldTriggerSpotterAlert(ordinaryFavorite, {
      ...DEFAULT_SPOTTER_ALERT_PREFERENCES, enabled: true,
    })).toBe(false);
    const enabled = { ...DEFAULT_SPOTTER_ALERT_PREFERENCES, enabled: true, favoriteAlertsEnabled: true };
    expect(shouldTriggerSpotterAlert(ordinaryFavorite, enabled)).toBe(true);
    expect(shouldTriggerSpotterAlert(ordinaryFavorite, { ...enabled, enabled: false })).toBe(false);
    expect(shouldTriggerSpotterAlert({
      ...ordinaryFavorite, closestApproach: { ...candidate.closestApproach, secondsUntilClosest: 999 },
    }, enabled)).toBe(false);
    expect(shouldTriggerSpotterAlert({
      ...ordinaryFavorite, closestApproach: { ...candidate.closestApproach, closestHorizontalDistanceKm: 16 },
    }, enabled)).toBe(false);
    expect(shouldTriggerSpotterAlert({
      ...ordinaryFavorite, closestApproach: { ...candidate.closestApproach, phase: "departing" },
    }, enabled)).toBe(false);
    expect(sanitizeSpotterAlertPreferences({ favoriteAlertsEnabled: "true" }).favoriteAlertsEnabled).toBe(false);
    expect(sanitizeSpotterAlertPreferences({ favoriteAlertsEnabled: true }).favoriteAlertsEnabled).toBe(true);
  });

  it("uses a stable per-aircraft notification tag", () => {
    expect(spotterAlertTag(candidate)).toBe("airradar-spotter-ABC123");
  });
});
