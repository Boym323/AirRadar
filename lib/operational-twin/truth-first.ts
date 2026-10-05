import type { FlightIntelligenceEvent } from "@/lib/intelligence/types";
import type { LandingTerminalEvidenceV1 } from "@/lib/intelligence/terminal-evidence";
import type { RouteIntelligenceV2Snapshot } from "@/lib/route-intelligence";
import { pointInSigmetGeometry } from "@/lib/weather/aircraft-sigmet-context";
import type { SigmetSnapshot } from "@/lib/weather/types";
import type { OperationalTwinEventOutcomeCaptureContext } from "./event-outcome";
import type { OperationalTwinEvent, OperationalTwinSituation } from "./types";

export const OPERATIONAL_TWIN_TRUTH_FIRST_VERSION = "operational-digital-twin-truth-first-v2" as const;
export const OPERATIONAL_TWIN_TRUTH_FIRST_WINDOW_MINUTES = 24 * 60;
export const OPERATIONAL_TWIN_TRUTH_FIRST_MAX_PREDICTIONS = 4_096;
export const OPERATIONAL_TWIN_TRUTH_FIRST_MAX_TRUTHS = 1_024;

const WINDOW_MS = OPERATIONAL_TWIN_TRUTH_FIRST_WINDOW_MINUTES * 60_000;
const MAX_LOOKBACK_MS = 35 * 60_000;
const CAPTURE_DEDUP_MS = 55_000;
const OBSERVATION_CONTINUITY_MS = 10 * 60_000;

export const OPERATIONAL_TWIN_TRUTH_FIRST_TYPES = [
  "WAYPOINT",
  "ATC_SECTOR_ENTRY",
  "SIGMET_INTERSECTION",
  "ARRIVAL_ETA",
  "RUNWAY_EXPECTATION",
] as const;

export type OperationalTwinTruthFirstType = typeof OPERATIONAL_TWIN_TRUTH_FIRST_TYPES[number];
export type OperationalTwinTruthFirstDecision = "PASS" | "WAIT" | "FAIL";

export const OPERATIONAL_TWIN_TRUTH_FIRST_THRESHOLDS = {
  version: OPERATIONAL_TWIN_TRUTH_FIRST_VERSION,
  minimumSpanMinutes: 120,
  minimumTruthEvents: 20,
  minimumTypesWithTruth: 2,
  minimumRecall: 0.70,
} as const;

interface CapturedPrediction {
  id: string;
  icaoHex: string;
  type: OperationalTwinTruthFirstType;
  capturedAt: number;
  predictedAt: number;
  semanticKey: string;
}

interface TruthOutcome {
  id: string;
  type: OperationalTwinTruthFirstType;
  occurredAt: number;
  predicted: boolean;
  timingErrorSeconds: number | null;
}

interface RouteProgressState {
  routeId: string;
  nextPointId: string;
  observedAt: number;
  sessionStartedAt: number;
}

interface SigmetState {
  activeIds: Set<string>;
  observedAt: number;
}

export interface OperationalTwinTruthObservationContext {
  icaoHex: string;
  route: RouteIntelligenceV2Snapshot | null;
  observed: {
    lat: number;
    lon: number;
    altitudeFt: number | null;
  };
  sigmets: SigmetSnapshot | null;
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
  scope: "MULTI_DOMAIN_TRUTH_FIRST";
  truthSources: readonly [
    "FLIGHT_INTELLIGENCE_LANDING",
    "FLIGHT_INTELLIGENCE_AIRSPACE_ENTRY",
    "ROUTE_PROGRESS_TRANSITION",
    "OBSERVED_SIGMET_ENTRY",
  ];
  decision: OperationalTwinTruthFirstDecision;
  reasons: string[];
  complete: boolean;
  spanMinutes: number;
  thresholds: typeof OPERATIONAL_TWIN_TRUTH_FIRST_THRESHOLDS;
  overall: OperationalTwinTruthFirstSlice;
  byType: Record<OperationalTwinTruthFirstType, OperationalTwinTruthFirstSlice>;
  pendingPredictions: number;
  limitations: Array<
    "WAYPOINT_AND_SIGMET_TRUTH_REQUEST_DRIVEN"
    | "PROCESS_LOCAL_EVIDENCE"
    | "NO_PLANNED_AIRSPACE_RECALL"
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
    recall: Number((predictedTruthEvents / outcomes.length).toFixed(4)),
    timingSamples: timing.length,
    meanAbsoluteTimingErrorSeconds: timing.length
      ? Number((timing.reduce((sum, value) => sum + Math.abs(value), 0) / timing.length).toFixed(1))
      : null,
  };
}

function eventScopedId(event: OperationalTwinEvent, prefix: string): string | null {
  if (!event.id.startsWith(prefix)) return null;
  const suffix = `:${event.at}`;
  if (!event.id.endsWith(suffix)) return null;
  return normalize(event.id.slice(prefix.length, -suffix.length));
}

function predictionSemantic(
  event: OperationalTwinEvent,
  context: OperationalTwinEventOutcomeCaptureContext,
): string | null {
  switch (event.type) {
    case "WAYPOINT":
      return eventScopedId(event, "waypoint:");
    case "ATC_SECTOR_ENTRY":
      return eventScopedId(event, "sector:");
    case "SIGMET_INTERSECTION":
      return eventScopedId(event, "sigmet:");
    case "ARRIVAL_ETA":
      return normalize(context.destination);
    case "RUNWAY_EXPECTATION": {
      const destination = normalize(context.destination);
      const runway = normalizeRunway(event.title);
      return destination && runway ? `${destination}:${runway}` : null;
    }
    default:
      return null;
  }
}

function sigmetValidAt(feature: SigmetSnapshot["features"][number], at: number): boolean {
  const from = feature.properties.validFrom ? Date.parse(feature.properties.validFrom) : Number.NEGATIVE_INFINITY;
  const to = feature.properties.validTo ? Date.parse(feature.properties.validTo) : Number.POSITIVE_INFINITY;
  if (feature.properties.validFrom && !Number.isFinite(from)) return false;
  if (feature.properties.validTo && !Number.isFinite(to)) return false;
  return at >= from && at <= to;
}

function sigmetAltitudeMatches(
  feature: SigmetSnapshot["features"][number],
  altitudeFt: number | null,
): boolean {
  const lower = feature.properties.lowerFt;
  const upper = feature.properties.upperFt;
  if (lower === null && upper === null) return true;
  if (altitudeFt === null || !Number.isFinite(altitudeFt)) return false;
  if (lower !== null && altitudeFt < lower) return false;
  if (upper !== null && altitudeFt > upper) return false;
  return true;
}

export class OperationalTwinTruthFirstValidator {
  private predictions: CapturedPrediction[] = [];
  private truths: TruthOutcome[] = [];
  private readonly lastCaptureAt = new Map<string, number>();
  private readonly seenTruthIds = new Map<string, number>();
  private readonly routeProgress = new Map<string, RouteProgressState>();
  private readonly sigmetState = new Map<string, SigmetState>();
  private firstObservedAt: number | null = null;

  capture(
    situation: OperationalTwinSituation,
    context: OperationalTwinEventOutcomeCaptureContext,
    now = Date.parse(situation.generatedAt),
  ): void {
    if (!Number.isFinite(now)) return;
    const icaoHex = situation.aircraft.icaoHex.toUpperCase();
    for (const event of situation.events) {
      if (!OPERATIONAL_TWIN_TRUTH_FIRST_TYPES.includes(event.type as OperationalTwinTruthFirstType)) continue;
      const predictedAt = Date.parse(event.at);
      if (!Number.isFinite(predictedAt) || predictedAt <= now) continue;
      const semanticKey = predictionSemantic(event, context);
      if (!semanticKey) continue;
      const type = event.type as OperationalTwinTruthFirstType;
      const key = `${icaoHex}:${type}:${semanticKey}`;
      const previous = this.lastCaptureAt.get(key) ?? Number.NEGATIVE_INFINITY;
      if (now - previous < CAPTURE_DEDUP_MS) continue;
      this.lastCaptureAt.set(key, now);
      this.predictions.push({
        id: `${key}:${now}`,
        icaoHex,
        type,
        capturedAt: now,
        predictedAt,
        semanticKey,
      });
    }
    this.firstObservedAt ??= now;
    this.cleanup(now);
  }

  observeContext(input: OperationalTwinTruthObservationContext, now = Date.now()): void {
    if (!Number.isFinite(now)) return;
    this.observeRouteProgress(input.icaoHex, input.route, now);
    this.observeSigmetContext(input.icaoHex, input.observed, input.sigmets, now);
    this.firstObservedAt ??= now;
    this.cleanup(now);
  }

  observeIntelligence(events: readonly FlightIntelligenceEvent[], now = Date.now()): void {
    for (const event of events) {
      const occurredAt = Date.parse(event.occurredAt);
      if (!Number.isFinite(occurredAt)) continue;
      const icaoHex = event.icaoHex.toUpperCase();
      const truthBaseId = event.lifecycleKey || event.eventKey || event.id;

      if (event.type === "AIRSPACE_ENTRY") {
        const sectorId = normalize(event.sectorId);
        if (sectorId) {
          this.recordTruth({
            id: `sector:${truthBaseId}:${sectorId}`,
            type: "ATC_SECTOR_ENTRY",
            icaoHex,
            occurredAt,
            semanticKey: sectorId,
          });
        }
        continue;
      }

      if (event.type !== "LANDING") continue;
      const destination = normalize(event.airportIcao);
      if (destination) {
        this.recordTruth({
          id: `arrival:${truthBaseId}`,
          type: "ARRIVAL_ETA",
          icaoHex,
          occurredAt,
          semanticKey: destination,
        });
      }

      const evidence = terminalEvidence(event);
      const reportedRunway = normalizeRunway(evidence?.reportedArrivalRunway?.runway);
      if (destination && reportedRunway) {
        this.recordTruth({
          id: `runway:${truthBaseId}:${reportedRunway}`,
          type: "RUNWAY_EXPECTATION",
          icaoHex,
          occurredAt,
          semanticKey: `${destination}:${reportedRunway}`,
        });
      }
    }
    this.firstObservedAt ??= Number.isFinite(now) ? now : Date.now();
    this.cleanup(Number.isFinite(now) ? now : Date.now());
  }

  private observeRouteProgress(
    icaoHexRaw: string,
    route: RouteIntelligenceV2Snapshot | null,
    now: number,
  ): void {
    if (!route || route.dynamic.routeAdherence === "OFF_ROUTE") return;
    const nextPoint = route.dynamic.nextPoint;
    if (!nextPoint) return;
    const icaoHex = icaoHexRaw.toUpperCase();
    const nextPointId = normalize(nextPoint.id);
    if (!nextPointId) return;
    const previous = this.routeProgress.get(icaoHex);
    if (
      !previous
      || previous.routeId !== route.route.id
      || now - previous.observedAt > OBSERVATION_CONTINUITY_MS
    ) {
      this.routeProgress.set(icaoHex, {
        routeId: route.route.id,
        nextPointId,
        observedAt: now,
        sessionStartedAt: now,
      });
      return;
    }

    if (previous.nextPointId !== nextPointId) {
      this.recordTruth({
        id: `waypoint:${icaoHex}:${previous.routeId}:${previous.sessionStartedAt}:${previous.nextPointId}`,
        type: "WAYPOINT",
        icaoHex,
        occurredAt: now,
        semanticKey: previous.nextPointId,
      });
    }
    this.routeProgress.set(icaoHex, {
      routeId: route.route.id,
      nextPointId,
      observedAt: now,
      sessionStartedAt: previous.sessionStartedAt,
    });
  }

  private observeSigmetContext(
    icaoHexRaw: string,
    observed: OperationalTwinTruthObservationContext["observed"],
    sigmets: SigmetSnapshot | null,
    now: number,
  ): void {
    if (!sigmets || !Number.isFinite(observed.lat) || !Number.isFinite(observed.lon)) return;
    const icaoHex = icaoHexRaw.toUpperCase();
    const activeFeatures = sigmets.features.filter((feature) =>
      sigmetValidAt(feature, now)
      && sigmetAltitudeMatches(feature, observed.altitudeFt)
      && pointInSigmetGeometry(observed.lon, observed.lat, feature.geometry)
    );
    const activeIds = new Set(activeFeatures.map((feature) => normalize(feature.id)).filter((id): id is string => id !== null));
    const previous = this.sigmetState.get(icaoHex);
    if (!previous || now - previous.observedAt > OBSERVATION_CONTINUITY_MS) {
      this.sigmetState.set(icaoHex, { activeIds, observedAt: now });
      return;
    }

    for (const feature of activeFeatures) {
      const semanticKey = normalize(feature.id);
      if (!semanticKey || previous.activeIds.has(semanticKey)) continue;
      const validFrom = normalize(feature.properties.validFrom) ?? "OPEN";
      this.recordTruth({
        id: `sigmet:${icaoHex}:${semanticKey}:${validFrom}`,
        type: "SIGMET_INTERSECTION",
        icaoHex,
        occurredAt: now,
        semanticKey,
      });
    }
    this.sigmetState.set(icaoHex, { activeIds, observedAt: now });
  }

  private recordTruth(input: {
    id: string;
    type: OperationalTwinTruthFirstType;
    icaoHex: string;
    occurredAt: number;
    semanticKey: string;
  }): void {
    if (this.seenTruthIds.has(input.id)) return;
    this.seenTruthIds.set(input.id, input.occurredAt);

    const candidates = this.predictions.filter((prediction) =>
      prediction.icaoHex === input.icaoHex
      && prediction.type === input.type
      && prediction.semanticKey === input.semanticKey
      && prediction.capturedAt < input.occurredAt
      && input.occurredAt - prediction.capturedAt <= MAX_LOOKBACK_MS
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
    const overall = aggregate(truths);
    const byType = Object.fromEntries(
      OPERATIONAL_TWIN_TRUTH_FIRST_TYPES.map((type) => [type, aggregate(truths.filter((item) => item.type === type))]),
    ) as Record<OperationalTwinTruthFirstType, OperationalTwinTruthFirstSlice>;
    const first = Math.max(cutoff, this.firstObservedAt ?? nowMs);
    const spanMinutes = Math.max(0, Math.min(OPERATIONAL_TWIN_TRUTH_FIRST_WINDOW_MINUTES, (nowMs - first) / 60_000));
    const representedTypes = OPERATIONAL_TWIN_TRUTH_FIRST_TYPES.filter((type) => byType[type].truthEvents > 0).length;
    const complete = spanMinutes >= OPERATIONAL_TWIN_TRUTH_FIRST_THRESHOLDS.minimumSpanMinutes
      && overall.truthEvents >= OPERATIONAL_TWIN_TRUTH_FIRST_THRESHOLDS.minimumTruthEvents
      && representedTypes >= OPERATIONAL_TWIN_TRUTH_FIRST_THRESHOLDS.minimumTypesWithTruth;
    const reasons: string[] = [];
    if (spanMinutes < OPERATIONAL_TWIN_TRUTH_FIRST_THRESHOLDS.minimumSpanMinutes) reasons.push("process_window_insufficient");
    if (overall.truthEvents < OPERATIONAL_TWIN_TRUTH_FIRST_THRESHOLDS.minimumTruthEvents) reasons.push("truth_events_insufficient");
    if (representedTypes < OPERATIONAL_TWIN_TRUTH_FIRST_THRESHOLDS.minimumTypesWithTruth) reasons.push("truth_type_diversity_insufficient");
    if (complete && (overall.recall ?? 0) < OPERATIONAL_TWIN_TRUTH_FIRST_THRESHOLDS.minimumRecall) reasons.push("recall_low");
    const decision: OperationalTwinTruthFirstDecision = !complete
      ? "WAIT"
      : reasons.includes("recall_low") ? "FAIL" : "PASS";

    return {
      version: OPERATIONAL_TWIN_TRUTH_FIRST_VERSION,
      generatedAt: now.toISOString(),
      scope: "MULTI_DOMAIN_TRUTH_FIRST",
      truthSources: [
        "FLIGHT_INTELLIGENCE_LANDING",
        "FLIGHT_INTELLIGENCE_AIRSPACE_ENTRY",
        "ROUTE_PROGRESS_TRANSITION",
        "OBSERVED_SIGMET_ENTRY",
      ],
      decision,
      reasons,
      complete,
      spanMinutes,
      thresholds: OPERATIONAL_TWIN_TRUTH_FIRST_THRESHOLDS,
      overall,
      byType,
      pendingPredictions: this.predictions.filter((item) => item.capturedAt >= cutoff).length,
      limitations: [
        "WAYPOINT_AND_SIGMET_TRUTH_REQUEST_DRIVEN",
        "PROCESS_LOCAL_EVIDENCE",
        "NO_PLANNED_AIRSPACE_RECALL",
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
    for (const [key, state] of this.routeProgress) if (state.observedAt < cutoff) this.routeProgress.delete(key);
    for (const [key, state] of this.sigmetState) if (state.observedAt < cutoff) this.sigmetState.delete(key);
  }
}
