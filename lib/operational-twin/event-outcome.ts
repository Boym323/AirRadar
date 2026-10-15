import type { Aircraft } from "@/lib/aircraft/types";
import { positionObservedAt } from "@/lib/aircraft/source-merge";
import { computeAtcContext } from "@/lib/atc-context/engine";
import type { PreparedAtcContextDataset } from "@/lib/atc-context/types";
import type { FlightIntelligenceEvent } from "@/lib/intelligence/types";
import type { LandingTerminalEvidenceV1 } from "@/lib/intelligence/terminal-evidence";
import { haversineDistanceKm } from "@/lib/geo";
import { pointInSigmetGeometry } from "@/lib/weather/aircraft-sigmet-context";
import type { SigmetSnapshot } from "@/lib/weather/types";
import { OperationalTwinForensics } from "./forensics";
import type {
  OperationalTwinEvent,
  OperationalTwinEventType,
  OperationalTwinSituation,
} from "./types";

export const OPERATIONAL_TWIN_EVENT_OUTCOME_VERSION = "operational-digital-twin-event-outcome-v2" as const;
export const OPERATIONAL_TWIN_EVENT_OUTCOME_WINDOW_MINUTES = 24 * 60;
export const OPERATIONAL_TWIN_EVENT_OUTCOME_BUCKET_MINUTES = 5;

export const OPERATIONAL_TWIN_EVENT_OUTCOME_SUPPORTED_TYPES = [
  "WAYPOINT",
  "ATC_SECTOR_ENTRY",
  "SIGMET_INTERSECTION",
  "ARRIVAL_ETA",
  "RUNWAY_EXPECTATION",
] as const satisfies readonly OperationalTwinEventType[];

export type OperationalTwinEventOutcomeType = typeof OPERATIONAL_TWIN_EVENT_OUTCOME_SUPPORTED_TYPES[number];
export type OperationalTwinEventOutcomeDecision = "PASS" | "WAIT" | "FAIL";
export type OperationalTwinEventOutcomeReason =
  | "process_window_insufficient"
  | "scoreable_samples_insufficient"
  | "observed_timing_samples_insufficient"
  | "event_type_diversity_insufficient"
  | "prediction_precision_low"
  | "timing_error_high"
  | "truth_coverage_low";

export const OPERATIONAL_TWIN_EVENT_OUTCOME_THRESHOLDS = {
  version: OPERATIONAL_TWIN_EVENT_OUTCOME_VERSION,
  minimumSpanMinutes: 120,
  minimumScoreableSamples: 60,
  minimumObservedTimingSamples: 30,
  minimumEventTypesWithEvidence: 2,
  minimumScoreablePerRepresentedType: 10,
  minimumPrecision: 0.70,
  maximumMeanAbsoluteTimingErrorSeconds: 240,
  maximumMissingTruthRate: 0.40,
} as const;

export const OPERATIONAL_TWIN_WIND_TIMING_GRADUATION_VERSION =
  "operational-digital-twin-wind-timing-graduation-v1" as const;

export const OPERATIONAL_TWIN_WIND_TIMING_GRADUATION_THRESHOLDS = {
  version: OPERATIONAL_TWIN_WIND_TIMING_GRADUATION_VERSION,
  minimumSpanMinutes: 120,
  minimumPairedSamples: 30,
  minimumMeaningfulAdjustments: 20,
  meaningfulAdjustmentSeconds: 30,
  minimumTruthCoverage: 0.60,
  minimumShadowWinRate: 0.55,
  regressionShadowWinRate: 0.45,
  minimumRelativeMaeImprovement: 0.05,
  regressionRelativeMaeImprovement: -0.05,
  tieToleranceSeconds: 5,
} as const;

export type OperationalTwinWindTimingGraduationDecision = "PASS" | "WAIT" | "FAIL";
export type OperationalTwinWindTimingGraduationReason =
  | "process_window_insufficient"
  | "paired_samples_insufficient"
  | "meaningful_adjustments_insufficient"
  | "truth_coverage_low"
  | "benefit_inconclusive"
  | "shadow_regression";

const KM_PER_NM = 1.852;
const CAPTURE_DEDUP_MS = 55_000;
const SPATIAL_EARLY_MS = 5 * 60_000;
const SPATIAL_LATE_MS = 8 * 60_000;
const ARRIVAL_EARLY_MS = 10 * 60_000;
const ARRIVAL_LATE_MS = 15 * 60_000;
const CONTINUITY_TOLERANCE_MS = 90_000;
const WAYPOINT_RADIUS_NM = 3;
const MAX_PENDING = 6_000;
const ATC_CACHE_TTL_MS = 15 * 60_000;
const ATC_CACHE_MAX_ENTRIES = 16_384;
const BUCKET_MS = OPERATIONAL_TWIN_EVENT_OUTCOME_BUCKET_MINUTES * 60_000;
const WINDOW_MS = OPERATIONAL_TWIN_EVENT_OUTCOME_WINDOW_MINUTES * 60_000;
const MAX_BUCKETS = Math.ceil(WINDOW_MS / BUCKET_MS) + 2;

type LeadBucket = "0_5" | "5_15" | "15_30";

interface TruthPoint {
  at: number;
  lat: number;
  lon: number;
  altitudeFt: number | null;
  trackDeg: number | null;
  groundSpeedKt: number | null;
  verticalRateFpm: number | null;
  onGround: boolean;
}

interface TruthTrailState {
  inputFingerprint: string;
  points: TruthPoint[];
  version: number;
  /** Current points whose timestamp/fingerprint was not unchanged. */
  changedIndexes: ReadonlySet<number>;
  /** Older corrections/new observations that must bypass the timestamp cursor. */
  correctionIndexes: ReadonlySet<number>;
}

interface AtcTruthCacheEntry {
  dataset: PreparedAtcContextDataset;
  observedAt: number;
  fingerprint: string;
  ids: ReadonlySet<string>;
  lastUsedAt: number;
}

export interface OperationalTwinAtcCacheStats {
  hits: number;
  misses: number;
  evictions: number;
  expirations: number;
  size: number;
  maxEntries: number;
  ttlMs: number;
}

export interface OperationalTwinEventOutcomeValidatorOptions {
  /** Test/benchmark escape hatch for measuring the uncached baseline. */
  enableAtcTruthCache?: boolean;
  /** Keeps capacity tests deterministic without changing the production limit. */
  atcTruthCacheMaxEntries?: number;
  /** Benchmark-only switch for comparing the pre-incremental truth pass. */
  enableIncrementalTruthEvaluation?: boolean;
  /** Benchmark-only switch for comparing the pre-indexed expiration pass. */
  enableExpiryQueue?: boolean;
}

interface WaypointTruthDescriptor {
  kind: "WAYPOINT";
  lat: number;
  lon: number;
}

interface SectorTruthDescriptor {
  kind: "ATC_SECTOR_ENTRY";
  sectorId: string;
  dataset: PreparedAtcContextDataset;
}

interface SigmetTruthDescriptor {
  kind: "SIGMET_INTERSECTION";
  feature: SigmetSnapshot["features"][number];
}

interface ArrivalTruthDescriptor {
  kind: "ARRIVAL_ETA";
  destination: string | null;
}

interface RunwayTruthDescriptor {
  kind: "RUNWAY_EXPECTATION";
  destination: string | null;
  runway: string;
}

type TruthDescriptor =
  | WaypointTruthDescriptor
  | SectorTruthDescriptor
  | SigmetTruthDescriptor
  | ArrivalTruthDescriptor
  | RunwayTruthDescriptor;

interface PendingEventOutcome {
  id: string;
  captureSequence: number;
  icaoHex: string;
  capturedAt: number;
  predictedAt: number;
  earlyAt: number;
  expiresAt: number;
  leadMinutes: number;
  eventType: OperationalTwinEventOutcomeType;
  semanticKey: string;
  title: string;
  confidence: OperationalTwinEvent["confidence"];
  provenance: OperationalTwinEvent["provenance"];
  descriptor: TruthDescriptor;
  windShadowPredictedAt: number | null;
  windShadowAdjustmentSeconds: number | null;
  truthNearTarget: boolean;
  truthNearExpiry: boolean;
  /** Truth snapshot version last evaluated by this pending event. */
  lastEvaluatedTruthVersion: number | null;
  /** Highest local truth timestamp evaluated by this pending event. */
  lastEvaluatedPointAt: number | null;
  /** Static truth inputs already checked inside a valid event window. */
  checkedStaticTruthContent: Set<string>;
}

export interface OperationalTwinEventOutcomePerformance {
  observeCalls: number;
  aircraftWithPending: number;
  pendingEntriesScanned: number;
  pendingEntriesWithoutNewTruth: number;
  truthPointBuilds: number;
  truthPointsBuilt: number;
  evaluatedTruthPoints: number;
  expiryEntriesScanned: number;
  intelligenceEntriesScanned: number;
}

interface EventAggregate {
  predictions: number;
  observed: number;
  falsePositive: number;
  expiredNoTruth: number;
  unscoreableTruth: number;
  timingSamples: number;
  signedTimingErrorSecondsSum: number;
  absoluteTimingErrorSecondsSum: number;
  within120Seconds: number;
  within300Seconds: number;
}

interface WindTimingComparisonAggregate {
  eligiblePredictions: number;
  pairedSamples: number;
  unpairedResolutions: number;
  meaningfulAdjustments: number;
  canonicalAbsoluteTimingErrorSecondsSum: number;
  shadowAbsoluteTimingErrorSecondsSum: number;
  shadowWins: number;
  canonicalWins: number;
  ties: number;
  absoluteAdjustmentSecondsSum: number;
}

interface OutcomeBucket {
  startMs: number;
  overall: EventAggregate;
  byType: Record<OperationalTwinEventOutcomeType, EventAggregate>;
  byLead: Record<LeadBucket, EventAggregate>;
  windTimingComparison: WindTimingComparisonAggregate;
}


export interface OperationalTwinEventOutcomeCalibrationBucket {
  startMs: number;
  payloadJson: string;
}

function persistedEventNumber(value: unknown, signed = false): number | null {
  return typeof value === "number" && Number.isFinite(value) && (signed || value >= 0) ? value : null;
}

function persistedEventAggregate(value: unknown): EventAggregate | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<EventAggregate>;
  const result: EventAggregate = emptyAggregate();
  for (const key of Object.keys(result) as Array<keyof EventAggregate>) {
    const number = persistedEventNumber(item[key], key === "signedTimingErrorSecondsSum");
    if (number === null) return null;
    result[key] = number;
  }
  return result;
}

function persistedWindComparison(value: unknown): WindTimingComparisonAggregate | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<WindTimingComparisonAggregate>;
  const result = emptyWindTimingComparison();
  for (const key of Object.keys(result) as Array<keyof WindTimingComparisonAggregate>) {
    const number = persistedEventNumber(item[key]);
    if (number === null) return null;
    result[key] = number;
  }
  return result;
}

function persistedEventOutcomeBucket(payloadJson: string, expectedStartMs: number): OutcomeBucket | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadJson);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const item = parsed as Partial<OutcomeBucket>;
  if (item.startMs !== expectedStartMs || expectedStartMs % BUCKET_MS !== 0) return null;
  const overall = persistedEventAggregate(item.overall);
  const windTimingComparison = persistedWindComparison(item.windTimingComparison);
  if (!overall || !windTimingComparison || !item.byType || !item.byLead) return null;

  const byType = typeRecord();
  for (const type of OPERATIONAL_TWIN_EVENT_OUTCOME_SUPPORTED_TYPES) {
    const aggregate = persistedEventAggregate((item.byType as Record<string, unknown>)[type]);
    if (!aggregate) return null;
    byType[type] = aggregate;
  }
  const byLead = leadRecord();
  for (const lead of Object.keys(byLead) as LeadBucket[]) {
    const aggregate = persistedEventAggregate((item.byLead as Record<string, unknown>)[lead]);
    if (!aggregate) return null;
    byLead[lead] = aggregate;
  }
  return { startMs: expectedStartMs, overall, byType, byLead, windTimingComparison };
}

export interface OperationalTwinEventOutcomeSlice {
  predictions: number;
  scoreable: number;
  observed: number;
  falsePositive: number;
  precision: number | null;
  expiredNoTruth: number;
  unscoreableTruth: number;
  missingTruthRate: number | null;
  timingSamples: number;
  meanSignedTimingErrorSeconds: number | null;
  meanAbsoluteTimingErrorSeconds: number | null;
  within120Seconds: number;
  within120SecondsRate: number | null;
  within300Seconds: number;
  within300SecondsRate: number | null;
}

export interface OperationalTwinEventOutcomeCaptureContext {
  atcDataset: PreparedAtcContextDataset | null;
  sigmets: SigmetSnapshot | null;
  destination: string | null;
}

export interface OperationalTwinWindTimingGraduationReport {
  version: typeof OPERATIONAL_TWIN_WIND_TIMING_GRADUATION_VERSION;
  decision: OperationalTwinWindTimingGraduationDecision;
  reasons: OperationalTwinWindTimingGraduationReason[];
  complete: boolean;
  thresholds: typeof OPERATIONAL_TWIN_WIND_TIMING_GRADUATION_THRESHOLDS;
  scope: "WAYPOINT_TIMING_ONLY";
  truthSource: "EVENT_OUTCOME_V2_LOCAL_WAYPOINT_TRUTH";
  autoPromotion: false;
  manualPromotionEligible: boolean;
  canonicalTimingRemainsActive: true;
  eligiblePredictions: number;
  resolvedPredictions: number;
  pendingEligible: number;
  pairedSamples: number;
  unpairedResolutions: number;
  truthCoverage: number | null;
  meaningfulAdjustments: number;
  canonicalMeanAbsoluteTimingErrorSeconds: number | null;
  shadowMeanAbsoluteTimingErrorSeconds: number | null;
  meanImprovementSeconds: number | null;
  relativeMaeImprovement: number | null;
  shadowWins: number;
  canonicalWins: number;
  ties: number;
  shadowWinRate: number | null;
  meanAbsoluteAdjustmentSeconds: number | null;
}

export interface OperationalTwinWindTimingGraduationDecisionInput {
  spanMinutes: number;
  pairedSamples: number;
  meaningfulAdjustments: number;
  truthCoverage: number | null;
  shadowWinRate: number | null;
  relativeMaeImprovement: number | null;
}

export interface OperationalTwinEventOutcomeReport {
  version: typeof OPERATIONAL_TWIN_EVENT_OUTCOME_VERSION;
  generatedAt: string;
  decision: OperationalTwinEventOutcomeDecision;
  reasons: OperationalTwinEventOutcomeReason[];
  complete: boolean;
  thresholds: typeof OPERATIONAL_TWIN_EVENT_OUTCOME_THRESHOLDS;
  truthSources: readonly ["LOCAL_RECEIVER", "FLIGHT_INTELLIGENCE"];
  requestDrivenCapture: true;
  refreshDrivenSampling: true;
  supportedTypes: readonly OperationalTwinEventOutcomeType[];
  recallMeasured: false;
  window: {
    from: string;
    to: string;
    spanMinutes: number;
    bucketMinutes: number;
    buckets: number;
    processLocal: true;
  };
  pending: number;
  duplicateCaptureSkips: number;
  capacityEvictions: number;
  overall: OperationalTwinEventOutcomeSlice;
  byType: Record<OperationalTwinEventOutcomeType, OperationalTwinEventOutcomeSlice>;
  byLeadMinutes: Record<LeadBucket, OperationalTwinEventOutcomeSlice>;
  windTimingGraduation: OperationalTwinWindTimingGraduationReport;
  performance: OperationalTwinEventOutcomePerformance;
}

export interface OperationalTwinEventOutcomeDecisionInput {
  spanMinutes: number;
  overall: OperationalTwinEventOutcomeSlice;
  byType: Record<OperationalTwinEventOutcomeType, OperationalTwinEventOutcomeSlice>;
}

function emptyWindTimingComparison(): WindTimingComparisonAggregate {
  return {
    eligiblePredictions: 0,
    pairedSamples: 0,
    unpairedResolutions: 0,
    meaningfulAdjustments: 0,
    canonicalAbsoluteTimingErrorSecondsSum: 0,
    shadowAbsoluteTimingErrorSecondsSum: 0,
    shadowWins: 0,
    canonicalWins: 0,
    ties: 0,
    absoluteAdjustmentSecondsSum: 0,
  };
}

function addWindTimingComparison(
  target: WindTimingComparisonAggregate,
  source: WindTimingComparisonAggregate,
): void {
  target.eligiblePredictions += source.eligiblePredictions;
  target.pairedSamples += source.pairedSamples;
  target.unpairedResolutions += source.unpairedResolutions;
  target.meaningfulAdjustments += source.meaningfulAdjustments;
  target.canonicalAbsoluteTimingErrorSecondsSum += source.canonicalAbsoluteTimingErrorSecondsSum;
  target.shadowAbsoluteTimingErrorSecondsSum += source.shadowAbsoluteTimingErrorSecondsSum;
  target.shadowWins += source.shadowWins;
  target.canonicalWins += source.canonicalWins;
  target.ties += source.ties;
  target.absoluteAdjustmentSecondsSum += source.absoluteAdjustmentSecondsSum;
}

export function evaluateOperationalTwinWindTimingGraduation(
  input: OperationalTwinWindTimingGraduationDecisionInput,
): {
  decision: OperationalTwinWindTimingGraduationDecision;
  reasons: OperationalTwinWindTimingGraduationReason[];
  complete: boolean;
} {
  const blockers: OperationalTwinWindTimingGraduationReason[] = [];
  if (input.spanMinutes < OPERATIONAL_TWIN_WIND_TIMING_GRADUATION_THRESHOLDS.minimumSpanMinutes) {
    blockers.push("process_window_insufficient");
  }
  if (input.pairedSamples < OPERATIONAL_TWIN_WIND_TIMING_GRADUATION_THRESHOLDS.minimumPairedSamples) {
    blockers.push("paired_samples_insufficient");
  }
  if (input.meaningfulAdjustments < OPERATIONAL_TWIN_WIND_TIMING_GRADUATION_THRESHOLDS.minimumMeaningfulAdjustments) {
    blockers.push("meaningful_adjustments_insufficient");
  }
  if (
    input.truthCoverage === null
    || input.truthCoverage < OPERATIONAL_TWIN_WIND_TIMING_GRADUATION_THRESHOLDS.minimumTruthCoverage
  ) {
    blockers.push("truth_coverage_low");
  }
  if (blockers.length) return { decision: "WAIT", reasons: blockers, complete: false };

  const regression = (
    input.relativeMaeImprovement !== null
    && input.relativeMaeImprovement <= OPERATIONAL_TWIN_WIND_TIMING_GRADUATION_THRESHOLDS.regressionRelativeMaeImprovement
  ) || (
    input.shadowWinRate !== null
    && input.shadowWinRate <= OPERATIONAL_TWIN_WIND_TIMING_GRADUATION_THRESHOLDS.regressionShadowWinRate
  );
  if (regression) return { decision: "FAIL", reasons: ["shadow_regression"], complete: true };

  const beneficial = (
    input.relativeMaeImprovement !== null
    && input.relativeMaeImprovement >= OPERATIONAL_TWIN_WIND_TIMING_GRADUATION_THRESHOLDS.minimumRelativeMaeImprovement
  ) && (
    input.shadowWinRate !== null
    && input.shadowWinRate >= OPERATIONAL_TWIN_WIND_TIMING_GRADUATION_THRESHOLDS.minimumShadowWinRate
  );
  return beneficial
    ? { decision: "PASS", reasons: [], complete: true }
    : { decision: "WAIT", reasons: ["benefit_inconclusive"], complete: true };
}

function emptyAggregate(): EventAggregate {
  return {
    predictions: 0,
    observed: 0,
    falsePositive: 0,
    expiredNoTruth: 0,
    unscoreableTruth: 0,
    timingSamples: 0,
    signedTimingErrorSecondsSum: 0,
    absoluteTimingErrorSecondsSum: 0,
    within120Seconds: 0,
    within300Seconds: 0,
  };
}

function emptyPerformance(): OperationalTwinEventOutcomePerformance {
  return {
    observeCalls: 0,
    aircraftWithPending: 0,
    pendingEntriesScanned: 0,
    pendingEntriesWithoutNewTruth: 0,
    truthPointBuilds: 0,
    truthPointsBuilt: 0,
    evaluatedTruthPoints: 0,
    expiryEntriesScanned: 0,
    intelligenceEntriesScanned: 0,
  };
}

interface PendingExpiryEntry {
  id: string;
  expiresAt: number;
}

interface PendingCaptureEntry {
  id: string;
  capturedAt: number;
  sequence: number;
}

function pushExpiryEntry(queue: PendingExpiryEntry[], entry: PendingExpiryEntry): void {
  queue.push(entry);
  let index = queue.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (queue[parent]!.expiresAt <= entry.expiresAt) break;
    queue[index] = queue[parent]!;
    index = parent;
  }
  queue[index] = entry;
}

function popExpiryEntry(queue: PendingExpiryEntry[]): PendingExpiryEntry | undefined {
  const first = queue[0];
  const last = queue.pop();
  if (!first || !last || queue.length === 0) return first;
  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    if (left >= queue.length) break;
    const right = left + 1;
    const child = right < queue.length && queue[right]!.expiresAt < queue[left]!.expiresAt ? right : left;
    if (queue[child]!.expiresAt >= last.expiresAt) break;
    queue[index] = queue[child]!;
    index = child;
  }
  queue[index] = last;
  return first;
}

function rebuildExpiryQueue(pending: ReadonlyMap<string, PendingEventOutcome>): PendingExpiryEntry[] {
  const queue: PendingExpiryEntry[] = [];
  for (const item of pending.values()) pushExpiryEntry(queue, { id: item.id, expiresAt: item.expiresAt });
  return queue;
}

function pushCaptureEntry(queue: PendingCaptureEntry[], entry: PendingCaptureEntry): void {
  const before = (left: PendingCaptureEntry, right: PendingCaptureEntry) =>
    left.capturedAt < right.capturedAt
    || (left.capturedAt === right.capturedAt && left.sequence < right.sequence);
  queue.push(entry);
  let index = queue.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (!before(entry, queue[parent]!)) break;
    queue[index] = queue[parent]!;
    index = parent;
  }
  queue[index] = entry;
}

function popCaptureEntry(queue: PendingCaptureEntry[]): PendingCaptureEntry | undefined {
  const first = queue[0];
  const last = queue.pop();
  if (!first || !last || queue.length === 0) return first;
  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    if (left >= queue.length) break;
    const right = left + 1;
    const before = (candidate: PendingCaptureEntry, reference: PendingCaptureEntry) =>
      candidate.capturedAt < reference.capturedAt
      || (candidate.capturedAt === reference.capturedAt && candidate.sequence < reference.sequence);
    const child = right < queue.length && before(queue[right]!, queue[left]!) ? right : left;
    if (!before(queue[child]!, last)) break;
    queue[index] = queue[child]!;
    index = child;
  }
  queue[index] = last;
  return first;
}

function rebuildCaptureQueue(pending: ReadonlyMap<string, PendingEventOutcome>): PendingCaptureEntry[] {
  const queue: PendingCaptureEntry[] = [];
  for (const item of pending.values()) {
    pushCaptureEntry(queue, { id: item.id, capturedAt: item.capturedAt, sequence: item.captureSequence });
  }
  return queue;
}

function typeRecord(): Record<OperationalTwinEventOutcomeType, EventAggregate> {
  return {
    WAYPOINT: emptyAggregate(),
    ATC_SECTOR_ENTRY: emptyAggregate(),
    SIGMET_INTERSECTION: emptyAggregate(),
    ARRIVAL_ETA: emptyAggregate(),
    RUNWAY_EXPECTATION: emptyAggregate(),
  };
}

function leadRecord(): Record<LeadBucket, EventAggregate> {
  return {
    "0_5": emptyAggregate(),
    "5_15": emptyAggregate(),
    "15_30": emptyAggregate(),
  };
}

function addAggregate(target: EventAggregate, source: EventAggregate): void {
  target.predictions += source.predictions;
  target.observed += source.observed;
  target.falsePositive += source.falsePositive;
  target.expiredNoTruth += source.expiredNoTruth;
  target.unscoreableTruth += source.unscoreableTruth;
  target.timingSamples += source.timingSamples;
  target.signedTimingErrorSecondsSum += source.signedTimingErrorSecondsSum;
  target.absoluteTimingErrorSecondsSum += source.absoluteTimingErrorSecondsSum;
  target.within120Seconds += source.within120Seconds;
  target.within300Seconds += source.within300Seconds;
}

function aggregateToSlice(value: EventAggregate): OperationalTwinEventOutcomeSlice {
  const scoreable = value.observed + value.falsePositive;
  const truthTotal = scoreable + value.expiredNoTruth + value.unscoreableTruth;
  return {
    predictions: value.predictions,
    scoreable,
    observed: value.observed,
    falsePositive: value.falsePositive,
    precision: scoreable ? Number((value.observed / scoreable).toFixed(4)) : null,
    expiredNoTruth: value.expiredNoTruth,
    unscoreableTruth: value.unscoreableTruth,
    missingTruthRate: truthTotal
      ? Number(((value.expiredNoTruth + value.unscoreableTruth) / truthTotal).toFixed(4))
      : null,
    timingSamples: value.timingSamples,
    meanSignedTimingErrorSeconds: value.timingSamples
      ? Number((value.signedTimingErrorSecondsSum / value.timingSamples).toFixed(1))
      : null,
    meanAbsoluteTimingErrorSeconds: value.timingSamples
      ? Number((value.absoluteTimingErrorSecondsSum / value.timingSamples).toFixed(1))
      : null,
    within120Seconds: value.within120Seconds,
    within120SecondsRate: value.timingSamples
      ? Number((value.within120Seconds / value.timingSamples).toFixed(4))
      : null,
    within300Seconds: value.within300Seconds,
    within300SecondsRate: value.timingSamples
      ? Number((value.within300Seconds / value.timingSamples).toFixed(4))
      : null,
  };
}

export function evaluateOperationalTwinEventOutcomeDecision(
  input: OperationalTwinEventOutcomeDecisionInput,
): { decision: OperationalTwinEventOutcomeDecision; reasons: OperationalTwinEventOutcomeReason[]; complete: boolean } {
  const reasons: OperationalTwinEventOutcomeReason[] = [];
  if (input.spanMinutes < OPERATIONAL_TWIN_EVENT_OUTCOME_THRESHOLDS.minimumSpanMinutes) {
    reasons.push("process_window_insufficient");
  }
  if (input.overall.scoreable < OPERATIONAL_TWIN_EVENT_OUTCOME_THRESHOLDS.minimumScoreableSamples) {
    reasons.push("scoreable_samples_insufficient");
  }
  if (input.overall.timingSamples < OPERATIONAL_TWIN_EVENT_OUTCOME_THRESHOLDS.minimumObservedTimingSamples) {
    reasons.push("observed_timing_samples_insufficient");
  }
  const represented = OPERATIONAL_TWIN_EVENT_OUTCOME_SUPPORTED_TYPES.filter((type) =>
    input.byType[type].scoreable >= OPERATIONAL_TWIN_EVENT_OUTCOME_THRESHOLDS.minimumScoreablePerRepresentedType);
  if (represented.length < OPERATIONAL_TWIN_EVENT_OUTCOME_THRESHOLDS.minimumEventTypesWithEvidence) {
    reasons.push("event_type_diversity_insufficient");
  }

  const complete = reasons.length === 0;
  if (complete) {
    if (
      input.overall.precision === null
      || input.overall.precision < OPERATIONAL_TWIN_EVENT_OUTCOME_THRESHOLDS.minimumPrecision
    ) reasons.push("prediction_precision_low");
    if (
      input.overall.meanAbsoluteTimingErrorSeconds === null
      || input.overall.meanAbsoluteTimingErrorSeconds > OPERATIONAL_TWIN_EVENT_OUTCOME_THRESHOLDS.maximumMeanAbsoluteTimingErrorSeconds
    ) reasons.push("timing_error_high");
    if (
      input.overall.missingTruthRate === null
      || input.overall.missingTruthRate > OPERATIONAL_TWIN_EVENT_OUTCOME_THRESHOLDS.maximumMissingTruthRate
    ) reasons.push("truth_coverage_low");
  }

  return {
    decision: !complete ? "WAIT" : reasons.length ? "FAIL" : "PASS",
    reasons,
    complete,
  };
}

function finite(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function normalizeRunway(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase().replace(/^RWY\s*/, "").replace(/\s+/g, "") ?? "";
  const match = normalized.match(/^(\d{1,2})([LRC]?)$/);
  if (!match) return normalized || null;
  return `${match[1]!.padStart(2, "0")}${match[2] ?? ""}`;
}

function leadBucket(leadMinutes: number): LeadBucket {
  if (leadMinutes <= 5) return "0_5";
  if (leadMinutes <= 15) return "5_15";
  return "15_30";
}

function windowFor(type: OperationalTwinEventOutcomeType): { earlyMs: number; lateMs: number } {
  return type === "ARRIVAL_ETA" || type === "RUNWAY_EXPECTATION"
    ? { earlyMs: ARRIVAL_EARLY_MS, lateMs: ARRIVAL_LATE_MS }
    : { earlyMs: SPATIAL_EARLY_MS, lateMs: SPATIAL_LATE_MS };
}

function eventTypeSupported(type: OperationalTwinEventType): type is OperationalTwinEventOutcomeType {
  return (OPERATIONAL_TWIN_EVENT_OUTCOME_SUPPORTED_TYPES as readonly string[]).includes(type);
}

function waypointSemantic(event: OperationalTwinEvent): string {
  return `${event.title.trim().toUpperCase()}:${event.lat?.toFixed(4) ?? "?"}:${event.lon?.toFixed(4) ?? "?"}`;
}

function sectorForEvent(
  event: OperationalTwinEvent,
  dataset: PreparedAtcContextDataset | null,
): string | null {
  if (!dataset) return null;
  const sector = dataset.sectors.find((candidate) => event.id.startsWith(`sector:${candidate.id}:`));
  return sector?.id ?? null;
}

function sigmetForEvent(
  event: OperationalTwinEvent,
  sigmets: SigmetSnapshot | null,
): SigmetSnapshot["features"][number] | null {
  if (!sigmets) return null;
  return sigmets.features.find((feature) => event.id.startsWith(`sigmet:${feature.id}:`)) ?? null;
}

function windShadowPredictionForWaypoint(
  situation: OperationalTwinSituation,
  event: OperationalTwinEvent,
  generatedAtMs: number,
): { predictedAt: number; adjustmentSeconds: number } | null {
  if (event.type !== "WAYPOINT") return null;
  const shadow = situation.windTimingShadow;
  if (!shadow || shadow.status !== "AVAILABLE") return null;
  if (!finite(event.lat) || !finite(event.lon)) return null;

  const canonicalWaypoint = situation.corridor.waypoints.find((waypoint) =>
    waypoint.name === event.title
    && Math.abs(waypoint.lat - event.lat!) < 1e-5
    && Math.abs(waypoint.lon - event.lon!) < 1e-5
    && Math.abs(waypoint.offsetMinutes - event.offsetMinutes) < 0.11);
  if (!canonicalWaypoint) return null;

  const shadowWaypoint = shadow.waypoints.find((waypoint) => waypoint.id === canonicalWaypoint.id);
  if (!shadowWaypoint || !Number.isFinite(shadowWaypoint.shadowOffsetMinutes)) return null;
  return {
    predictedAt: generatedAtMs + shadowWaypoint.shadowOffsetMinutes * 60_000,
    adjustmentSeconds: shadowWaypoint.deltaSeconds,
  };
}

function descriptorForEvent(
  event: OperationalTwinEvent,
  context: OperationalTwinEventOutcomeCaptureContext,
): { semanticKey: string; descriptor: TruthDescriptor } | null {
  switch (event.type) {
    case "WAYPOINT":
      if (!finite(event.lat) || !finite(event.lon)) return null;
      return {
        semanticKey: waypointSemantic(event),
        descriptor: { kind: "WAYPOINT", lat: event.lat, lon: event.lon },
      };
    case "ATC_SECTOR_ENTRY": {
      const sectorId = sectorForEvent(event, context.atcDataset);
      if (!sectorId || !context.atcDataset) return null;
      return {
        semanticKey: sectorId,
        descriptor: { kind: "ATC_SECTOR_ENTRY", sectorId, dataset: context.atcDataset },
      };
    }
    case "SIGMET_INTERSECTION": {
      const feature = sigmetForEvent(event, context.sigmets);
      if (!feature) return null;
      return {
        semanticKey: feature.id,
        descriptor: { kind: "SIGMET_INTERSECTION", feature },
      };
    }
    case "ARRIVAL_ETA":
      return {
        semanticKey: context.destination ?? event.title,
        descriptor: { kind: "ARRIVAL_ETA", destination: context.destination },
      };
    case "RUNWAY_EXPECTATION": {
      const runway = normalizeRunway(event.title);
      if (!runway) return null;
      return {
        semanticKey: `${context.destination ?? "?"}:${runway}`,
        descriptor: { kind: "RUNWAY_EXPECTATION", destination: context.destination, runway },
      };
    }
    default:
      return null;
  }
}

function altitudeOf(aircraft: Aircraft): number | null {
  if (finite(aircraft.baroAltitude)) return aircraft.baroAltitude;
  if (finite(aircraft.altitude)) return aircraft.altitude;
  if (finite(aircraft.geomAltitude)) return aircraft.geomAltitude;
  return null;
}

function truthPoints(aircraft: Aircraft): TruthPoint[] {
  const result: TruthPoint[] = [];
  const seen = new Set<number>();
  for (const point of aircraft.trail.slice(-120)) {
    const at = Date.parse(point.recordedAt);
    if (!Number.isFinite(at) || seen.has(at)) continue;
    seen.add(at);
    result.push({
      at,
      lat: point.lat,
      lon: point.lon,
      altitudeFt: finite(point.altitude) ? point.altitude : null,
      trackDeg: finite(point.track) ? point.track : null,
      groundSpeedKt: finite(point.groundSpeed) ? point.groundSpeed : null,
      verticalRateFpm: null,
      onGround: false,
    });
  }
  if (finite(aircraft.lat) && finite(aircraft.lon)) {
    const at = positionObservedAt(aircraft);
    if (at !== null && !seen.has(at)) {
      result.push({
        at,
        lat: aircraft.lat,
        lon: aircraft.lon,
        altitudeFt: altitudeOf(aircraft),
        trackDeg: finite(aircraft.track) ? aircraft.track : null,
        groundSpeedKt: finite(aircraft.groundSpeed) ? aircraft.groundSpeed : null,
        verticalRateFpm: finite(aircraft.verticalRate) ? aircraft.verticalRate : null,
        onGround: aircraft.onGround,
      });
    }
  }
  return result.sort((left, right) => left.at - right.at);
}

/**
 * Fingerprint only the source fields that can affect truthPoints(). This lets
 * unchanged refreshes reuse the parsed/sorted trail while still noticing
 * corrections to older points, out-of-order arrivals, truncation and trail
 * replacement even when the newest point did not change.
 */
function truthInputFingerprint(aircraft: Aircraft): string {
  return JSON.stringify([
    aircraft.trail.slice(-120).map((point) => [
      point.recordedAt,
      point.lat,
      point.lon,
      point.altitude,
      point.track,
      point.groundSpeed,
    ]),
    aircraft.lat,
    aircraft.lon,
    aircraft.altitude,
    aircraft.baroAltitude,
    aircraft.geomAltitude,
    aircraft.track,
    aircraft.groundSpeed,
    aircraft.verticalRate,
    aircraft.onGround,
    aircraft.lastSeen,
    aircraft.seenSeconds,
    aircraft.seenPosSeconds,
  ]);
}

function sigmetValidAt(feature: SigmetSnapshot["features"][number], at: number): boolean {
  const from = feature.properties.validFrom ? Date.parse(feature.properties.validFrom) : Number.NEGATIVE_INFINITY;
  const to = feature.properties.validTo ? Date.parse(feature.properties.validTo) : Number.POSITIVE_INFINITY;
  if (feature.properties.validFrom && !Number.isFinite(from)) return false;
  if (feature.properties.validTo && !Number.isFinite(to)) return false;
  return at >= from && at <= to;
}

function altitudeMatches(lowerFt: number | null, upperFt: number | null, altitudeFt: number | null): boolean {
  if (!finite(altitudeFt)) return lowerFt === null && upperFt === null;
  if (lowerFt !== null && altitudeFt < lowerFt) return false;
  if (upperFt !== null && altitudeFt > upperFt) return false;
  return true;
}

function atcInputFingerprint(point: TruthPoint): string {
  return [
    point.lat,
    point.lon,
    point.altitudeFt,
    point.trackDeg,
    point.groundSpeedKt,
    point.verticalRateFpm,
    point.onGround ? 1 : 0,
  ].map((value) => value === null ? "null" : String(value)).join("|");
}

function computeSectorIdsAtPoint(
  point: TruthPoint,
  dataset: PreparedAtcContextDataset,
): ReadonlySet<string> {
  const compute = () => computeAtcContext({
    lat: point.lat,
    lon: point.lon,
    altitude: point.altitudeFt,
    baroAltitude: point.altitudeFt,
    geomAltitude: point.altitudeFt,
    altitudeSource: "baro",
    track: point.trackDeg,
    groundSpeed: point.groundSpeedKt,
    verticalRate: point.verticalRateFpm,
    timestamp: new Date(point.at).toISOString(),
    onGround: point.onGround,
  }, dataset, new Date(point.at));
  const context = forensicsGlobal.measure("atcContextComputation", compute);
  return new Set(context.currentAirspaces.map((airspace) => airspace.id));
}

// Shared diagnostic timer is process-local. Its data is aggregate-only and
// collection remains disabled unless the explicit operator switch is true.
const forensicsGlobalState = globalThis as typeof globalThis & {
  __airRadarOperationalTwinForensics?: OperationalTwinForensics;
};
const forensicsGlobal = forensicsGlobalState.__airRadarOperationalTwinForensics ??=
  new OperationalTwinForensics();

export function getOperationalTwinForensicsReport() {
  return forensicsGlobal.report();
}

function spatialTruthMatches(
  pending: PendingEventOutcome,
  aircraft: Aircraft,
  point: TruthPoint,
  atcTruthCache: AtcTruthCache,
  now: number,
): boolean {
  return forensicsGlobal.measure("spatialTruthMatches", () => spatialTruthMatchesCore(pending, aircraft, point, atcTruthCache, now));
}

function spatialTruthMatchesCore(
  pending: PendingEventOutcome,
  aircraft: Aircraft,
  point: TruthPoint,
  atcTruthCache: AtcTruthCache,
  now: number,
): boolean {
  switch (pending.descriptor.kind) {
    case "WAYPOINT":
      return haversineDistanceKm(
        point.lat,
        point.lon,
        pending.descriptor.lat,
        pending.descriptor.lon,
      ) / KM_PER_NM <= WAYPOINT_RADIUS_NM;
    case "ATC_SECTOR_ENTRY": {
      return atcTruthCache.idsAtPoint(aircraft.icaoHex, point, pending.descriptor.dataset, now).has(pending.descriptor.sectorId);
    }
    case "SIGMET_INTERSECTION":
      return sigmetValidAt(pending.descriptor.feature, point.at)
        && pointInSigmetGeometry(point.lon, point.lat, pending.descriptor.feature.geometry)
        && altitudeMatches(
          pending.descriptor.feature.properties.lowerFt,
          pending.descriptor.feature.properties.upperFt,
          point.altitudeFt,
        );
    default:
      return false;
  }
}

class AtcTruthCache {
  private readonly entries = new Map<string, AtcTruthCacheEntry>();
  private readonly datasetIds = new WeakMap<PreparedAtcContextDataset, number>();
  private nextDatasetId = 1;
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private expirations = 0;
  private lastCleanupAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly enabled = true,
    private readonly maxEntries = ATC_CACHE_MAX_ENTRIES,
  ) {}

  idsAtPoint(_icaoHex: string, point: TruthPoint, dataset: PreparedAtcContextDataset, now = Date.now()): ReadonlySet<string> {
    return forensicsGlobal.measure("atcCacheOperations", () => this.idsAtPointCore(point, dataset, now));
  }

  private idsAtPointCore(point: TruthPoint, dataset: PreparedAtcContextDataset, now: number): ReadonlySet<string> {
    if (!this.enabled) {
      this.misses += 1;
      forensicsGlobal.cache(false);
      return computeSectorIdsAtPoint(point, dataset);
    }

    const datasetId = this.datasetId(dataset);
    // Sector membership is a pure function of the dataset and truth point.
    // Do not include aircraft identity: dense snapshots commonly contain the
    // same sampled point for multiple aircraft and should share the result.
    const key = `${datasetId}:${point.at}`;
    const fingerprint = atcInputFingerprint(point);
    const cached = this.entries.get(key);
    if (cached && cached.dataset === dataset && cached.fingerprint === fingerprint) {
      forensicsGlobal.cache(true);
      cached.lastUsedAt = now;
      this.entries.delete(key);
      this.entries.set(key, cached);
      this.hits += 1;
      return cached.ids;
    }

    this.misses += 1;
    forensicsGlobal.cache(false);
    const entry: AtcTruthCacheEntry = {
      dataset,
      observedAt: point.at,
      fingerprint,
      ids: computeSectorIdsAtPoint(point, dataset),
      lastUsedAt: now,
    };
    this.entries.set(key, entry);
    this.enforceCapacity();
    return entry.ids;
  }

  beginObservation(now: number): void {
    if (!this.enabled || now - this.lastCleanupAt < 1_000) return;
    this.removeExpired(now);
    this.lastCleanupAt = now;
  }

  stats(): OperationalTwinAtcCacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      expirations: this.expirations,
      size: this.entries.size,
      maxEntries: this.maxEntries,
      ttlMs: ATC_CACHE_TTL_MS,
    };
  }

  clear(): void {
    this.entries.clear();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    this.expirations = 0;
    this.lastCleanupAt = Number.NEGATIVE_INFINITY;
  }

  private datasetId(dataset: PreparedAtcContextDataset): number {
    const existing = this.datasetIds.get(dataset);
    if (existing) return existing;
    const id = this.nextDatasetId++;
    this.datasetIds.set(dataset, id);
    return id;
  }

  private removeExpired(now: number): void {
    for (const [key, entry] of this.entries) {
      if (now - entry.lastUsedAt <= ATC_CACHE_TTL_MS) continue;
      this.entries.delete(key);
      this.expirations += 1;
      forensicsGlobal.increment("atcCacheExpirations");
    }
  }

  private enforceCapacity(): void {
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
      this.evictions += 1;
      forensicsGlobal.increment("atcCacheEvictions");
    }
  }
}

function terminalEvidence(event: FlightIntelligenceEvent): LandingTerminalEvidenceV1 | null {
  const value = event.metadata?.terminalEvidence;
  if (!value || typeof value !== "object") return null;
  return value as LandingTerminalEvidenceV1;
}

export class OperationalTwinEventOutcomeValidator {
  private readonly atcTruthCache: AtcTruthCache;
  private readonly enableIncrementalTruthEvaluation: boolean;
  private readonly enableExpiryQueue: boolean;
  private readonly pending = new Map<string, PendingEventOutcome>();
  /**
   * Reverse index for the refresh-driven local truth pass. Pending outcomes
   * can outlive an aircraft's local observation, so scanning the full pending
   * map on every snapshot turns a bounded queue into an avoidable O(P) hot
   * path. Keep the index bounded with the pending map itself.
   */
  private readonly pendingByAircraft = new Map<string, Set<string>>();
  /** Parsed local truth snapshots shared by all pending events for an aircraft. */
  private readonly truthStates = new Map<string, TruthTrailState>();
  /** Expiry order avoids scanning all pending observations on every refresh. */
  private pendingExpiryQueue: PendingExpiryEntry[] = [];
  /** Capture order avoids sorting the bounded pending map on every insertion. */
  private pendingCaptureQueue: PendingCaptureEntry[] = [];
  private readonly lastCaptureAt = new Map<string, number>();
  private buckets: OutcomeBucket[] = [];
  private firstObservedAt: number | null = null;
  private nextCaptureSequence = 1;
  private duplicateCaptureSkips = 0;
  private capacityEvictions = 0;
  private performance = emptyPerformance();
  private lastObserveLocalAt: number | null = null;

  constructor(options: OperationalTwinEventOutcomeValidatorOptions = {}) {
    this.atcTruthCache = new AtcTruthCache(options.enableAtcTruthCache ?? true, options.atcTruthCacheMaxEntries ?? ATC_CACHE_MAX_ENTRIES);
    this.enableIncrementalTruthEvaluation = options.enableIncrementalTruthEvaluation ?? true;
    this.enableExpiryQueue = options.enableExpiryQueue ?? true;
  }

  getAtcCacheStats(): OperationalTwinAtcCacheStats {
    return this.atcTruthCache.stats();
  }

  capture(
    situation: OperationalTwinSituation,
    context: OperationalTwinEventOutcomeCaptureContext,
    now = Date.parse(situation.generatedAt),
  ): void {
    if (!Number.isFinite(now)) return;
    let created = 0;
    for (const event of situation.events) {
      if (!eventTypeSupported(event.type)) continue;
      const predictedAt = Date.parse(event.at);
      if (!Number.isFinite(predictedAt) || predictedAt <= now) continue;
      const descriptor = descriptorForEvent(event, context);
      if (!descriptor) continue;
      const dedupKey = `${situation.aircraft.icaoHex}:${event.type}:${descriptor.semanticKey}`;
      const previous = this.lastCaptureAt.get(dedupKey) ?? Number.NEGATIVE_INFINITY;
      if (now - previous < CAPTURE_DEDUP_MS) {
        this.duplicateCaptureSkips += 1;
        continue;
      }
      const leadMinutes = Math.max(0, (predictedAt - now) / 60_000);
      const windShadowPrediction = windShadowPredictionForWaypoint(situation, event, now);
      const window = windowFor(event.type);
      const id = `${dedupKey}:${now}`;
      const sample: PendingEventOutcome = {
        id,
        captureSequence: this.nextCaptureSequence++,
        icaoHex: situation.aircraft.icaoHex,
        capturedAt: now,
        predictedAt,
        earlyAt: Math.max(now, predictedAt - window.earlyMs),
        expiresAt: predictedAt + window.lateMs,
        leadMinutes,
        eventType: event.type,
        semanticKey: descriptor.semanticKey,
        title: event.title,
        confidence: event.confidence,
        provenance: event.provenance,
        descriptor: descriptor.descriptor,
        windShadowPredictedAt: windShadowPrediction?.predictedAt ?? null,
        windShadowAdjustmentSeconds: windShadowPrediction?.adjustmentSeconds ?? null,
        truthNearTarget: false,
        truthNearExpiry: false,
        lastEvaluatedTruthVersion: null,
        lastEvaluatedPointAt: null,
        checkedStaticTruthContent: new Set(),
      };
      this.pending.set(id, sample);
      forensicsGlobal.increment("captures");
      if (this.enableExpiryQueue) pushExpiryEntry(this.pendingExpiryQueue, { id, expiresAt: sample.expiresAt });
      pushCaptureEntry(this.pendingCaptureQueue, { id, capturedAt: sample.capturedAt, sequence: sample.captureSequence });
      let aircraftPending = this.pendingByAircraft.get(sample.icaoHex);
      if (!aircraftPending) {
        aircraftPending = new Set<string>();
        this.pendingByAircraft.set(sample.icaoHex, aircraftPending);
      }
      aircraftPending.add(id);
      this.lastCaptureAt.set(dedupKey, now);
      this.incrementPrediction(sample);
      created += 1;
    }
    if (created > 0 && this.firstObservedAt === null) this.firstObservedAt = now;
    this.enforceCapacity();
    this.cleanup(now);
  }

  observeLocal(local: ReadonlyMap<string, Aircraft>, now = Date.now()): void {
    if (!Number.isFinite(now)) return;
    if (this.lastObserveLocalAt !== null) forensicsGlobal.recordSnapshotInterval(Math.max(0, now - this.lastObserveLocalAt));
    this.lastObserveLocalAt = now;
    this.performance.observeCalls += 1;
    forensicsGlobal.measure("atcCacheOperations", () => this.atcTruthCache.beginObservation(now));
    forensicsGlobal.measure("pendingTraversal", () => {
    for (const [icaoHex, aircraft] of local) {
      const pendingIds = this.pendingByAircraft.get(icaoHex);
      if (!pendingIds || pendingIds.size === 0) continue;
      this.performance.aircraftWithPending += 1;
      let fullScanPoints: TruthPoint[] | null = null;
      let truthState: TruthTrailState | null = null;
      forensicsGlobal.measure("pendingTruthEvaluation", () => {
      for (const id of pendingIds) {
        this.performance.pendingEntriesScanned += 1;
        const pending = this.pending.get(id);
        if (!pending || pending.descriptor.kind === "ARRIVAL_ETA" || pending.descriptor.kind === "RUNWAY_EXPECTATION") continue;
        if (!this.enableIncrementalTruthEvaluation) {
          if (fullScanPoints === null) {
            fullScanPoints = forensicsGlobal.measure("truthPoints", () => truthPoints(aircraft));
            this.performance.truthPointBuilds += 1;
            this.performance.truthPointsBuilt += fullScanPoints.length;
          }
          const firstPoint = fullScanPoints[0];
          const lastPoint = fullScanPoints.at(-1);
          if (!firstPoint || !lastPoint || lastPoint.at < pending.earlyAt || firstPoint.at > pending.expiresAt) continue;
          for (const point of fullScanPoints) {
            this.performance.evaluatedTruthPoints += 1;
            if (point.at < pending.earlyAt || point.at > pending.expiresAt) continue;
            this.updateContinuity(pending, point.at);
            if (spatialTruthMatches(pending, aircraft, point, this.atcTruthCache, now)) {
              this.resolveObserved(pending, point.at);
              break;
            }
          }
          continue;
        }
        if (truthState === null) {
          const inputFingerprint = forensicsGlobal.measure("truthInputFingerprint", () => truthInputFingerprint(aircraft));
          const previousState = this.truthStates.get(icaoHex);
          if (previousState?.inputFingerprint === inputFingerprint) {
            truthState = previousState;
          } else {
            const points = forensicsGlobal.measure("truthPoints", () => truthPoints(aircraft));
            truthState = forensicsGlobal.measure("truthStateDiff", () => {
              const changedIndexes = new Set<number>();
              const correctionIndexes = new Set<number>();
              const previousByAt = new Map<number, string>();
              const previousContents = new Set<string>();
              if (previousState) {
                for (const previousPoint of previousState.points) {
                  previousByAt.set(previousPoint.at, atcInputFingerprint(previousPoint));
                  previousContents.add(atcInputFingerprint(previousPoint));
                }
                for (const [index, point] of points.entries()) {
                  const fingerprint = atcInputFingerprint(point);
                  const previousFingerprint = previousByAt.get(point.at);
                  if (previousFingerprint === undefined || previousFingerprint !== fingerprint) changedIndexes.add(index);
                  if (point.at <= (previousState.points.at(-1)?.at ?? Number.NEGATIVE_INFINITY)
                    && (previousFingerprint !== undefined && previousFingerprint !== fingerprint
                      || previousFingerprint === undefined && !previousContents.has(fingerprint))) {
                    correctionIndexes.add(index);
                  }
                }
              } else {
                points.forEach((_, index) => changedIndexes.add(index));
              }
              forensicsGlobal.increment("truthInvalidations");
              return {
                inputFingerprint,
                points,
                version: (previousState?.version ?? 0) + 1,
                changedIndexes,
                correctionIndexes,
              };
            }, { detectLongOperation: true });
            this.truthStates.set(icaoHex, truthState);
            this.performance.truthPointBuilds += 1;
            this.performance.truthPointsBuilt += points.length;
          }
        }
        const points = truthState.points;
        const firstPoint = points[0];
        const lastPoint = points.at(-1);
        if (!firstPoint || !lastPoint) continue;
        const previousVersion = pending.lastEvaluatedTruthVersion;
        if (previousVersion === truthState.version) {
          // Keep the cache's observable reuse semantics for repeated snapshots
          // without rescanning the historical trail. This is intentionally a
          // single endpoint check, not a replay of all truth points. A changed
          // older point never reaches this branch because the shared truth
          // snapshot version changes even when the endpoint is unchanged.
          if (lastPoint.at >= pending.earlyAt
            && lastPoint.at <= pending.expiresAt
            && pending.descriptor.kind === "ATC_SECTOR_ENTRY") {
            if (spatialTruthMatches(pending, aircraft, lastPoint, this.atcTruthCache, now)) {
              this.resolveObserved(pending, lastPoint.at);
            }
          }
          this.performance.pendingEntriesWithoutNewTruth += 1;
          continue;
        }
        const previousLastEvaluatedAt = pending.lastEvaluatedPointAt;
        const staticTruth = pending.descriptor.kind === "WAYPOINT"
          || pending.descriptor.kind === "ATC_SECTOR_ENTRY";
        const temporalTruth = pending.descriptor.kind === "SIGMET_INTERSECTION";
        pending.lastEvaluatedTruthVersion = truthState.version;
        pending.lastEvaluatedPointAt = lastPoint.at;
        if (lastPoint.at < pending.earlyAt || firstPoint.at > pending.expiresAt) continue;
        let evaluatedPoints = 0;
        for (let index = 0; index < points.length; index += 1) {
          const point = points[index]!;
          const content = staticTruth ? atcInputFingerprint(point) : null;
          const afterCursor = previousLastEvaluatedAt === null || point.at > previousLastEvaluatedAt;
          const changedBeforeCursor = truthState.correctionIndexes.has(index)
            || (temporalTruth && truthState.changedIndexes.has(index));
          const needsStaticWindowCheck = staticTruth
            && content !== null
            && !pending.checkedStaticTruthContent.has(content);
          const shouldConsiderPoint = afterCursor || changedBeforeCursor || needsStaticWindowCheck;
          if (shouldConsiderPoint) evaluatedPoints += 1;
          if (point.at < pending.earlyAt || point.at > pending.expiresAt) continue;
          this.updateContinuity(pending, point.at);
          if (!shouldConsiderPoint) continue;
          if (staticTruth) {
            if (content === null) continue;
            if (pending.checkedStaticTruthContent.size >= 256) pending.checkedStaticTruthContent.clear();
            pending.checkedStaticTruthContent.add(content);
          }
          if (spatialTruthMatches(pending, aircraft, point, this.atcTruthCache, now)) {
            this.resolveObserved(pending, point.at);
            break;
          }
        }
        this.performance.evaluatedTruthPoints += evaluatedPoints;
      }
      });
    }
    }, { detectLongOperation: true });
    this.expire(now);
    this.cleanup(now);
    if (forensicsGlobal.enabled) {
      forensicsGlobal.recordPopulation(this.pending.size, this.pendingByAircraft.size,
        [...this.pendingByAircraft.values()].map((ids) => ids.size));
    }
  }

  observeIntelligence(events: readonly FlightIntelligenceEvent[], now = Date.now()): void {
    if (!events.length) {
      this.expire(now);
      return;
    }
    for (const event of events) {
      if (event.type !== "LANDING") continue;
      const occurredAt = Date.parse(event.occurredAt);
      if (!Number.isFinite(occurredAt)) continue;
      const pendingIds = this.pendingByAircraft.get(event.icaoHex.toUpperCase()) ?? [];
      for (const id of pendingIds) {
        const pending = this.pending.get(id);
        this.performance.intelligenceEntriesScanned += 1;
        if (!pending) continue;
        if (pending.descriptor.kind !== "ARRIVAL_ETA" && pending.descriptor.kind !== "RUNWAY_EXPECTATION") continue;
        if (occurredAt < pending.earlyAt || occurredAt > pending.expiresAt) continue;
        const observedAirport = event.airportIcao?.trim().toUpperCase() ?? null;
        const predictedDestination = pending.descriptor.destination?.trim().toUpperCase() ?? null;
        if (pending.descriptor.kind === "ARRIVAL_ETA") {
          if (predictedDestination && observedAirport && observedAirport !== predictedDestination) {
            this.resolveFalsePositive(pending);
          } else if (!predictedDestination || !observedAirport || observedAirport === predictedDestination) {
            this.resolveObserved(pending, occurredAt);
          }
          continue;
        }

        const evidence = terminalEvidence(event);
        const observedRunway = normalizeRunway(evidence?.reportedArrivalRunway?.runway);
        if (predictedDestination && observedAirport && observedAirport !== predictedDestination) {
          this.resolveFalsePositive(pending);
        } else if (!observedRunway) {
          this.resolveUnscoreableTruth(pending);
        } else if (observedRunway === pending.descriptor.runway) {
          this.resolveObserved(pending, occurredAt);
        } else {
          this.resolveFalsePositive(pending);
        }
      }
    }
    this.expire(now);
    this.cleanup(now);
  }

  report(now = new Date()): OperationalTwinEventOutcomeReport {
    const nowMs = now.getTime();
    const cutoff = nowMs - WINDOW_MS;
    const buckets = this.buckets.filter((bucket) => bucket.startMs + BUCKET_MS > cutoff);
    const overall = emptyAggregate();
    const byType = typeRecord();
    const byLead = leadRecord();
    const windTimingComparison = emptyWindTimingComparison();
    for (const bucket of buckets) {
      addAggregate(overall, bucket.overall);
      for (const type of OPERATIONAL_TWIN_EVENT_OUTCOME_SUPPORTED_TYPES) addAggregate(byType[type], bucket.byType[type]);
      for (const lead of Object.keys(byLead) as LeadBucket[]) addAggregate(byLead[lead], bucket.byLead[lead]);
      addWindTimingComparison(windTimingComparison, bucket.windTimingComparison);
    }

    const overallSlice = aggregateToSlice(overall);
    const byTypeSlices = Object.fromEntries(
      OPERATIONAL_TWIN_EVENT_OUTCOME_SUPPORTED_TYPES.map((type) => [type, aggregateToSlice(byType[type])]),
    ) as Record<OperationalTwinEventOutcomeType, OperationalTwinEventOutcomeSlice>;
    const byLeadSlices = Object.fromEntries(
      (Object.keys(byLead) as LeadBucket[]).map((lead) => [lead, aggregateToSlice(byLead[lead])]),
    ) as Record<LeadBucket, OperationalTwinEventOutcomeSlice>;
    const first = Math.max(cutoff, this.firstObservedAt ?? nowMs);
    const spanMinutes = Math.max(0, Math.min(OPERATIONAL_TWIN_EVENT_OUTCOME_WINDOW_MINUTES, (nowMs - first) / 60_000));
    const evaluated = evaluateOperationalTwinEventOutcomeDecision({
      spanMinutes,
      overall: overallSlice,
      byType: byTypeSlices,
    });
    const resolvedWindPredictions = windTimingComparison.pairedSamples + windTimingComparison.unpairedResolutions;
    const pendingEligible = [...this.pending.values()].filter((pending) => pending.windShadowPredictedAt !== null).length;
    const truthCoverage = resolvedWindPredictions
      ? windTimingComparison.pairedSamples / resolvedWindPredictions
      : null;
    const canonicalMae = windTimingComparison.pairedSamples
      ? windTimingComparison.canonicalAbsoluteTimingErrorSecondsSum / windTimingComparison.pairedSamples
      : null;
    const shadowMae = windTimingComparison.pairedSamples
      ? windTimingComparison.shadowAbsoluteTimingErrorSecondsSum / windTimingComparison.pairedSamples
      : null;
    const meanImprovementSeconds = canonicalMae !== null && shadowMae !== null
      ? canonicalMae - shadowMae
      : null;
    const relativeMaeImprovement = canonicalMae !== null && canonicalMae > 0 && shadowMae !== null
      ? (canonicalMae - shadowMae) / canonicalMae
      : null;
    const decisive = windTimingComparison.shadowWins + windTimingComparison.canonicalWins;
    const shadowWinRate = decisive ? windTimingComparison.shadowWins / decisive : null;
    const windEvaluated = evaluateOperationalTwinWindTimingGraduation({
      spanMinutes,
      pairedSamples: windTimingComparison.pairedSamples,
      meaningfulAdjustments: windTimingComparison.meaningfulAdjustments,
      truthCoverage,
      shadowWinRate,
      relativeMaeImprovement,
    });
    const windTimingGraduation: OperationalTwinWindTimingGraduationReport = {
      version: OPERATIONAL_TWIN_WIND_TIMING_GRADUATION_VERSION,
      decision: windEvaluated.decision,
      reasons: windEvaluated.reasons,
      complete: windEvaluated.complete,
      thresholds: OPERATIONAL_TWIN_WIND_TIMING_GRADUATION_THRESHOLDS,
      scope: "WAYPOINT_TIMING_ONLY",
      truthSource: "EVENT_OUTCOME_V2_LOCAL_WAYPOINT_TRUTH",
      autoPromotion: false,
      manualPromotionEligible: windEvaluated.decision === "PASS",
      canonicalTimingRemainsActive: true,
      eligiblePredictions: windTimingComparison.eligiblePredictions,
      resolvedPredictions: resolvedWindPredictions,
      pendingEligible,
      pairedSamples: windTimingComparison.pairedSamples,
      unpairedResolutions: windTimingComparison.unpairedResolutions,
      truthCoverage: truthCoverage === null ? null : Number(truthCoverage.toFixed(4)),
      meaningfulAdjustments: windTimingComparison.meaningfulAdjustments,
      canonicalMeanAbsoluteTimingErrorSeconds: canonicalMae === null ? null : Number(canonicalMae.toFixed(1)),
      shadowMeanAbsoluteTimingErrorSeconds: shadowMae === null ? null : Number(shadowMae.toFixed(1)),
      meanImprovementSeconds: meanImprovementSeconds === null ? null : Number(meanImprovementSeconds.toFixed(1)),
      relativeMaeImprovement: relativeMaeImprovement === null ? null : Number(relativeMaeImprovement.toFixed(4)),
      shadowWins: windTimingComparison.shadowWins,
      canonicalWins: windTimingComparison.canonicalWins,
      ties: windTimingComparison.ties,
      shadowWinRate: shadowWinRate === null ? null : Number(shadowWinRate.toFixed(4)),
      meanAbsoluteAdjustmentSeconds: windTimingComparison.pairedSamples
        ? Number((windTimingComparison.absoluteAdjustmentSecondsSum / windTimingComparison.pairedSamples).toFixed(1))
        : null,
    };

    return {
      version: OPERATIONAL_TWIN_EVENT_OUTCOME_VERSION,
      generatedAt: now.toISOString(),
      decision: evaluated.decision,
      reasons: evaluated.reasons,
      complete: evaluated.complete,
      thresholds: OPERATIONAL_TWIN_EVENT_OUTCOME_THRESHOLDS,
      truthSources: ["LOCAL_RECEIVER", "FLIGHT_INTELLIGENCE"],
      requestDrivenCapture: true,
      refreshDrivenSampling: true,
      supportedTypes: OPERATIONAL_TWIN_EVENT_OUTCOME_SUPPORTED_TYPES,
      recallMeasured: false,
      window: {
        from: new Date(first).toISOString(),
        to: now.toISOString(),
        spanMinutes: Number(spanMinutes.toFixed(1)),
        bucketMinutes: OPERATIONAL_TWIN_EVENT_OUTCOME_BUCKET_MINUTES,
        buckets: buckets.length,
        processLocal: true,
      },
      pending: this.pending.size,
      duplicateCaptureSkips: this.duplicateCaptureSkips,
      capacityEvictions: this.capacityEvictions,
      overall: overallSlice,
      byType: byTypeSlices,
      byLeadMinutes: byLeadSlices,
      windTimingGraduation,
      performance: { ...this.performance },
    };
  }


  exportCalibrationBuckets(now = Date.now()): OperationalTwinEventOutcomeCalibrationBucket[] {
    this.cleanup(now);
    const cutoff = now - WINDOW_MS;
    return this.buckets
      .filter((bucket) => bucket.startMs + BUCKET_MS > cutoff)
      .map((bucket) => ({ startMs: bucket.startMs, payloadJson: JSON.stringify(bucket) }));
  }

  hydrateCalibrationBuckets(rows: readonly OperationalTwinEventOutcomeCalibrationBucket[], now = Date.now()): number {
    const cutoff = now - WINDOW_MS;
    const hydrated = new Map<number, OutcomeBucket>();
    let hydratedFromPersistence = 0;
    for (const row of rows) {
      if (!Number.isFinite(row.startMs) || row.startMs + BUCKET_MS <= cutoff || row.startMs > now + BUCKET_MS) continue;
      const bucket = persistedEventOutcomeBucket(row.payloadJson, row.startMs);
      if (bucket) {
        hydrated.set(bucket.startMs, bucket);
        hydratedFromPersistence += 1;
      }
    }
    for (const bucket of this.buckets) {
      if (bucket.startMs + BUCKET_MS > cutoff) hydrated.set(bucket.startMs, bucket);
    }
    this.buckets = [...hydrated.values()]
      .sort((left, right) => left.startMs - right.startMs)
      .slice(-MAX_BUCKETS);
    const earliest = this.buckets[0]?.startMs ?? null;
    if (earliest !== null) this.firstObservedAt = Math.min(this.firstObservedAt ?? earliest, earliest);
    return hydratedFromPersistence;
  }

  reset(): void {
    this.pending.clear();
    this.pendingByAircraft.clear();
    this.truthStates.clear();
    this.pendingExpiryQueue = [];
    this.pendingCaptureQueue = [];
    this.lastCaptureAt.clear();
    this.nextCaptureSequence = 1;
    this.buckets = [];
    this.firstObservedAt = null;
    this.duplicateCaptureSkips = 0;
    this.capacityEvictions = 0;
    this.performance = emptyPerformance();
    this.lastObserveLocalAt = null;
    this.atcTruthCache.clear();
  }

  private updateContinuity(pending: PendingEventOutcome, at: number): void {
    if (Math.abs(at - pending.predictedAt) <= CONTINUITY_TOLERANCE_MS) pending.truthNearTarget = true;
    if (Math.abs(at - pending.expiresAt) <= CONTINUITY_TOLERANCE_MS) pending.truthNearExpiry = true;
  }

  private expire(now: number): void {
    forensicsGlobal.measure("expiryHeap", () => this.expireCore(now), { detectLongOperation: true });
  }

  private expireCore(now: number): void {
    if (!this.enableExpiryQueue) {
      for (const pending of [...this.pending.values()]) {
        this.performance.expiryEntriesScanned += 1;
        if (now <= pending.expiresAt) continue;
        const spatial = pending.descriptor.kind === "WAYPOINT"
          || pending.descriptor.kind === "ATC_SECTOR_ENTRY"
          || pending.descriptor.kind === "SIGMET_INTERSECTION";
        const arrival = pending.descriptor.kind === "ARRIVAL_ETA";
        if ((spatial || arrival) && pending.truthNearTarget && pending.truthNearExpiry) {
          this.resolveFalsePositive(pending);
        } else {
          this.resolveExpiredNoTruth(pending);
        }
      }
      return;
    }
    while (this.pendingExpiryQueue[0] && this.pendingExpiryQueue[0].expiresAt < now) {
      const entry = popExpiryEntry(this.pendingExpiryQueue);
      if (!entry) break;
      this.performance.expiryEntriesScanned += 1;
      const pending = this.pending.get(entry.id);
      if (!pending || pending.expiresAt !== entry.expiresAt) continue;
      const spatial = pending.descriptor.kind === "WAYPOINT"
        || pending.descriptor.kind === "ATC_SECTOR_ENTRY"
        || pending.descriptor.kind === "SIGMET_INTERSECTION";
      const arrival = pending.descriptor.kind === "ARRIVAL_ETA";
      if ((spatial || arrival) && pending.truthNearTarget && pending.truthNearExpiry) {
        this.resolveFalsePositive(pending);
      } else {
        this.resolveExpiredNoTruth(pending);
      }
    }
    const staleLimit = Math.max(1_024, this.pending.size * 2 + 32);
    if (this.pendingExpiryQueue.length > staleLimit) {
      this.pendingExpiryQueue = rebuildExpiryQueue(this.pending);
    }
  }

  private resolveObserved(pending: PendingEventOutcome, observedAt: number): void {
    forensicsGlobal.increment("actualTruthResolutions");
    const timingErrorSeconds = (observedAt - pending.predictedAt) / 1000;
    this.recordWindTimingObserved(pending, observedAt);
    this.recordResolution(pending, "observed", timingErrorSeconds);
  }

  private resolveFalsePositive(pending: PendingEventOutcome): void {
    this.recordResolution(pending, "falsePositive", null);
  }

  private resolveExpiredNoTruth(pending: PendingEventOutcome): void {
    forensicsGlobal.increment("expirations");
    this.recordResolution(pending, "expiredNoTruth", null);
  }

  private resolveUnscoreableTruth(pending: PendingEventOutcome): void {
    this.recordResolution(pending, "unscoreableTruth", null);
  }

  private recordWindTimingObserved(pending: PendingEventOutcome, observedAt: number): void {
    if (pending.windShadowPredictedAt === null || pending.windShadowAdjustmentSeconds === null) return;
    const aggregate = this.bucketFor(pending.capturedAt).windTimingComparison;
    const canonicalError = Math.abs((observedAt - pending.predictedAt) / 1000);
    const shadowError = Math.abs((observedAt - pending.windShadowPredictedAt) / 1000);
    aggregate.pairedSamples += 1;
    aggregate.canonicalAbsoluteTimingErrorSecondsSum += canonicalError;
    aggregate.shadowAbsoluteTimingErrorSecondsSum += shadowError;
    aggregate.absoluteAdjustmentSecondsSum += Math.abs(pending.windShadowAdjustmentSeconds);
    if (
      Math.abs(pending.windShadowAdjustmentSeconds)
      >= OPERATIONAL_TWIN_WIND_TIMING_GRADUATION_THRESHOLDS.meaningfulAdjustmentSeconds
    ) aggregate.meaningfulAdjustments += 1;

    const difference = canonicalError - shadowError;
    if (Math.abs(difference) <= OPERATIONAL_TWIN_WIND_TIMING_GRADUATION_THRESHOLDS.tieToleranceSeconds) {
      aggregate.ties += 1;
    } else if (difference > 0) {
      aggregate.shadowWins += 1;
    } else {
      aggregate.canonicalWins += 1;
    }
  }

  private recordResolution(
    pending: PendingEventOutcome,
    kind: "observed" | "falsePositive" | "expiredNoTruth" | "unscoreableTruth",
    timingErrorSeconds: number | null,
  ): void {
    const bucket = this.bucketFor(pending.capturedAt);
    if (kind !== "observed" && pending.windShadowPredictedAt !== null) {
      bucket.windTimingComparison.unpairedResolutions += 1;
    }
    for (const aggregate of [
      bucket.overall,
      bucket.byType[pending.eventType],
      bucket.byLead[leadBucket(pending.leadMinutes)],
    ]) {
      aggregate[kind] += 1;
      if (kind === "observed" && timingErrorSeconds !== null) {
        aggregate.timingSamples += 1;
        aggregate.signedTimingErrorSecondsSum += timingErrorSeconds;
        aggregate.absoluteTimingErrorSecondsSum += Math.abs(timingErrorSeconds);
        if (Math.abs(timingErrorSeconds) <= 120) aggregate.within120Seconds += 1;
        if (Math.abs(timingErrorSeconds) <= 300) aggregate.within300Seconds += 1;
      }
    }
    this.removePending(pending.id);
  }

  private incrementPrediction(pending: PendingEventOutcome): void {
    const bucket = this.bucketFor(pending.capturedAt);
    bucket.overall.predictions += 1;
    bucket.byType[pending.eventType].predictions += 1;
    bucket.byLead[leadBucket(pending.leadMinutes)].predictions += 1;
    if (pending.windShadowPredictedAt !== null) bucket.windTimingComparison.eligiblePredictions += 1;
  }

  private bucketFor(timestamp: number): OutcomeBucket {
    const startMs = Math.floor(timestamp / BUCKET_MS) * BUCKET_MS;
    let bucket = this.buckets.find((candidate) => candidate.startMs === startMs);
    if (!bucket) {
      bucket = {
        startMs,
        overall: emptyAggregate(),
        byType: typeRecord(),
        byLead: leadRecord(),
        windTimingComparison: emptyWindTimingComparison(),
      };
      this.buckets.push(bucket);
      this.buckets.sort((left, right) => left.startMs - right.startMs);
    }
    return bucket;
  }

  private enforceCapacity(): void {
    forensicsGlobal.measure("capacityEviction", () => this.enforceCapacityCore(), { detectLongOperation: true });
  }

  private enforceCapacityCore(): void {
    while (this.pending.size > MAX_PENDING) {
      const entry = popCaptureEntry(this.pendingCaptureQueue);
      if (!entry) break;
      const oldest = this.pending.get(entry.id);
      if (!oldest || oldest.capturedAt !== entry.capturedAt) continue;
      this.removePending(oldest.id);
      this.capacityEvictions += 1;
      forensicsGlobal.increment("pendingCapacityEvictions");
    }
    const staleLimit = Math.max(1_024, this.pending.size * 2 + 32);
    if (this.pendingCaptureQueue.length > staleLimit) {
      this.pendingCaptureQueue = rebuildCaptureQueue(this.pending);
    }
  }

  private removePending(id: string): PendingEventOutcome | null {
    const pending = this.pending.get(id);
    if (!pending) return null;
    this.pending.delete(id);
    const aircraftPending = this.pendingByAircraft.get(pending.icaoHex);
    aircraftPending?.delete(id);
    if (aircraftPending && aircraftPending.size === 0) {
      this.pendingByAircraft.delete(pending.icaoHex);
      this.truthStates.delete(pending.icaoHex);
    }
    return pending;
  }

  private cleanup(now: number): void {
    forensicsGlobal.measure("cleanup", () => this.cleanupCore(now), { detectLongOperation: true });
  }

  private cleanupCore(now: number): void {
    const cutoff = now - WINDOW_MS - 60 * 60_000;
    this.buckets = this.buckets
      .filter((bucket) => bucket.startMs + BUCKET_MS > cutoff)
      .slice(-MAX_BUCKETS);
    for (const [key, capturedAt] of this.lastCaptureAt) {
      if (capturedAt < now - WINDOW_MS) this.lastCaptureAt.delete(key);
    }
  }
}
