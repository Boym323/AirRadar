import type { Aircraft } from "@/lib/aircraft/types";
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
  if (prediction.trajectory.state !== "UNKNOWN") {
    result.push(build("TRAJECTORY", "metadata", { predictionConfidence: prediction.trajectory.confidence, evidenceJson: JSON.stringify(prediction.trajectory.evidence.slice(0, 12)) }));
  }
  return result;
}

export interface ProspectiveDiagnostics {
  enabled: boolean; captured: number; persisted: number; skippedDedupe: number; dropped: number; persistenceFailures: number;
  queueDepth: number; queueHighWaterMark: number; oldestQueuedAt: string | null; lastSuccessfulWrite: string | null;
  lastFailureAt: string | null; lastFailureClassification: "invalid_timestamp" | "database" | "unconfigured" | null;
  lastFailureField: "predictedAt" | "predictedLandingAt" | "createdAt" | null;
}

export type ObservationTable = { create: (input: Record<string, unknown>) => Promise<unknown> };

function toOrmInstant(value: number, field: string): Temporal.Instant {
  if (!Number.isSafeInteger(value)) throw new TypeError(`${field} must be a safe integer timestamp`);
  try {
    return Temporal.Instant.fromEpochMilliseconds(value);
  } catch {
    throw new TypeError(`${field} is outside the supported timestamp range`);
  }
}

function errorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const value = (error as { code?: unknown }).code;
  return typeof value === "string" ? value : null;
}

function isExpectedDuplicate(error: unknown): boolean {
  const code = errorCode(error);
  const message = error instanceof Error ? error.message : String(error);
  return code === "23505" || code === "P2002" || /duplicate|unique constraint|already exists/i.test(message);
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
  private readonly stats = {
    captured: 0, persisted: 0, skippedDedupe: 0, dropped: 0, persistenceFailures: 0,
    queueHighWaterMark: 0, lastSuccessfulWrite: null as string | null,
    lastFailureAt: null as string | null,
    lastFailureClassification: null as ProspectiveDiagnostics["lastFailureClassification"],
    lastFailureField: null as ProspectiveDiagnostics["lastFailureField"],
  };
  constructor(private readonly tableOverride?: ObservationTable | null) {}
  enqueue(observations: readonly ProspectiveObservation[]): void {
    if (!observations.length) return;
    for (const observation of observations) {
      if (this.pending.has(observation.observationKey)) { this.stats.skippedDedupe += 1; continue; }
      if (this.queue.length >= MAX_QUEUE) { this.stats.dropped += 1; continue; }
      this.pending.add(observation.observationKey); this.queue.push(observation); this.stats.captured += 1;
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
      for (const item of batch) {
        try {
          await table.create({
            ...item,
            predictedAt: toOrmInstant(item.predictedAt, "predictedAt"),
            predictedLandingAt: item.predictedLandingAt === null ? null : toOrmInstant(item.predictedLandingAt, "predictedLandingAt"),
            createdAt: Temporal.Now.instant(),
          });
          this.stats.persisted += 1;
          successfulWrites += 1;
        } catch (error) {
          if (isExpectedDuplicate(error)) {
            this.stats.skippedDedupe += 1;
            continue;
          }
          this.stats.persistenceFailures += 1;
          this.stats.lastFailureAt = new Date().toISOString();
          this.stats.lastFailureClassification = failureClassification(error);
          this.stats.lastFailureField = failureField(error);
        }
      }
      if (successfulWrites > 0) this.stats.lastSuccessfulWrite = new Date().toISOString();
    } finally {
      for (const item of batch) this.pending.delete(item.observationKey);
      this.flushing = false;
      if (this.queue.length) this.schedule();
    }
  }
  diagnostics(): ProspectiveDiagnostics { return { enabled: isProspectiveValidationEnabled(), ...this.stats, queueDepth: this.queue.length, oldestQueuedAt: this.queue[0] ? new Date(this.queue[0].predictedAt).toISOString() : null }; }
}

export const prospectiveRetentionDays = RAW_RETENTION_DAYS;
