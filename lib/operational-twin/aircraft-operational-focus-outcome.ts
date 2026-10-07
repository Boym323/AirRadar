import type { Aircraft } from "@/lib/aircraft/types";
import { positionObservedAt } from "@/lib/aircraft/source-merge";
import { pointInSigmetGeometry } from "@/lib/weather/aircraft-sigmet-context";
import type { SigmetSnapshot } from "@/lib/weather/types";
import type {
  AircraftOperationalFocusLevel,
  AircraftOperationalFocusType,
  OperationalTwinSituation,
} from "./types";

export const AIRCRAFT_OPERATIONAL_FOCUS_OUTCOME_VERSION =
  "aircraft-operational-focus-outcome-v1" as const;

export const AIRCRAFT_OPERATIONAL_FOCUS_OUTCOME_THRESHOLDS = {
  version: AIRCRAFT_OPERATIONAL_FOCUS_OUTCOME_VERSION,
  minimumSpanMinutes: 120,
  minimumScoreableSamples: 30,
  minimumObservedSamples: 15,
  minimumPrecision: 0.7,
  maximumMeanAbsoluteTimingErrorSeconds: 240,
  maximumMissingTruthRate: 0.4,
} as const;

export type AircraftOperationalFocusOutcomeDecision = "PASS" | "WAIT" | "FAIL";
export type AircraftOperationalFocusOutcomeReason =
  | "process_window_insufficient"
  | "scoreable_samples_insufficient"
  | "observed_samples_insufficient"
  | "precision_low"
  | "timing_error_high"
  | "truth_coverage_low";

type ScoredLevel = Exclude<AircraftOperationalFocusLevel, "NORMAL">;

interface CaptureRecord {
  capturedAt: number;
  type: AircraftOperationalFocusType;
  level: ScoredLevel;
  scoreable: boolean;
}

interface PendingWeatherFocus {
  id: string;
  icaoHex: string;
  itemId: string;
  level: ScoredLevel;
  capturedAt: number;
  predictedAt: number;
  earlyAt: number;
  expiresAt: number;
  feature: SigmetSnapshot["features"][number];
  sawFreshObservation: boolean;
  lastFreshObservationAt: number | null;
}

interface Resolution {
  resolvedAt: number;
  level: ScoredLevel;
  outcome: "OBSERVED" | "FALSE_POSITIVE" | "EXPIRED_NO_TRUTH";
  timingErrorSeconds: number | null;
}

export interface AircraftOperationalFocusOutcomeSlice {
  predictions: number;
  scoreable: number;
  observed: number;
  falsePositive: number;
  expiredNoTruth: number;
  precision: number | null;
  missingTruthRate: number | null;
  timingSamples: number;
  meanAbsoluteTimingErrorSeconds: number | null;
}

export interface AircraftOperationalFocusOutcomeTypeCoverage {
  captures: number;
  scoreableCaptures: number;
  unscoredCaptures: number;
}

export interface AircraftOperationalFocusOutcomeReport {
  version: typeof AIRCRAFT_OPERATIONAL_FOCUS_OUTCOME_VERSION;
  generatedAt: string;
  decision: AircraftOperationalFocusOutcomeDecision;
  reasons: AircraftOperationalFocusOutcomeReason[];
  complete: boolean;
  thresholds: typeof AIRCRAFT_OPERATIONAL_FOCUS_OUTCOME_THRESHOLDS;
  truthSource: "LOCAL_RECEIVER_SIGMET_GEOMETRY";
  requestDrivenCapture: true;
  refreshDrivenSampling: true;
  scoreableTypes: readonly ["WEATHER"];
  unscoredTypes: readonly ["NAVIGATION_INTEGRITY", "PLANNED_AIRSPACE", "TRAJECTORY"];
  limitations: readonly [
    "SIGMET_WEATHER_ONLY",
    "PIREP_WEATHER_UNSCORED",
    "NAVIGATION_INTEGRITY_UNSCORED",
    "PLANNED_AIRSPACE_UNSCORED",
    "TRAJECTORY_UNSCORED",
    "PROCESS_LOCAL_EVIDENCE",
  ];
  window: {
    from: string;
    to: string;
    spanMinutes: number;
    processLocal: true;
  };
  pending: number;
  duplicateCaptureSkips: number;
  overall: AircraftOperationalFocusOutcomeSlice;
  byLevel: Record<ScoredLevel, AircraftOperationalFocusOutcomeSlice>;
  byType: Record<AircraftOperationalFocusType, AircraftOperationalFocusOutcomeTypeCoverage>;
}

const WINDOW_MS = 24 * 60 * 60_000;
const CAPTURE_DEDUP_MS = 55_000;
const EARLY_MS = 5 * 60_000;
const LATE_MS = 8 * 60_000;
const CONTINUITY_TOLERANCE_MS = 90_000;
const CLEANUP_INTERVAL_MS = 60_000;
const MAX_PENDING = 2_000;
const MAX_RECORDS = 8_000;

function altitudeFt(aircraft: Aircraft): number | null {
  return aircraft.baroAltitude ?? aircraft.altitude ?? aircraft.geomAltitude ?? null;
}

function altitudeMatches(lowerFt: number | null, upperFt: number | null, altitude: number | null): boolean {
  if (lowerFt === null && upperFt === null) return true;
  if (altitude === null || !Number.isFinite(altitude)) return false;
  if (lowerFt !== null && altitude < lowerFt) return false;
  if (upperFt !== null && altitude > upperFt) return false;
  return true;
}

function sigmetValidAt(feature: SigmetSnapshot["features"][number], at: number): boolean {
  const from = feature.properties.validFrom ? Date.parse(feature.properties.validFrom) : Number.NEGATIVE_INFINITY;
  const to = feature.properties.validTo ? Date.parse(feature.properties.validTo) : Number.POSITIVE_INFINITY;
  if (feature.properties.validFrom && !Number.isFinite(from)) return false;
  if (feature.properties.validTo && !Number.isFinite(to)) return false;
  return at >= from && at <= to;
}

function freshObservationAt(aircraft: Aircraft, now: number): number | null {
  const observed = positionObservedAt(aircraft);
  if (observed === null || !Number.isFinite(observed)) return null;
  return Math.abs(now - observed) <= CONTINUITY_TOLERANCE_MS ? observed : null;
}

function emptyTypeCoverage(): Record<AircraftOperationalFocusType, AircraftOperationalFocusOutcomeTypeCoverage> {
  return {
    WEATHER: { captures: 0, scoreableCaptures: 0, unscoredCaptures: 0 },
    NAVIGATION_INTEGRITY: { captures: 0, scoreableCaptures: 0, unscoredCaptures: 0 },
    PLANNED_AIRSPACE: { captures: 0, scoreableCaptures: 0, unscoredCaptures: 0 },
    TRAJECTORY: { captures: 0, scoreableCaptures: 0, unscoredCaptures: 0 },
  };
}

function slice(
  captures: readonly CaptureRecord[],
  resolutions: readonly Resolution[],
): AircraftOperationalFocusOutcomeSlice {
  const predictions = captures.filter((item) => item.scoreable).length;
  const observed = resolutions.filter((item) => item.outcome === "OBSERVED").length;
  const falsePositive = resolutions.filter((item) => item.outcome === "FALSE_POSITIVE").length;
  const expiredNoTruth = resolutions.filter((item) => item.outcome === "EXPIRED_NO_TRUTH").length;
  const scoreable = observed + falsePositive;
  const resolved = scoreable + expiredNoTruth;
  const timing = resolutions
    .map((item) => item.timingErrorSeconds)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  return {
    predictions,
    scoreable,
    observed,
    falsePositive,
    expiredNoTruth,
    precision: scoreable ? Number((observed / scoreable).toFixed(4)) : null,
    missingTruthRate: resolved ? Number((expiredNoTruth / resolved).toFixed(4)) : null,
    timingSamples: timing.length,
    meanAbsoluteTimingErrorSeconds: timing.length
      ? Number((timing.reduce((sum, value) => sum + Math.abs(value), 0) / timing.length).toFixed(1))
      : null,
  };
}

export function evaluateAircraftOperationalFocusOutcome(
  spanMinutes: number,
  overall: AircraftOperationalFocusOutcomeSlice,
): {
  decision: AircraftOperationalFocusOutcomeDecision;
  reasons: AircraftOperationalFocusOutcomeReason[];
  complete: boolean;
} {
  const reasons: AircraftOperationalFocusOutcomeReason[] = [];
  if (spanMinutes < AIRCRAFT_OPERATIONAL_FOCUS_OUTCOME_THRESHOLDS.minimumSpanMinutes) {
    reasons.push("process_window_insufficient");
  }
  if (overall.scoreable < AIRCRAFT_OPERATIONAL_FOCUS_OUTCOME_THRESHOLDS.minimumScoreableSamples) {
    reasons.push("scoreable_samples_insufficient");
  }
  if (overall.observed < AIRCRAFT_OPERATIONAL_FOCUS_OUTCOME_THRESHOLDS.minimumObservedSamples) {
    reasons.push("observed_samples_insufficient");
  }
  const complete = reasons.length === 0;
  if (complete) {
    if (overall.precision === null || overall.precision < AIRCRAFT_OPERATIONAL_FOCUS_OUTCOME_THRESHOLDS.minimumPrecision) {
      reasons.push("precision_low");
    }
    if (
      overall.meanAbsoluteTimingErrorSeconds === null
      || overall.meanAbsoluteTimingErrorSeconds > AIRCRAFT_OPERATIONAL_FOCUS_OUTCOME_THRESHOLDS.maximumMeanAbsoluteTimingErrorSeconds
    ) {
      reasons.push("timing_error_high");
    }
    if (
      overall.missingTruthRate === null
      || overall.missingTruthRate > AIRCRAFT_OPERATIONAL_FOCUS_OUTCOME_THRESHOLDS.maximumMissingTruthRate
    ) {
      reasons.push("truth_coverage_low");
    }
  }
  return {
    decision: !complete ? "WAIT" : reasons.length ? "FAIL" : "PASS",
    reasons,
    complete,
  };
}

export class AircraftOperationalFocusOutcomeValidator {
  private readonly pending = new Map<string, PendingWeatherFocus>();
  private readonly lastCaptureAt = new Map<string, number>();
  private captures: CaptureRecord[] = [];
  private resolutions: Resolution[] = [];
  private firstObservedAt: number | null = null;
  private duplicateCaptureSkips = 0;
  private lastCleanupAt = Number.NEGATIVE_INFINITY;

  capture(
    situation: OperationalTwinSituation,
    sigmets: SigmetSnapshot | null,
    now = Date.parse(situation.generatedAt),
  ): void {
    if (!Number.isFinite(now) || !situation.operationalFocus) return;
    this.firstObservedAt ??= now;

    for (const item of situation.operationalFocus.items) {
      const dedupKey = `${situation.aircraft.icaoHex}:${item.id}`;
      const previousCapture = this.lastCaptureAt.get(dedupKey) ?? Number.NEGATIVE_INFINITY;
      if (now - previousCapture < CAPTURE_DEDUP_MS) {
        this.duplicateCaptureSkips += 1;
        continue;
      }
      this.lastCaptureAt.set(dedupKey, now);

      const weatherEvent = item.type === "WEATHER"
        ? situation.weatherCorridor.events.find((event) => `weather:${event.id}` === item.id) ?? null
        : null;
      const feature = weatherEvent?.source === "SIGMET"
        ? sigmets?.features.find((candidate) =>
            candidate.id === weatherEvent.sourceReference
            || candidate.properties.id === weatherEvent.sourceReference
          ) ?? null
        : null;
      const predictedAt = Date.parse(item.at);
      const scoreable = Boolean(
        item.type === "WEATHER"
        && weatherEvent?.type === "SIGMET_ENTRY"
        && feature
        && Number.isFinite(predictedAt)
        && predictedAt > now
      );

      this.captures.push({
        capturedAt: now,
        type: item.type,
        level: item.level,
        scoreable,
      });

      if (!scoreable || !feature) continue;
      const pendingId = `${dedupKey}:${now}`;
      this.pending.set(pendingId, {
        id: pendingId,
        icaoHex: situation.aircraft.icaoHex,
        itemId: item.id,
        level: item.level,
        capturedAt: now,
        predictedAt,
        earlyAt: predictedAt - EARLY_MS,
        expiresAt: predictedAt + LATE_MS,
        feature,
        sawFreshObservation: false,
        lastFreshObservationAt: null,
      });
      if (this.pending.size > MAX_PENDING) {
        let oldest: PendingWeatherFocus | null = null;
        for (const candidate of this.pending.values()) {
          if (!oldest || candidate.capturedAt < oldest.capturedAt) oldest = candidate;
        }
        if (oldest) this.pending.delete(oldest.id);
      }
    }
    this.cleanup(now);
  }

  observe(aircraft: readonly Aircraft[] | ReadonlyMap<string, Aircraft>, now = new Date()): void {
    const nowMs = now.getTime();
    if (!Number.isFinite(nowMs)) return;
    const byHex: ReadonlyMap<string, Aircraft> = Array.isArray(aircraft)
      ? new Map((aircraft as readonly Aircraft[]).map((item) => [item.icaoHex, item] as const))
      : aircraft as ReadonlyMap<string, Aircraft>;

    for (const pending of this.pending.values()) {
      if (nowMs < pending.earlyAt) continue;
      const current = byHex.get(pending.icaoHex);
      const observedAt = current ? freshObservationAt(current, nowMs) : null;
      if (current && observedAt !== null && current.lat !== null && current.lon !== null) {
        pending.sawFreshObservation = true;
        pending.lastFreshObservationAt = observedAt;
        if (
          nowMs <= pending.expiresAt
          && sigmetValidAt(pending.feature, observedAt)
          && pointInSigmetGeometry(current.lon, current.lat, pending.feature.geometry)
          && altitudeMatches(pending.feature.properties.lowerFt, pending.feature.properties.upperFt, altitudeFt(current))
        ) {
          this.resolutions.push({
            resolvedAt: observedAt,
            level: pending.level,
            outcome: "OBSERVED",
            timingErrorSeconds: (observedAt - pending.predictedAt) / 1_000,
          });
          this.pending.delete(pending.id);
          continue;
        }
      }

      if (nowMs > pending.expiresAt) {
        const continuous = pending.sawFreshObservation
          && pending.lastFreshObservationAt !== null
          && pending.lastFreshObservationAt >= pending.expiresAt - CONTINUITY_TOLERANCE_MS;
        this.resolutions.push({
          resolvedAt: nowMs,
          level: pending.level,
          outcome: continuous ? "FALSE_POSITIVE" : "EXPIRED_NO_TRUTH",
          timingErrorSeconds: null,
        });
        this.pending.delete(pending.id);
      }
    }

    this.cleanup(nowMs);
  }

  report(now = new Date()): AircraftOperationalFocusOutcomeReport {
    const nowMs = now.getTime();
    this.cleanup(nowMs, true);
    const cutoff = nowMs - WINDOW_MS;
    const captures = this.captures.filter((item) => item.capturedAt >= cutoff);
    const resolutions = this.resolutions.filter((item) => item.resolvedAt >= cutoff);
    const first = Math.max(cutoff, this.firstObservedAt ?? nowMs);
    const spanMinutes = Math.max(0, (nowMs - first) / 60_000);
    const overall = slice(captures, resolutions);
    const byLevel = {
      WATCH: slice(
        captures.filter((item) => item.level === "WATCH"),
        resolutions.filter((item) => item.level === "WATCH"),
      ),
      ATTENTION: slice(
        captures.filter((item) => item.level === "ATTENTION"),
        resolutions.filter((item) => item.level === "ATTENTION"),
      ),
    };
    const byType = emptyTypeCoverage();
    for (const capture of captures) {
      const coverage = byType[capture.type];
      coverage.captures += 1;
      if (capture.scoreable) coverage.scoreableCaptures += 1;
      else coverage.unscoredCaptures += 1;
    }
    const decision = evaluateAircraftOperationalFocusOutcome(spanMinutes, overall);

    return {
      version: AIRCRAFT_OPERATIONAL_FOCUS_OUTCOME_VERSION,
      generatedAt: now.toISOString(),
      decision: decision.decision,
      reasons: decision.reasons,
      complete: decision.complete,
      thresholds: AIRCRAFT_OPERATIONAL_FOCUS_OUTCOME_THRESHOLDS,
      truthSource: "LOCAL_RECEIVER_SIGMET_GEOMETRY",
      requestDrivenCapture: true,
      refreshDrivenSampling: true,
      scoreableTypes: ["WEATHER"],
      unscoredTypes: ["NAVIGATION_INTEGRITY", "PLANNED_AIRSPACE", "TRAJECTORY"],
      limitations: [
        "SIGMET_WEATHER_ONLY",
        "PIREP_WEATHER_UNSCORED",
        "NAVIGATION_INTEGRITY_UNSCORED",
        "PLANNED_AIRSPACE_UNSCORED",
        "TRAJECTORY_UNSCORED",
        "PROCESS_LOCAL_EVIDENCE",
      ],
      window: {
        from: new Date(first).toISOString(),
        to: now.toISOString(),
        spanMinutes: Number(spanMinutes.toFixed(1)),
        processLocal: true,
      },
      pending: [...this.pending.values()].filter((item) => item.capturedAt >= cutoff).length,
      duplicateCaptureSkips: this.duplicateCaptureSkips,
      overall,
      byLevel,
      byType,
    };
  }

  private cleanup(now: number, force = false): void {
    if (
      !force
      && now >= this.lastCleanupAt
      && now - this.lastCleanupAt < CLEANUP_INTERVAL_MS
      && this.captures.length <= MAX_RECORDS
      && this.resolutions.length <= MAX_RECORDS
    ) {
      return;
    }
    this.lastCleanupAt = now;
    const cutoff = now - WINDOW_MS;
    this.captures = this.captures.filter((item) => item.capturedAt >= cutoff).slice(-MAX_RECORDS);
    this.resolutions = this.resolutions.filter((item) => item.resolvedAt >= cutoff).slice(-MAX_RECORDS);
    for (const [key, at] of this.lastCaptureAt) if (at < cutoff) this.lastCaptureAt.delete(key);
    for (const [key, pending] of this.pending) if (pending.capturedAt < cutoff) this.pending.delete(key);
  }
}
