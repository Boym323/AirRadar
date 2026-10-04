import type { Aircraft } from "@/lib/aircraft/types";
import { createHash, randomUUID } from "node:crypto";
import { getPrisma } from "@/lib/server/db";
import { getBuildMetadata } from "@/lib/server/version";
import { getPredictiveGraduationPolicy, type PredictiveCapability } from "./graduation";
import type { PredictiveFlightState } from "./types";
import "temporal-polyfill/full/global";

export const PROSPECTIVE_VALIDATION_ENV = "AIRRADAR_PREDICTIVE_PROSPECTIVE_VALIDATION_ENABLED";
const MAX_QUEUE = 256;
const BATCH_SIZE = 24;
const FLUSH_MS = 1_000;
const RAW_RETENTION_DAYS = 90;

export function isProspectiveValidationEnabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env[PROSPECTIVE_VALIDATION_ENV] === "true";
}

export type ProspectiveObservation = {
  observationKey: string;
  lifecycleKey: string;
  capability: PredictiveCapability;
  aircraftIcao: string;
  flightId: number | null;
  callsign: string | null;
  destinationIcao: string | null;
  predictedAt: number;
  horizonSeconds: number | null;
  horizonBucket: string;
  flightPhase: string;
  latitude: number;
  longitude: number;
  altitudeFt: number | null;
  groundSpeedKt: number | null;
  verticalRateFpm: number | null;
  trackDeg: number | null;
  predictedLandingAt: number | null;
  distanceRemainingNm: number | null;
  predictedRunway: string | null;
  alternativeRunway: string | null;
  previousRunway: string | null;
  predictionConfidence: string;
  etaConfidence: string | null;
  evidenceJson: string;
  modelVersion: string;
  softwareVersion: string;
  graduationMode: string;
};

function finite(value: number | null | undefined): value is number { return typeof value === "number" && Number.isFinite(value); }
const MAX_TEMPORAL_EPOCH_MILLISECONDS = 8_640_000_000_000_000;
function validTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && Math.abs(value) <= MAX_TEMPORAL_EPOCH_MILLISECONDS;
}
function etaBucket(seconds: number | null): string {
  if (!finite(seconds)) return "UNKNOWN";
  if (seconds <= 5 * 60) return "<=5m";
  if (seconds <= 10 * 60) return "5-10m";
  if (seconds <= 20 * 60) return "10-20m";
  if (seconds <= 30 * 60) return "20-30m";
  if (seconds <= 45 * 60) return "30-45m";
  if (seconds <= 60 * 60) return "45-60m";
  return ">60m";
}

function confidenceChanged(previous: PredictiveFlightState | null, current: PredictiveFlightState): boolean {
  return previous?.runway.confidence !== current.runway.confidence;
}

export function prospectiveObservationFor(
  aircraft: Aircraft,
  prediction: PredictiveFlightState,
  lifecycleKey: string,
  previous: PredictiveFlightState | null,
  flightId: number | null = null,
): ProspectiveObservation[] {
  const predictedAt = prediction.evaluatedAt;
  if (!finite(predictedAt) || aircraft.lat === null || aircraft.lon === null) return [];
  const build = (capability: PredictiveCapability, bucket: string, values: Partial<ProspectiveObservation>): ProspectiveObservation => ({
    observationKey: `${lifecycleKey}:${capability}:${bucket}:${prediction.modelVersion}`,
    lifecycleKey, capability, aircraftIcao: aircraft.icaoHex.toUpperCase(), flightId,
    callsign: aircraft.callsign ?? null, destinationIcao: aircraft.enrichment?.route?.destination ?? null,
    predictedAt, horizonSeconds: null, horizonBucket: bucket,
    flightPhase: values.flightPhase ?? "UNKNOWN", latitude: aircraft.lat!, longitude: aircraft.lon!,
    altitudeFt: finite(aircraft.altitude) ? Math.round(aircraft.altitude) : null,
    groundSpeedKt: finite(aircraft.groundSpeed) ? aircraft.groundSpeed : null,
    verticalRateFpm: finite(aircraft.verticalRate) ? aircraft.verticalRate : null,
    trackDeg: finite(aircraft.track) ? aircraft.track : null,
    predictedLandingAt: null, distanceRemainingNm: null, predictedRunway: null,
    alternativeRunway: null, previousRunway: null, predictionConfidence: "UNKNOWN", etaConfidence: null,
    evidenceJson: "[]", modelVersion: prediction.modelVersion,
    softwareVersion: getBuildMetadata().version, graduationMode: getPredictiveGraduationPolicy()[capability], ...values,
  });
  const result: ProspectiveObservation[] = [];
  const eta = prediction.eta;
  if (eta.estimatedArrivalAt !== null) {
    const horizonSeconds = Math.max(0, (eta.estimatedArrivalAt - predictedAt) / 1000);
    result.push(build("ETA", etaBucket(horizonSeconds), {
      horizonSeconds: Math.round(horizonSeconds), predictedLandingAt: eta.estimatedArrivalAt,
      distanceRemainingNm: Number(eta.evidence.find((item) => item.key === "distanceRemainingNm")?.value) || null,
      predictionConfidence: eta.confidence, etaConfidence: eta.confidence,
      evidenceJson: JSON.stringify(eta.evidence.slice(0, 12)),
    }));
  }
  const runway = prediction.runway;
  const meaningfulRunway = runway.runway !== null && (previous?.runway.runway === null || previous?.runway.runway !== runway.runway || confidenceChanged(previous, prediction) || aircraft.onGround);
  if (meaningfulRunway) {
    const bucket = previous?.runway.runway !== runway.runway && previous?.runway.runway !== null ? `change:${predictedAt}` : aircraft.onGround ? "final" : "first";
    result.push(build("RUNWAY", bucket, { predictedRunway: runway.runway, alternativeRunway: runway.alternative, predictionConfidence: runway.confidence, evidenceJson: JSON.stringify(runway.evidence.slice(0, 12)) }));
    if (previous?.runway.runway && previous.runway.runway !== runway.runway) {
      result.push(build("RUNWAY_CHANGE", `change:${predictedAt}`, { predictedRunway: runway.runway, previousRunway: previous.runway.runway, predictionConfidence: runway.confidence, evidenceJson: JSON.stringify(runway.evidence.slice(0, 12)) }));
    }
  }
  const trajectory = prediction.trajectory;
  const meaningfulTrajectory = trajectory.state !== "UNKNOWN"
    && (
      previous?.trajectory.state !== trajectory.state
      || previous?.trajectory.confidence !== trajectory.confidence
    );
  if (meaningfulTrajectory) {
    result.push(build("TRAJECTORY", `state:${trajectory.state}:${predictedAt}`, {
      predictionConfidence: trajectory.confidence,
      evidenceJson: JSON.stringify([
        { key: "trajectoryState", value: trajectory.state },
        ...trajectory.evidence.slice(0, 11),
      ]),
    }));
  }
  return result;
}

export interface ProspectiveDiagnostics {
  enabled: boolean; writerSessionId: string; processStartedAt: string; pid: number; counterStartedAt: string;
  captured: number; invalid: number; enqueued: number; dedupePending: number; dedupeDatabase: number;
  persistenceAttempted: number; rowsCommittedByWriter: number; persistenceFailures: number; integrityRejects: number;
  dropped: number; droppedBeforeEnqueue: number; droppedAfterEnqueue: number;
  invalidSkipReasons: Record<string, number>; invalidSkipReasonsByCapability: Record<PredictiveCapability, Record<string, number>>;
  persistenceSuspended: boolean; suspensionReason: "integrity_violation_23502" | "integrity_violation" | null;
  queueDepth: number; pendingKeyCount: number; queueHighWaterMark: number; oldestQueuedAt: string | null;
  firstCommitAt: string | null; lastCommitAt: string | null; committedBatches: number; lastBatchSize: number | null; maxBatchSize: number;
  lastFailureAt: string | null; lastFailureClassification: "invalid_timestamp" | "database" | "unconfigured" | null;
  lastFailureField: "predictedAt" | "predictedLandingAt" | "createdAt" | null;
  lastDatabaseFailure: DatabaseFailureSignature | null;
  databaseFailureHistogram: DatabaseFailureHistogramEntry[];
  failuresByCapability: Record<PredictiveCapability, number>;
  accounting: { captureBalance: number; enqueueBalance: number; drained: boolean };
}

export type ObservationTable = { create: (input: Record<string, unknown>) => Promise<unknown> };

export type DatabaseFailureMessageClass = "unique_violation" | "foreign_key_violation" | "not_null_violation" | "data_exception" | "connection" | "timeout" | "serialization" | "insufficient_resources" | "operator_intervention" | "unknown";
export type DatabaseFailureSqlStateClass = "integrity_constraint" | "data_exception" | "connection" | "transaction_rollback" | "insufficient_resources" | "operator_intervention" | "other" | null;
export type DatabaseFailureSignature = {
  constructorName: string | null;
  name: string | null;
  code: string | null;
  sqlState: string | null;
  sqlStateClass: DatabaseFailureSqlStateClass;
  constraint: string | null;
  table: string | null;
  column: string | null;
  detail: string | null;
  capability: PredictiveCapability | null;
  horizonBucket: string | null;
  observationKeyHash: string | null;
  writerOperation: "create" | null;
  causeConstructorName: string | null;
  causeName: string | null;
  causeCode: string | null;
  causeSqlState: string | null;
  causeConstraint: string | null;
  messageClass: DatabaseFailureMessageClass;
};
export type DatabaseFailureHistogramEntry = { signature: string; count: number; firstSeenAt: string; lastSeenAt: string };

const FAILURE_HISTOGRAM_LIMIT = 8;
const CAPABILITIES: readonly PredictiveCapability[] = ["ETA", "RUNWAY", "RUNWAY_CHANGE", "TRAJECTORY"];
const INVALID_REASON_HISTOGRAM_LIMIT = 32;
const boundedString = (value: unknown): string | null => {
  if (typeof value !== "string" || value.length === 0 || value.length > 128 || /[\r\n]/.test(value)) return null;
  return value;
};
const boundedDetail = (value: unknown): string | null => {
  const result = boundedString(value);
  if (!result) return null;
  const normalized = result.replace(/\s+/g, " ");
  return /^Failing row contains /i.test(normalized) ? "Failing row contains <redacted>" : normalized;
};
const structuralValue = (value: unknown): string | null => boundedString(value);
const sqlStateClass = (sqlState: string | null): DatabaseFailureSqlStateClass => {
  if (!sqlState) return null;
  if (sqlState.startsWith("23")) return "integrity_constraint";
  if (sqlState.startsWith("22")) return "data_exception";
  if (sqlState.startsWith("08")) return "connection";
  if (sqlState.startsWith("40")) return "transaction_rollback";
  if (sqlState.startsWith("53")) return "insufficient_resources";
  if (sqlState.startsWith("57")) return "operator_intervention";
  return "other";
};
const messageClass = (error: unknown, sqlState: string | null): DatabaseFailureMessageClass => {
  if (sqlState === "23505") return "unique_violation";
  if (sqlState === "23502") return "not_null_violation";
  if (sqlState === "23503") return "foreign_key_violation";
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (/timeout|timed out/.test(message)) return "timeout";
  if (/serialization|deadlock/.test(message)) return "serialization";
  if (sqlState?.startsWith("22")) return "data_exception";
  if (sqlState?.startsWith("08")) return "connection";
  if (sqlState?.startsWith("53")) return "insufficient_resources";
  if (sqlState?.startsWith("57")) return "operator_intervention";
  return "unknown";
};

function sqlStateFrom(values: readonly Record<string, unknown>[]): string | null {
  for (const value of values) {
    for (const key of ["sqlState", "sqlstate", "code"]) {
      const candidate = structuralValue(value[key]);
      if (candidate && /^\d{5}$/.test(candidate)) return candidate;
    }
  }
  return null;
}

function errorValues(error: unknown): Array<Record<string, unknown>> {
  const values: Array<Record<string, unknown>> = [];
  let current = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
    const value = current as Record<string, unknown>;
    values.push(value);
    for (const nestedKey of ["meta", "driverAdapterError", "originalError"]) {
      const nested = value[nestedKey];
      if (nested && typeof nested === "object") values.push(nested as Record<string, unknown>);
    }
    current = value.cause;
  }
  return values;
}

function firstStructural(values: readonly Record<string, unknown>[], keys: readonly string[]): string | null {
  for (const value of values) for (const key of keys) {
    const found = structuralValue(value[key]);
    if (found) return found;
  }
  return null;
}

function observationKeyHash(value: string | null): string | null {
  return value ? createHash("sha256").update(value).digest("hex").slice(0, 16) : null;
}

export type DatabaseFailureContext = Pick<DatabaseFailureSignature, "capability" | "horizonBucket" | "observationKeyHash" | "writerOperation">;

export function databaseFailureSignature(error: unknown, context: Partial<DatabaseFailureContext> = {}): DatabaseFailureSignature {
  const values = errorValues(error);
  const top = values[0] ?? {};
  const cause = values[1] ?? {};
  const sqlState = sqlStateFrom(values);
  const table = firstStructural(values, ["table", "table_name", "relation"]);
  const column = firstStructural(values, ["column", "column_name"]);
  const detail = firstStructural(values, ["detail", "serverDetail"]);
  return {
    constructorName: structuralValue((error as { constructor?: { name?: unknown } } | null)?.constructor?.name),
    name: structuralValue(top.name),
    code: structuralValue(top.code),
    sqlState,
    sqlStateClass: sqlStateClass(sqlState),
    constraint: firstStructural(values, ["constraint", "constraint_name"]),
    table, column, detail: boundedDetail(detail),
    capability: context.capability ?? null,
    horizonBucket: context.horizonBucket ?? null,
    observationKeyHash: context.observationKeyHash ?? null,
    writerOperation: context.writerOperation ?? null,
    causeConstructorName: structuralValue((values[1] as { constructor?: { name?: unknown } } | undefined)?.constructor?.name),
    causeName: structuralValue(cause.name),
    causeCode: structuralValue(cause.code),
    causeSqlState: structuralValue(cause.sqlState) ?? structuralValue(cause.code),
    causeConstraint: structuralValue(cause.constraint) ?? structuralValue(cause.constraint_name),
    messageClass: messageClass(error, sqlState ?? structuralValue(cause.code)),
  };
}

function failureSignatureKey(signature: DatabaseFailureSignature): string {
  return [signature.constructorName, signature.name, signature.code, signature.sqlState, signature.sqlStateClass, signature.constraint, signature.table, signature.column, signature.detail, signature.capability, signature.horizonBucket, signature.observationKeyHash, signature.writerOperation, signature.causeConstructorName, signature.causeName, signature.causeCode, signature.causeSqlState, signature.causeConstraint, signature.messageClass].map((value) => value ?? "-").join("|");
}

export type InvalidObservationReason = "missing_observation_key" | "malformed_observation_key" | "missing_lifecycle_key" | "invalid_capability" | "missing_aircraft_icao" | "missing_horizon_bucket" | "missing_flight_phase" | "missing_prediction_confidence" | "missing_evidence" | "missing_model_version" | "missing_software_version" | "missing_graduation_mode" | "invalid_predicted_at" | "invalid_predicted_landing_at" | "invalid_coordinates";
const validCapabilities = new Set<string>(CAPABILITIES);
export function validateProspectiveObservation(observation: ProspectiveObservation): InvalidObservationReason | null {
  if (typeof observation.observationKey !== "string" || observation.observationKey.length === 0) return "missing_observation_key";
  if (typeof observation.lifecycleKey !== "string" || observation.lifecycleKey.length === 0) return "missing_lifecycle_key";
  if (observation.observationKey.split(":").length < 4) return "malformed_observation_key";
  if (!validCapabilities.has(observation.capability)) return "invalid_capability";
  if (typeof observation.aircraftIcao !== "string" || observation.aircraftIcao.trim().length === 0) return "missing_aircraft_icao";
  if (typeof observation.horizonBucket !== "string" || observation.horizonBucket.trim().length === 0) return "missing_horizon_bucket";
  if (typeof observation.flightPhase !== "string" || observation.flightPhase.trim().length === 0) return "missing_flight_phase";
  if (typeof observation.predictionConfidence !== "string" || observation.predictionConfidence.trim().length === 0) return "missing_prediction_confidence";
  if (typeof observation.evidenceJson !== "string" || observation.evidenceJson.trim().length === 0) return "missing_evidence";
  if (typeof observation.modelVersion !== "string" || observation.modelVersion.trim().length === 0) return "missing_model_version";
  if (typeof observation.softwareVersion !== "string" || observation.softwareVersion.trim().length === 0) return "missing_software_version";
  if (typeof observation.graduationMode !== "string" || observation.graduationMode.trim().length === 0) return "missing_graduation_mode";
  if (!validTimestamp(observation.predictedAt)) return "invalid_predicted_at";
  if (observation.predictedLandingAt !== null && !validTimestamp(observation.predictedLandingAt)) return "invalid_predicted_landing_at";
  if (!finite(observation.latitude) || !finite(observation.longitude)) return "invalid_coordinates";
  return null;
}

export const PROSPECTIVE_PERSISTENCE_TIMESTAMP_FIELD = "createdAt" as const;
export const PROSPECTIVE_REQUIRED_DB_FIELDS = ["observationKey", "lifecycleKey", "capability", "aircraftIcao", "predictedAt", "horizonBucket", "flightPhase", "latitude", "longitude", "predictionConfidence", "evidenceJson", "modelVersion", "softwareVersion", "graduationMode"] as const;
export type ProspectiveRequiredDbField = typeof PROSPECTIVE_REQUIRED_DB_FIELDS[number];
export const PROSPECTIVE_REQUIRED_DB_FIELD_MATRIX: ReadonlyArray<{ column: ProspectiveRequiredDbField; source: string; runtimeGuard: string; capability: "all" }> = [
  ...PROSPECTIVE_REQUIRED_DB_FIELDS.map((column) => ({ column, source: `ProspectiveObservation.${column}`, runtimeGuard: "validateProspectiveObservation", capability: "all" as const })),
];

export type ProspectiveProcessSnapshot = Pick<ProspectiveDiagnostics, "writerSessionId" | "processStartedAt" | "pid">;
export function compareProspectiveProcessSessions(before: ProspectiveProcessSnapshot, after: ProspectiveProcessSnapshot): {
  mainPidBefore: number; mainPidAfter: number; processStartedAtBefore: string; processStartedAtAfter: string;
  writerSessionIdBefore: string; writerSessionIdAfter: string; restartCount: number; comparable: boolean;
} {
  const restarted = before.pid !== after.pid || before.processStartedAt !== after.processStartedAt || before.writerSessionId !== after.writerSessionId;
  return {
    mainPidBefore: before.pid, mainPidAfter: after.pid,
    processStartedAtBefore: before.processStartedAt, processStartedAtAfter: after.processStartedAt,
    writerSessionIdBefore: before.writerSessionId, writerSessionIdAfter: after.writerSessionId,
    restartCount: restarted ? 1 : 0, comparable: !restarted,
  };
}

const PROCESS_STARTED_AT = new Date().toISOString();
const PROCESS_PID = process.pid;

function toOrmInstant(value: number, field: string): Temporal.Instant {
  if (!Number.isSafeInteger(value)) throw new TypeError(`${field} must be a safe integer timestamp`);
  try {
    return Temporal.Instant.fromEpochMilliseconds(value);
  } catch {
    throw new TypeError(`${field} is outside the supported timestamp range`);
  }
}

function isExpectedDuplicate(error: unknown): boolean {
  const signature = databaseFailureSignature(error);
  if (signature.code === "P2002") return true;
  const isUniqueViolation = signature.sqlState === "23505" || signature.causeSqlState === "23505";
  const constraint = signature.constraint ?? signature.causeConstraint;
  return isUniqueViolation && constraint === "predictiveObservation_pkey";
}

export function isNonRetryableIntegrityFailure(error: unknown): boolean {
  return databaseFailureSignature(error).sqlStateClass === "integrity_constraint";
}

function failureClassification(error: unknown): "invalid_timestamp" | "database" {
  return error instanceof TypeError && /timestamp/.test(error.message) ? "invalid_timestamp" : "database";
}

function failureField(error: unknown): ProspectiveDiagnostics["lastFailureField"] {
  if (!(error instanceof TypeError)) return null;
  const match = /^(predictedAt|predictedLandingAt|createdAt)\b/.exec(error.message);
  return (match?.[1] as ProspectiveDiagnostics["lastFailureField"]) ?? null;
}

export class ProspectiveValidationWriter {
  private readonly queue: ProspectiveObservation[] = [];
  private readonly pending = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;
  private readonly writerSessionId = randomUUID().replace(/-/g, "").slice(0, 12);
  private readonly counterStartedAt = new Date().toISOString();
  private readonly stats = {
    captured: 0, invalid: 0, enqueued: 0, dedupePending: 0, dedupeDatabase: 0, persistenceAttempted: 0, rowsCommittedByWriter: 0,
    persistenceFailures: 0, integrityRejects: 0, dropped: 0, droppedBeforeEnqueue: 0, droppedAfterEnqueue: 0,
    invalidSkipReasons: {} as Record<string, number>,
    invalidSkipReasonsByCapability: Object.fromEntries(CAPABILITIES.map((capability) => [capability, {}])) as Record<PredictiveCapability, Record<string, number>>,
    queueHighWaterMark: 0,
    firstCommitAt: null as string | null, lastCommitAt: null as string | null, committedBatches: 0, lastBatchSize: null as number | null, maxBatchSize: 0,
    lastFailureAt: null as string | null,
    lastFailureClassification: null as ProspectiveDiagnostics["lastFailureClassification"],
    lastFailureField: null as ProspectiveDiagnostics["lastFailureField"],
    lastDatabaseFailure: null as DatabaseFailureSignature | null,
    databaseFailureHistogram: [] as DatabaseFailureHistogramEntry[],
    failuresByCapability: Object.fromEntries(CAPABILITIES.map((capability) => [capability, 0])) as Record<PredictiveCapability, number>,
    persistenceSuspended: false,
    suspensionReason: null as ProspectiveDiagnostics["suspensionReason"],
  };
  constructor(private readonly tableOverride?: ObservationTable | null) {}
  private recordDatabaseFailure(error: unknown, item: ProspectiveObservation): void {
    const signature = databaseFailureSignature(error, { capability: item.capability, horizonBucket: item.horizonBucket, observationKeyHash: observationKeyHash(item.observationKey), writerOperation: "create" });
    const now = new Date().toISOString();
    this.stats.lastDatabaseFailure = signature;
    this.stats.failuresByCapability[item.capability] += 1;
    if (isNonRetryableIntegrityFailure(error)) {
      this.stats.integrityRejects += 1;
      this.stats.persistenceSuspended = true;
      this.stats.suspensionReason = signature.sqlState === "23502" ? "integrity_violation_23502" : "integrity_violation";
    }
    const key = failureSignatureKey(signature);
    const existing = this.stats.databaseFailureHistogram.find((entry) => entry.signature === key);
    if (existing) {
      existing.count += 1;
      existing.lastSeenAt = now;
    } else if (this.stats.databaseFailureHistogram.length < FAILURE_HISTOGRAM_LIMIT) {
      this.stats.databaseFailureHistogram.push({ signature: key, count: 1, firstSeenAt: now, lastSeenAt: now });
    }
  }
  enqueue(observations: readonly ProspectiveObservation[]): void {
    if (!observations.length) return;
    if (this.stats.persistenceSuspended) {
      this.stats.captured += observations.length;
      this.stats.dropped += observations.length;
      this.stats.droppedBeforeEnqueue += observations.length;
      return;
    }
    for (const observation of observations) {
      this.stats.captured += 1;
      const invalidReason = validateProspectiveObservation(observation);
      if (invalidReason) {
        this.stats.invalid += 1;
        if (Object.keys(this.stats.invalidSkipReasons).length < INVALID_REASON_HISTOGRAM_LIMIT || this.stats.invalidSkipReasons[invalidReason] !== undefined) {
          this.stats.invalidSkipReasons[invalidReason] = (this.stats.invalidSkipReasons[invalidReason] ?? 0) + 1;
        }
        if (validCapabilities.has(observation.capability)) {
          const capability = observation.capability as PredictiveCapability;
          const byCapability = this.stats.invalidSkipReasonsByCapability[capability];
          if (Object.keys(byCapability).length < INVALID_REASON_HISTOGRAM_LIMIT || byCapability[invalidReason] !== undefined) {
            byCapability[invalidReason] = (byCapability[invalidReason] ?? 0) + 1;
          }
        }
        continue;
      }
      if (this.pending.has(observation.observationKey)) { this.stats.dedupePending += 1; continue; }
      if (this.queue.length >= MAX_QUEUE) { this.stats.dropped += 1; this.stats.droppedBeforeEnqueue += 1; continue; }
      this.pending.add(observation.observationKey); this.queue.push(observation); this.stats.enqueued += 1;
    }
    this.stats.queueHighWaterMark = Math.max(this.stats.queueHighWaterMark, this.queue.length);
    this.schedule();
  }
  private schedule(): void { if (!this.timer) this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, FLUSH_MS); }
  async flush(): Promise<void> {
    if (this.flushing || !this.queue.length) return;
    this.flushing = true;
    const batch = this.queue.splice(0, BATCH_SIZE);
    try {
      const table = this.tableOverride === undefined
        ? getPrisma()?.orm.public.PredictiveObservation as unknown as ObservationTable | undefined
        : this.tableOverride;
      if (!table) {
        this.stats.persistenceFailures += batch.length;
        this.stats.lastFailureAt = new Date().toISOString();
        this.stats.lastFailureClassification = "unconfigured";
        this.stats.lastFailureField = null;
        return;
      }
      let successfulWrites = 0;
      let integrityFailure = false;
      for (let batchIndex = 0; batchIndex < batch.length; batchIndex += 1) {
        const item = batch[batchIndex]!;
        try {
          this.stats.persistenceAttempted += 1;
          await table.create({
            ...item,
            predictedAt: toOrmInstant(item.predictedAt, "predictedAt"),
            predictedLandingAt: item.predictedLandingAt === null ? null : toOrmInstant(item.predictedLandingAt, "predictedLandingAt"),
            createdAt: Temporal.Now.instant(),
          });
          this.stats.rowsCommittedByWriter += 1;
          successfulWrites += 1;
          const committedAt = new Date().toISOString();
          this.stats.firstCommitAt ??= committedAt;
          this.stats.lastCommitAt = committedAt;
        } catch (error) {
          if (isExpectedDuplicate(error)) {
            this.stats.dedupeDatabase += 1;
            continue;
          }
          this.stats.persistenceFailures += 1;
          this.stats.lastFailureAt = new Date().toISOString();
          const classification = failureClassification(error);
          this.stats.lastFailureClassification = classification;
          this.stats.lastFailureField = failureField(error);
          if (classification === "database") {
            this.recordDatabaseFailure(error, item);
            integrityFailure = isNonRetryableIntegrityFailure(error);
          }
          // Integrity violations are deterministic and must never enter a
          // transient retry loop. Stop this batch after the first one and
          // discard pending prospective work without touching the evaluator.
          if (integrityFailure) {
            this.stats.dropped += batch.length - batchIndex - 1;
            this.stats.droppedAfterEnqueue += batch.length - batchIndex - 1;
            break;
          }
        }
      }
      this.stats.lastBatchSize = successfulWrites;
      this.stats.maxBatchSize = Math.max(this.stats.maxBatchSize, successfulWrites);
      if (successfulWrites > 0) {
        this.stats.committedBatches += 1;
      }
    } finally {
      if (this.stats.persistenceSuspended) {
        const queuedDropped = this.queue.length;
        this.stats.dropped += queuedDropped;
        this.stats.droppedAfterEnqueue += queuedDropped;
        for (const item of this.queue) this.pending.delete(item.observationKey);
        this.queue.length = 0;
      }
      for (const item of batch) this.pending.delete(item.observationKey);
      this.flushing = false;
      if (this.queue.length) this.schedule();
    }
  }
  async drain(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    while (this.queue.length) await this.flush();
  }
  diagnostics(): ProspectiveDiagnostics {
    return {
      enabled: isProspectiveValidationEnabled(), writerSessionId: this.writerSessionId, processStartedAt: PROCESS_STARTED_AT, pid: PROCESS_PID, counterStartedAt: this.counterStartedAt, ...this.stats,
      lastDatabaseFailure: this.stats.lastDatabaseFailure ? { ...this.stats.lastDatabaseFailure } : null,
      databaseFailureHistogram: this.stats.databaseFailureHistogram.map((entry) => ({ ...entry })),
      failuresByCapability: { ...this.stats.failuresByCapability },
      invalidSkipReasons: { ...this.stats.invalidSkipReasons },
      invalidSkipReasonsByCapability: Object.fromEntries(CAPABILITIES.map((capability) => [capability, { ...this.stats.invalidSkipReasonsByCapability[capability] }])) as Record<PredictiveCapability, Record<string, number>>,
      queueDepth: this.queue.length, pendingKeyCount: this.pending.size, oldestQueuedAt: this.queue[0] ? new Date(this.queue[0].predictedAt).toISOString() : null,
      accounting: {
        captureBalance: this.stats.captured - this.stats.invalid - this.stats.dedupePending - this.stats.enqueued - this.stats.droppedBeforeEnqueue,
        enqueueBalance: this.stats.enqueued - this.queue.length - this.stats.rowsCommittedByWriter - this.stats.dedupeDatabase - this.stats.persistenceFailures - this.stats.droppedAfterEnqueue,
        drained: this.queue.length === 0 && this.pending.size === 0 && !this.flushing,
      },
    };
  }
}

export const prospectiveRetentionDays = RAW_RETENTION_DAYS;
