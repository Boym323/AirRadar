import { Temporal } from "temporal-polyfill";
import { getPrisma } from "@/lib/server/db";
import { trackDbOperation } from "@/lib/server/db-operation-diagnostics";
import {
  evaluatePredictiveReadiness,
  PREDICTIVE_READINESS_THRESHOLDS,
  type PredictiveReadinessEvidence,
  type PredictiveReadinessEvaluation,
} from "@/lib/predictive-intelligence/readiness";
import { getPredictiveGraduationPolicy, type PredictiveGraduationPolicy } from "@/lib/predictive-intelligence/graduation";
import { scoreEta, scoreRunway, summarizeEta } from "@/lib/predictive-intelligence/validation";

export const PREDICTIVE_READINESS_WINDOW_DAYS = 30;
export const PREDICTIVE_READINESS_OBSERVATION_LIMIT = 15_000;
export const PREDICTIVE_READINESS_LANDING_LIMIT = 2_500;
export const PREDICTIVE_READINESS_CACHE_MS = 5 * 60_000;
const CAPTURE_STALE_AFTER_MS = 45_000;
const MATCH_AFTER_PREDICTION_LIMIT_MS = 6 * 60 * 60_000;

type Capability = keyof PredictiveGraduationPolicy;

export interface PredictiveReadinessObservationRow {
  observationKey: string;
  lifecycleKey: string;
  capability: string;
  aircraftIcao: string;
  flightId: number | null;
  predictedAt: unknown;
  predictedLandingAt: unknown;
  predictedRunway: string | null;
  previousRunway: string | null;
  evidenceJson: string;
  createdAt: unknown;
}

export interface PredictiveReadinessLandingEventRow {
  eventKey: string;
  icaoHex: string;
  flightId: number | null;
  occurredAt: unknown;
  metadataJson: string | null;
}

interface Query<Row> {
  where(filter: Record<string, unknown>): Query<Row>;
  orderBy(order: unknown): Query<Row>;
  limit(value: number): Query<Row>;
  all(): Promise<Row[]>;
}

interface ReadinessSchema {
  PredictiveObservation: Query<PredictiveReadinessObservationRow>;
  FlightEvent: Query<PredictiveReadinessLandingEventRow>;
}

interface TerminalEvidenceLike {
  groundConfirmation?: { observedAt?: unknown } | null;
  reportedArrivalRunway?: { runway?: unknown } | null;
}

interface LandingMetadata {
  lifecycleKey: string | null;
  terminalEvidence: TerminalEvidenceLike | null;
}

interface LandingTruth {
  lifecycleKey: string;
  aircraftIcao: string;
  flightId: number | null;
  occurredAtMs: number;
  landingAtMs: number | null;
  reportedRunway: string | null;
}

export interface PredictiveReadinessReport {
  source: "postgres" | "unavailable";
  generatedAt: string;
  window: { from: string; to: string; days: number };
  complete: boolean;
  limits: { observations: number; landingEvents: number };
  configuredPolicy: PredictiveGraduationPolicy;
  effectivePolicy: PredictiveGraduationPolicy;
  thresholds: typeof PREDICTIVE_READINESS_THRESHOLDS;
  collection: {
    observations: number;
    landingEvents: number;
    matchedLandingTruth: number;
    captureStaleObservations: number;
  };
  integrity: PredictiveReadinessEvidence["integrity"];
  capabilities: PredictiveReadinessEvaluation["capabilities"];
}

let cached: { expiresAt: number; report: PredictiveReadinessReport } | null = null;

function epochMs(value: unknown): number | null {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }
  if (typeof value === "string") {
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : null;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value && typeof value === "object") {
    const record = value as { epochMilliseconds?: unknown; toString?: () => string };
    if (typeof record.epochMilliseconds === "number" && Number.isFinite(record.epochMilliseconds)) return record.epochMilliseconds;
    if (typeof record.toString === "function") {
      const time = Date.parse(record.toString());
      return Number.isFinite(time) ? time : null;
    }
  }
  return null;
}

function safeMetadata(value: string | null): LandingMetadata {
  if (!value || value.length > 32_768) return { lifecycleKey: null, terminalEvidence: null };
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const lifecycleKey = typeof parsed.lifecycleKey === "string" && parsed.lifecycleKey.length <= 160
      ? parsed.lifecycleKey
      : null;
    const terminalEvidence = parsed.terminalEvidence && typeof parsed.terminalEvidence === "object"
      ? parsed.terminalEvidence as TerminalEvidenceLike
      : null;
    return { lifecycleKey, terminalEvidence };
  } catch {
    return { lifecycleKey: null, terminalEvidence: null };
  }
}

function runway(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase().replace(/^RWY\s*/, "");
  return /^(?:0?[1-9]|[12]\d|3[0-6])[LCR]?$/.test(normalized)
    ? normalized.replace(/^(\d)(?=[LCR]?$)/, "0$1")
    : null;
}

function landingTruth(row: PredictiveReadinessLandingEventRow): LandingTruth | null {
  const metadata = safeMetadata(row.metadataJson);
  if (!metadata.lifecycleKey) return null;
  const occurredAtMs = epochMs(row.occurredAt);
  if (occurredAtMs === null) return null;
  const landingAtMs = epochMs(metadata.terminalEvidence?.groundConfirmation?.observedAt);
  const reportedRunway = runway(metadata.terminalEvidence?.reportedArrivalRunway?.runway);
  return {
    lifecycleKey: metadata.lifecycleKey,
    aircraftIcao: row.icaoHex.toUpperCase(),
    flightId: row.flightId,
    occurredAtMs,
    landingAtMs,
    reportedRunway,
  };
}

function trajectoryState(row: PredictiveReadinessObservationRow): "NORMAL" | "POSSIBLE_DEVIATION" | "DEVIATING" | null {
  if (!row.evidenceJson || row.evidenceJson.length > 16_384) return null;
  try {
    const evidence = JSON.parse(row.evidenceJson) as unknown;
    if (!Array.isArray(evidence)) return null;
    for (const item of evidence.slice(0, 16)) {
      if (!item || typeof item !== "object") continue;
      const record = item as { key?: unknown; value?: unknown };
      if (record.key !== "trajectoryState") continue;
      return record.value === "NORMAL" || record.value === "POSSIBLE_DEVIATION" || record.value === "DEVIATING"
        ? record.value
        : null;
    }
  } catch {
    return null;
  }
  return null;
}

function staleRate(rows: readonly PredictiveReadinessObservationRow[]): number | null {
  if (!rows.length) return null;
  let eligible = 0;
  let stale = 0;
  for (const row of rows) {
    const predictedAt = epochMs(row.predictedAt);
    const createdAt = epochMs(row.createdAt);
    if (predictedAt === null || createdAt === null) continue;
    eligible += 1;
    if (createdAt - predictedAt > CAPTURE_STALE_AFTER_MS) stale += 1;
  }
  return eligible ? stale / eligible : null;
}

function configuredPublic(policy: PredictiveGraduationPolicy): boolean {
  return Object.values(policy).some((value) => value === "PUBLIC");
}

export function enforcePredictiveReadiness(
  configured: PredictiveGraduationPolicy,
  evaluation: PredictiveReadinessEvaluation,
): PredictiveGraduationPolicy {
  const effective = { ...configured };
  for (const capability of Object.keys(effective) as Capability[]) {
    if (effective[capability] === "PUBLIC" && evaluation.capabilities[capability].decision !== "PASS") {
      effective[capability] = "SHADOW";
    }
  }
  return effective;
}

function emptyEvidence(): PredictiveReadinessEvidence {
  return {
    ETA: {
      observations: 0,
      scoreableObservations: 0,
      independentTruthFlights: 0,
      medianAbsoluteErrorSeconds: null,
      p90AbsoluteErrorSeconds: null,
      p95AbsoluteErrorSeconds: null,
      captureStaleRate: null,
    },
    RUNWAY: {
      observations: 0,
      scoreableObservations: 0,
      independentTruthFlights: 0,
      exactEndAccuracy: null,
      coverage: null,
      captureStaleRate: null,
    },
    RUNWAY_CHANGE: {
      observations: 0,
      scoreableObservations: 0,
      independentTruthFlights: 0,
      outcomePrecision: null,
      falsePositiveRate: null,
      independentChangeTruthAvailable: false,
      captureStaleRate: null,
    },
    TRAJECTORY: {
      observations: 0,
      candidateObservations: null,
      validatedCandidates: 0,
      precision: null,
      stateCaptureAvailable: false,
      independentOutcomeTruthAvailable: false,
      captureStaleRate: null,
    },
    integrity: {
      crossIcaoLifecycleConflicts: 0,
      crossFlightLifecycleConflicts: 0,
    },
  };
}

function unavailableReport(now: Date): PredictiveReadinessReport {
  const to = now.getTime();
  const from = to - PREDICTIVE_READINESS_WINDOW_DAYS * 86_400_000;
  const evidence = emptyEvidence();
  const capabilities = evaluatePredictiveReadiness(evidence, { complete: false });
  const configuredPolicy = getPredictiveGraduationPolicy();
  return {
    source: "unavailable",
    generatedAt: now.toISOString(),
    window: { from: new Date(from).toISOString(), to: now.toISOString(), days: PREDICTIVE_READINESS_WINDOW_DAYS },
    complete: false,
    limits: { observations: PREDICTIVE_READINESS_OBSERVATION_LIMIT, landingEvents: PREDICTIVE_READINESS_LANDING_LIMIT },
    configuredPolicy,
    effectivePolicy: enforcePredictiveReadiness(configuredPolicy, capabilities),
    thresholds: PREDICTIVE_READINESS_THRESHOLDS,
    collection: { observations: 0, landingEvents: 0, matchedLandingTruth: 0, captureStaleObservations: 0 },
    integrity: evidence.integrity,
    capabilities: capabilities.capabilities,
  };
}

export function buildPredictiveReadinessEvidence(observations: readonly PredictiveReadinessObservationRow[], landingRows: readonly PredictiveReadinessLandingEventRow[]): {
  evidence: PredictiveReadinessEvidence;
  matchedLandingTruth: number;
  captureStaleObservations: number;
} {
  const truths = landingRows.flatMap((row) => {
    const truth = landingTruth(row);
    return truth ? [truth] : [];
  });
  const byLifecycle = new Map<string, LandingTruth>();
  const byFlight = new Map<number, LandingTruth>();
  for (const truth of truths.sort((left, right) => right.occurredAtMs - left.occurredAtMs)) {
    if (!byLifecycle.has(truth.lifecycleKey)) byLifecycle.set(truth.lifecycleKey, truth);
    if (truth.flightId !== null && !byFlight.has(truth.flightId)) byFlight.set(truth.flightId, truth);
  }

  const lifecycleIcaos = new Map<string, Set<string>>();
  const lifecycleFlights = new Map<string, Set<number>>();
  for (const observation of observations) {
    const icaos = lifecycleIcaos.get(observation.lifecycleKey) ?? new Set<string>();
    icaos.add(observation.aircraftIcao.toUpperCase());
    lifecycleIcaos.set(observation.lifecycleKey, icaos);
    if (observation.flightId !== null) {
      const flights = lifecycleFlights.get(observation.lifecycleKey) ?? new Set<number>();
      flights.add(observation.flightId);
      lifecycleFlights.set(observation.lifecycleKey, flights);
    }
  }
  for (const truth of truths) {
    const icaos = lifecycleIcaos.get(truth.lifecycleKey) ?? new Set<string>();
    icaos.add(truth.aircraftIcao);
    lifecycleIcaos.set(truth.lifecycleKey, icaos);
    if (truth.flightId !== null) {
      const flights = lifecycleFlights.get(truth.lifecycleKey) ?? new Set<number>();
      flights.add(truth.flightId);
      lifecycleFlights.set(truth.lifecycleKey, flights);
    }
  }
  const integrity = {
    crossIcaoLifecycleConflicts: [...lifecycleIcaos.values()].filter((values) => values.size > 1).length,
    crossFlightLifecycleConflicts: [...lifecycleFlights.values()].filter((values) => values.size > 1).length,
  };

  const matchedTruth = (row: PredictiveReadinessObservationRow): LandingTruth | null => {
    const predictedAt = epochMs(row.predictedAt);
    if (predictedAt === null) return null;
    const candidate = byLifecycle.get(row.lifecycleKey)
      ?? (row.flightId !== null ? byFlight.get(row.flightId) : undefined)
      ?? null;
    if (!candidate) return null;
    if (candidate.aircraftIcao !== row.aircraftIcao.toUpperCase()) return null;
    if (candidate.occurredAtMs < predictedAt || candidate.occurredAtMs - predictedAt > MATCH_AFTER_PREDICTION_LIMIT_MS) return null;
    return candidate;
  };

  const byCapability = (capability: Capability) => observations.filter((row) => row.capability === capability);
  const etaRows = byCapability("ETA");
  const runwayRows = byCapability("RUNWAY");
  const changeRows = byCapability("RUNWAY_CHANGE");
  const trajectoryRows = byCapability("TRAJECTORY");

  const etaScores = etaRows.map((row) => {
    const truth = matchedTruth(row);
    return scoreEta(epochMs(row.predictedLandingAt), truth?.landingAtMs ?? null, truth?.landingAtMs !== null && truth?.landingAtMs !== undefined ? "CONFIRMED" : "UNKNOWN");
  });
  const etaSummary = summarizeEta(etaScores);
  const etaTruthFlights = new Set(
    etaRows.flatMap((row) => {
      const truth = matchedTruth(row);
      return truth?.landingAtMs !== null && truth?.landingAtMs !== undefined ? [truth.lifecycleKey] : [];
    }),
  );

  const runwayScores = runwayRows.map((row) => {
    const truth = matchedTruth(row);
    return scoreRunway(row.predictedRunway, truth?.reportedRunway ?? null, truth?.reportedRunway ? "CONFIRMED" : "UNKNOWN");
  });
  const scoreableRunway = runwayScores.filter((result) => result.status === "SCORED");
  const runwayTruthFlights = new Set(
    runwayRows.flatMap((row) => {
      const truth = matchedTruth(row);
      return truth?.reportedRunway ? [truth.lifecycleKey] : [];
    }),
  );
  const exactRunway = scoreableRunway.filter((result) => result.exactEnd === true).length;

  const changeScores = changeRows.map((row) => {
    const truth = matchedTruth(row);
    return scoreRunway(row.predictedRunway, truth?.reportedRunway ?? null, truth?.reportedRunway ? "CONFIRMED" : "UNKNOWN");
  });
  const scoreableChange = changeScores.filter((result) => result.status === "SCORED");
  const correctChangeOutcome = scoreableChange.filter((result) => result.exactEnd === true).length;
  const changeTruthFlights = new Set(
    changeRows.flatMap((row) => {
      const truth = matchedTruth(row);
      return truth?.reportedRunway ? [truth.lifecycleKey] : [];
    }),
  );

  const matchedLandingTruth = observations.filter((row) => matchedTruth(row) !== null).length;
  let captureStaleObservations = 0;
  for (const row of observations) {
    const predictedAt = epochMs(row.predictedAt);
    const createdAt = epochMs(row.createdAt);
    if (predictedAt !== null && createdAt !== null && createdAt - predictedAt > CAPTURE_STALE_AFTER_MS) captureStaleObservations += 1;
  }

  const evidence: PredictiveReadinessEvidence = {
    ETA: {
      observations: etaRows.length,
      scoreableObservations: etaSummary.scoredFlights,
      independentTruthFlights: etaTruthFlights.size,
      medianAbsoluteErrorSeconds: etaSummary.medianAbsoluteErrorSeconds,
      p90AbsoluteErrorSeconds: etaSummary.p90AbsoluteErrorSeconds,
      p95AbsoluteErrorSeconds: etaSummary.p95AbsoluteErrorSeconds,
      captureStaleRate: staleRate(etaRows),
    },
    RUNWAY: {
      observations: runwayRows.length,
      scoreableObservations: scoreableRunway.length,
      independentTruthFlights: runwayTruthFlights.size,
      exactEndAccuracy: scoreableRunway.length ? exactRunway / scoreableRunway.length : null,
      coverage: runwayRows.length ? scoreableRunway.length / runwayRows.length : null,
      captureStaleRate: staleRate(runwayRows),
    },
    RUNWAY_CHANGE: {
      observations: changeRows.length,
      scoreableObservations: scoreableChange.length,
      independentTruthFlights: changeTruthFlights.size,
      outcomePrecision: scoreableChange.length ? correctChangeOutcome / scoreableChange.length : null,
      falsePositiveRate: scoreableChange.length ? 1 - correctChangeOutcome / scoreableChange.length : null,
      // A final reported runway can validate the outcome of a change candidate,
      // but it cannot independently prove that the runway actually changed.
      independentChangeTruthAvailable: false,
      captureStaleRate: staleRate(changeRows),
    },
    TRAJECTORY: {
      observations: trajectoryRows.filter((row) => trajectoryState(row) !== null).length,
      candidateObservations: trajectoryRows.filter((row) => {
        const state = trajectoryState(row);
        return state === "POSSIBLE_DEVIATION" || state === "DEVIATING";
      }).length,
      validatedCandidates: 0,
      precision: null,
      stateCaptureAvailable: trajectoryRows.some((row) => trajectoryState(row) !== null),
      // State capture is now reconstructable from bounded evidenceJson, but no
      // independent persisted outcome source currently proves whether a
      // candidate deviation was objectively correct.
      independentOutcomeTruthAvailable: false,
      captureStaleRate: staleRate(trajectoryRows.filter((row) => trajectoryState(row) !== null)),
    },
    integrity,
  };
  return { evidence, matchedLandingTruth, captureStaleObservations };
}

async function queryReadinessRows(now: Date): Promise<{ observations: PredictiveReadinessObservationRow[]; landings: PredictiveReadinessLandingEventRow[] } | null> {
  const database = getPrisma();
  if (!database) return null;
  const schema = database.orm.public as unknown as ReadinessSchema;
  const fromMs = now.getTime() - PREDICTIVE_READINESS_WINDOW_DAYS * 86_400_000;
  const from = Temporal.Instant.fromEpochMilliseconds(fromMs);
  try {
    const [observations, landings] = await Promise.all([
      trackDbOperation("predictive-readiness.observations.query", async () => await schema.PredictiveObservation
        .where({ predictedAt: { gte: from } })
        .orderBy((row: { predictedAt: { desc(): unknown } }) => row.predictedAt.desc())
        .limit(PREDICTIVE_READINESS_OBSERVATION_LIMIT)
        .all()),
      trackDbOperation("predictive-readiness.landings.query", async () => await schema.FlightEvent
        .where({ type: "LANDING", occurredAt: { gte: from } })
        .orderBy((row: { occurredAt: { desc(): unknown } }) => row.occurredAt.desc())
        .limit(PREDICTIVE_READINESS_LANDING_LIMIT)
        .all()),
    ]);
    return { observations, landings };
  } catch {
    return null;
  }
}

export async function readPredictiveReadinessReport(options: { now?: Date; force?: boolean } = {}): Promise<PredictiveReadinessReport> {
  const now = options.now ?? new Date();
  if (!options.force && cached && cached.expiresAt > now.getTime()) return cached.report;
  const rows = await queryReadinessRows(now);
  if (!rows) {
    const report = unavailableReport(now);
    cached = { expiresAt: now.getTime() + Math.min(PREDICTIVE_READINESS_CACHE_MS, 60_000), report };
    return report;
  }

  const complete = rows.observations.length < PREDICTIVE_READINESS_OBSERVATION_LIMIT
    && rows.landings.length < PREDICTIVE_READINESS_LANDING_LIMIT;
  const { evidence, matchedLandingTruth, captureStaleObservations } = buildPredictiveReadinessEvidence(rows.observations, rows.landings);
  const evaluation = evaluatePredictiveReadiness(evidence, { complete });
  const configuredPolicy = getPredictiveGraduationPolicy();
  const report: PredictiveReadinessReport = {
    source: "postgres",
    generatedAt: now.toISOString(),
    window: {
      from: new Date(now.getTime() - PREDICTIVE_READINESS_WINDOW_DAYS * 86_400_000).toISOString(),
      to: now.toISOString(),
      days: PREDICTIVE_READINESS_WINDOW_DAYS,
    },
    complete,
    limits: { observations: PREDICTIVE_READINESS_OBSERVATION_LIMIT, landingEvents: PREDICTIVE_READINESS_LANDING_LIMIT },
    configuredPolicy,
    effectivePolicy: enforcePredictiveReadiness(configuredPolicy, evaluation),
    thresholds: PREDICTIVE_READINESS_THRESHOLDS,
    collection: {
      observations: rows.observations.length,
      landingEvents: rows.landings.length,
      matchedLandingTruth,
      captureStaleObservations,
    },
    integrity: evidence.integrity,
    capabilities: evaluation.capabilities,
  };
  cached = { expiresAt: now.getTime() + PREDICTIVE_READINESS_CACHE_MS, report };
  return report;
}

export async function getEffectivePredictiveGraduationPolicy(
  configured = getPredictiveGraduationPolicy(),
): Promise<PredictiveGraduationPolicy> {
  if (!configuredPublic(configured)) return configured;
  const report = await readPredictiveReadinessReport();
  return enforcePredictiveReadiness(configured, { thresholdVersion: report.thresholds.version, capabilities: report.capabilities });
}

export function resetPredictiveReadinessCacheForTests(): void {
  cached = null;
}
