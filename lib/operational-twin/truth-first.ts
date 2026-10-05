import type { FlightIntelligenceEvent } from "@/lib/intelligence/types";
import type { LandingTerminalEvidenceV1 } from "@/lib/intelligence/terminal-evidence";
import type { OperationalTwinEventOutcomeCaptureContext } from "./event-outcome";
import type { OperationalTwinSituation } from "./types";

export const OPERATIONAL_TWIN_TRUTH_FIRST_VERSION = "operational-digital-twin-truth-first-v1" as const;
export const OPERATIONAL_TWIN_TRUTH_FIRST_WINDOW_MINUTES = 24 * 60;
export const OPERATIONAL_TWIN_TRUTH_FIRST_MAX_PREDICTIONS = 2_048;
export const OPERATIONAL_TWIN_TRUTH_FIRST_MAX_TRUTHS = 512;

const WINDOW_MS = OPERATIONAL_TWIN_TRUTH_FIRST_WINDOW_MINUTES * 60_000;
const MAX_LOOKBACK_MS = 35 * 60_000;
const CAPTURE_DEDUP_MS = 55_000;

export type OperationalTwinTruthFirstType = "ARRIVAL_ETA" | "RUNWAY_EXPECTATION";
export type OperationalTwinTruthFirstDecision = "PASS" | "WAIT" | "FAIL";

export const OPERATIONAL_TWIN_TRUTH_FIRST_THRESHOLDS = {
  version: OPERATIONAL_TWIN_TRUTH_FIRST_VERSION,
  minimumSpanMinutes: 120,
  minimumTruthEvents: 20,
  minimumRecall: 0.70,
} as const;

interface CapturedPrediction {
  id: string;
  icaoHex: string;
  type: OperationalTwinTruthFirstType;
  capturedAt: number;
  predictedAt: number;
  destination: string | null;
  runway: string | null;
}

interface TruthOutcome {
  id: string;
  type: OperationalTwinTruthFirstType;
  occurredAt: number;
  predicted: boolean;
  timingErrorSeconds: number | null;
}

export interface OperationalTwinTruthFirstSlice {
  truthEvents: number;
  predictedTruthEvents: number;
  missedTruthEvents: number;
  recall: number | null;
  timingSamples: number;
  meanAbsoluteTimingErrorSeconds: number | null;
}

export interface OperationalTwinTruthFirstReport {
  version: typeof OPERATIONAL_TWIN_TRUTH_FIRST_VERSION;
  generatedAt: string;
  scope: "TERMINAL_TRUTH_FIRST_ONLY";
  truthSource: "FLIGHT_INTELLIGENCE_LANDING";
  decision: OperationalTwinTruthFirstDecision;
  reasons: string[];
  complete: boolean;
  spanMinutes: number;
  thresholds: typeof OPERATIONAL_TWIN_TRUTH_FIRST_THRESHOLDS;
  overall: OperationalTwinTruthFirstSlice;
  byType: Record<OperationalTwinTruthFirstType, OperationalTwinTruthFirstSlice>;
  pendingPredictions: number;
  limitations: Array<
    "ARRIVAL_AND_REPORTED_RUNWAY_ONLY"
    | "WAYPOINT_SECTOR_WEATHER_RECALL_UNAVAILABLE"
    | "PROCESS_LOCAL_EVIDENCE"
  >;
}

function normalize(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase() ?? "";
  return normalized || null;
}

function normalizeRunway(value: string | null | undefined): string | null {
  const normalized = normalize(value);
  if (!normalized) return null;
  return normalized.replace(/^RWY\s*/, "");
}

function terminalEvidence(event: FlightIntelligenceEvent): LandingTerminalEvidenceV1 | null {
  const value = event.metadata?.terminalEvidence;
  if (!value || typeof value !== "object") return null;
  return value as LandingTerminalEvidenceV1;
}

function emptySlice(): OperationalTwinTruthFirstSlice {
  return {
    truthEvents: 0,
    predictedTruthEvents: 0,
    missedTruthEvents: 0,
    recall: null,
    timingSamples: 0,
    meanAbsoluteTimingErrorSeconds: null,
  };
}

function aggregate(outcomes: readonly TruthOutcome[]): OperationalTwinTruthFirstSlice {
  if (outcomes.length === 0) return emptySlice();
  const predictedTruthEvents = outcomes.filter((item) => item.predicted).length;
  const timing = outcomes
    .map((item) => item.timingErrorSeconds)
    .filter((value): value is number => value !== null);
  return {
    truthEvents: outcomes.length,
    predictedTruthEvents,
    missedTruthEvents: outcomes.length - predictedTruthEvents,
    recall: predictedTruthEvents / outcomes.length,
    timingSamples: timing.length,
    meanAbsoluteTimingErrorSeconds: timing.length
      ? timing.reduce((sum, value) => sum + Math.abs(value), 0) / timing.length
      : null,
  };
}

export class OperationalTwinTruthFirstValidator {
  private predictions: CapturedPrediction[] = [];
  private truths: TruthOutcome[] = [];
  private readonly lastCaptureAt = new Map<string, number>();
  private readonly seenTruthIds = new Map<string, number>();
  private firstObservedAt: number | null = null;

  capture(
    situation: OperationalTwinSituation,
    context: OperationalTwinEventOutcomeCaptureContext,
    now = Date.parse(situation.generatedAt),
  ): void {
    if (!Number.isFinite(now)) return;
    for (const event of situation.events) {
      if (event.type !== "ARRIVAL_ETA" && event.type !== "RUNWAY_EXPECTATION") continue;
      const predictedAt = Date.parse(event.at);
      if (!Number.isFinite(predictedAt) || predictedAt <= now) continue;
      const destination = normalize(context.destination);
      const runway = event.type === "RUNWAY_EXPECTATION" ? normalizeRunway(event.title) : null;
      const semantic = event.type === "RUNWAY_EXPECTATION"
        ? `${destination ?? "UNKNOWN"}:${runway ?? "UNKNOWN"}`
        : destination ?? "UNKNOWN";
      const key = `${situation.aircraft.icaoHex}:${event.type}:${semantic}`;
      const previous = this.lastCaptureAt.get(key) ?? Number.NEGATIVE_INFINITY;
      if (now - previous < CAPTURE_DEDUP_MS) continue;
      this.lastCaptureAt.set(key, now);
      this.predictions.push({
        id: `${key}:${now}`,
        icaoHex: situation.aircraft.icaoHex.toUpperCase(),
        type: event.type,
        capturedAt: now,
        predictedAt,
        destination,
        runway,
      });
    }
    this.firstObservedAt ??= now;
    this.cleanup(now);
  }

  observeIntelligence(events: readonly FlightIntelligenceEvent[], now = Date.now()): void {
    for (const event of events) {
      if (event.type !== "LANDING") continue;
      const occurredAt = Date.parse(event.occurredAt);
      if (!Number.isFinite(occurredAt)) continue;
      const truthBaseId = event.lifecycleKey || event.eventKey || event.id;
      const destination = normalize(event.airportIcao);
      if (destination) {
        this.recordTruth({
          id: `arrival:${truthBaseId}`,
          type: "ARRIVAL_ETA",
          occurredAt,
          event,
          destination,
          runway: null,
        });
      }

      const evidence = terminalEvidence(event);
      const reportedRunway = normalizeRunway(evidence?.reportedArrivalRunway?.runway);
      if (destination && reportedRunway) {
        this.recordTruth({
          id: `runway:${truthBaseId}:${reportedRunway}`,
          type: "RUNWAY_EXPECTATION",
          occurredAt,
          event,
          destination,
          runway: reportedRunway,
        });
      }
    }
    this.firstObservedAt ??= Number.isFinite(now) ? now : Date.now();
    this.cleanup(Number.isFinite(now) ? now : Date.now());
  }

  private recordTruth(input: {
    id: string;
    type: OperationalTwinTruthFirstType;
    occurredAt: number;
    event: FlightIntelligenceEvent;
    destination: string;
    runway: string | null;
  }): void {
    if (this.seenTruthIds.has(input.id)) return;
    this.seenTruthIds.set(input.id, input.occurredAt);

    const candidates = this.predictions.filter((prediction) =>
      prediction.icaoHex === input.event.icaoHex.toUpperCase()
      && prediction.type === input.type
      && prediction.capturedAt <= input.occurredAt
      && input.occurredAt - prediction.capturedAt <= MAX_LOOKBACK_MS
      && prediction.destination === input.destination
      && (input.type !== "RUNWAY_EXPECTATION" || prediction.runway === input.runway)
    );
    const best = candidates.sort((a, b) =>
      Math.abs(a.predictedAt - input.occurredAt) - Math.abs(b.predictedAt - input.occurredAt)
    )[0] ?? null;

    this.truths.push({
      id: input.id,
      type: input.type,
      occurredAt: input.occurredAt,
      predicted: best !== null,
      timingErrorSeconds: best ? (best.predictedAt - input.occurredAt) / 1_000 : null,
    });
    if (this.truths.length > OPERATIONAL_TWIN_TRUTH_FIRST_MAX_TRUTHS) {
      this.truths.splice(0, this.truths.length - OPERATIONAL_TWIN_TRUTH_FIRST_MAX_TRUTHS);
    }
  }

  report(now = new Date()): OperationalTwinTruthFirstReport {
    const nowMs = now.getTime();
    this.cleanup(nowMs);
    const cutoff = nowMs - WINDOW_MS;
    const truths = this.truths.filter((item) => item.occurredAt >= cutoff);
    const arrival = truths.filter((item) => item.type === "ARRIVAL_ETA");
    const runway = truths.filter((item) => item.type === "RUNWAY_EXPECTATION");
    const overall = aggregate(truths);
    const first = Math.max(cutoff, this.firstObservedAt ?? nowMs);
    const spanMinutes = Math.max(0, Math.min(OPERATIONAL_TWIN_TRUTH_FIRST_WINDOW_MINUTES, (nowMs - first) / 60_000));
    const complete = spanMinutes >= OPERATIONAL_TWIN_TRUTH_FIRST_THRESHOLDS.minimumSpanMinutes
      && overall.truthEvents >= OPERATIONAL_TWIN_TRUTH_FIRST_THRESHOLDS.minimumTruthEvents;
    const reasons: string[] = [];
    if (spanMinutes < OPERATIONAL_TWIN_TRUTH_FIRST_THRESHOLDS.minimumSpanMinutes) reasons.push("process_window_insufficient");
    if (overall.truthEvents < OPERATIONAL_TWIN_TRUTH_FIRST_THRESHOLDS.minimumTruthEvents) reasons.push("truth_events_insufficient");
    if (complete && (overall.recall ?? 0) < OPERATIONAL_TWIN_TRUTH_FIRST_THRESHOLDS.minimumRecall) reasons.push("recall_low");
    const decision: OperationalTwinTruthFirstDecision = !complete
      ? "WAIT"
      : reasons.includes("recall_low") ? "FAIL" : "PASS";

    return {
      version: OPERATIONAL_TWIN_TRUTH_FIRST_VERSION,
      generatedAt: now.toISOString(),
      scope: "TERMINAL_TRUTH_FIRST_ONLY",
      truthSource: "FLIGHT_INTELLIGENCE_LANDING",
      decision,
      reasons,
      complete,
      spanMinutes,
      thresholds: OPERATIONAL_TWIN_TRUTH_FIRST_THRESHOLDS,
      overall,
      byType: {
        ARRIVAL_ETA: aggregate(arrival),
        RUNWAY_EXPECTATION: aggregate(runway),
      },
      pendingPredictions: this.predictions.filter((item) => item.capturedAt >= cutoff).length,
      limitations: [
        "ARRIVAL_AND_REPORTED_RUNWAY_ONLY",
        "WAYPOINT_SECTOR_WEATHER_RECALL_UNAVAILABLE",
        "PROCESS_LOCAL_EVIDENCE",
      ],
    };
  }

  private cleanup(now: number): void {
    const cutoff = now - WINDOW_MS;
    this.predictions = this.predictions.filter((item) => item.capturedAt >= cutoff);
    if (this.predictions.length > OPERATIONAL_TWIN_TRUTH_FIRST_MAX_PREDICTIONS) {
      this.predictions.splice(0, this.predictions.length - OPERATIONAL_TWIN_TRUTH_FIRST_MAX_PREDICTIONS);
    }
    this.truths = this.truths.filter((item) => item.occurredAt >= cutoff);
    for (const [key, at] of this.lastCaptureAt) if (at < cutoff) this.lastCaptureAt.delete(key);
    for (const [key, at] of this.seenTruthIds) if (at < cutoff) this.seenTruthIds.delete(key);
  }
}
