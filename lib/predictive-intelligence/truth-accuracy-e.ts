/**
 * Stage E1-E4/E6: read-only quality analysis over the same independently
 * scored 30-day cohort as the existing predictive readiness report.
 * It never changes readiness, public policy, source affinity, or live state.
 */
export const TRUTH_ACCURACY_VERSION = "truth-accuracy-v1" as const;
export const MIN_AIRPORT_FLIGHTS = 10;
export const MIN_CONFIDENCE_FLIGHTS = 20;
export const MAX_AIRPORTS = 12;

export type QualityCapability = "ETA" | "RUNWAY";
export type QualityConfidence = "LOW" | "MEDIUM" | "HIGH";
export interface TruthAccuracySample {
  observationKey: string;
  lifecycleKey: string;
  capability: QualityCapability;
  predictedAtMs: number | null;
  destinationIcao?: string | null;
  flightPhase?: string | null;
  predictionConfidence?: string | null;
  scored: boolean;
  etaAbsoluteErrorSeconds?: number | null;
  runwayExactEnd?: boolean | null;
}
export interface QualityCohort {
  flights: number;
  confirmed: number;
  unscorable: number;
  coverage: number | null;
  etaMaeSeconds: number | null;
  etaP90Seconds: number | null;
  exactRunwayAccuracy: number | null;
}
export interface AirportQualityRow {
  airport: string;
  capability: QualityCapability;
  state: "MEASURED" | "INSUFFICIENT_TRUTH" | "COLLECTION_INCOMPLETE";
  cohort: QualityCohort;
}
export interface PhaseQualityRow {
  phase: string;
  capability: QualityCapability;
  state: "MEASURED" | "INSUFFICIENT_TRUTH" | "COLLECTION_INCOMPLETE";
  cohort: QualityCohort;
}
export interface ConfidenceQualityRow {
  capability: QualityCapability;
  confidence: QualityConfidence;
  state: "MEASURED" | "INSUFFICIENT_TRUTH" | "COLLECTION_INCOMPLETE";
  flights: number;
  confirmed: number;
  successRate: number | null;
  successRule: "ETA_ABSOLUTE_ERROR_LE_5_MINUTES" | "RUNWAY_EXACT_END";
}
export interface TruthAccuracyReport {
  version: typeof TRUTH_ACCURACY_VERSION;
  sourceAvailable: boolean;
  complete: boolean;
  truth: Record<QualityCapability, QualityCohort>;
  airports: AirportQualityRow[];
  airportOverflow: number;
  phases: PhaseQualityRow[];
  confidence: ConfidenceQualityRow[];
  decision: "SOURCE_UNAVAILABLE" | "COLLECTION_INCOMPLETE" | "INSUFFICIENT_TRUTH" | "REVIEW_QUALITY" | "MONITOR";
  reasons: string[];
  /** These diagnostics are not evidence of correct approach or ATC instructions. */
  limitations: readonly ["INDEPENDENT_LANDING_EVIDENCE_ONLY", "NO_APPROACH_RECALL", "NO_ATC_CLEARANCE", "NO_AUTOMATIC_GRADUATION"];
}

function validAirport(input: string | null | undefined): string | null {
  const normalized = input?.trim().toUpperCase() ?? "";
  return /^[A-Z0-9]{4}$/.test(normalized) ? normalized : null;
}
function normalizedPhase(input: string | null | undefined): string | null {
  const phase = input?.trim().toUpperCase() ?? "";
  return /^[A-Z][A-Z_]{1,23}$/.test(phase) ? phase : null;
}
function confidenceLabel(input: string | null | undefined): QualityConfidence | null {
  const normalized = input?.trim().toUpperCase();
  return normalized === "LOW" || normalized === "MEDIUM" || normalized === "HIGH" ? normalized : null;
}
function validScore(row: TruthAccuracySample): boolean {
  if (!row.scored) return false;
  return row.capability === "ETA"
    ? typeof row.etaAbsoluteErrorSeconds === "number"
      && Number.isFinite(row.etaAbsoluteErrorSeconds) && row.etaAbsoluteErrorSeconds >= 0
    : typeof row.runwayExactEnd === "boolean";
}
function p90(data: readonly number[]): number | null {
  if (!data.length) return null;
  const sorted = [...data].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * .9) - 1)] ?? null;
}
function aggregate(rows: readonly TruthAccuracySample[], capability: QualityCapability): QualityCohort {
  const eligible = rows.filter((row) => row.capability === capability);
  const scored = eligible.filter(validScore);
  const errors = capability === "ETA" ? scored.map((row) => row.etaAbsoluteErrorSeconds!) : [];
  return {
    flights: eligible.length,
    confirmed: scored.length,
    unscorable: eligible.length - scored.length,
    coverage: eligible.length ? scored.length / eligible.length : null,
    etaMaeSeconds: errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : null,
    etaP90Seconds: p90(errors),
    exactRunwayAccuracy: capability === "RUNWAY" && scored.length
      ? scored.filter((row) => row.runwayExactEnd === true).length / scored.length : null,
  };
}

/** Deterministically select the earliest prediction per lifecycle and capability.
 * Later improved predictions must not replace the original after seeing truth.
 */
export function buildTruthAccuracyReport(
  samples: readonly TruthAccuracySample[],
  options: { sourceAvailable: boolean; complete: boolean },
): TruthAccuracyReport {
  const first = new Map<string, TruthAccuracySample>();
  for (const sample of samples) {
    if (!sample.lifecycleKey.trim() || !Number.isSafeInteger(sample.predictedAtMs) || sample.predictedAtMs! < 0
      || (sample.capability !== "ETA" && sample.capability !== "RUNWAY")) continue;
    const key = `${sample.capability}:${sample.lifecycleKey}`;
    const old = first.get(key);
    if (!old || sample.predictedAtMs! < old.predictedAtMs!
      || (sample.predictedAtMs === old.predictedAtMs && sample.observationKey < old.observationKey)) first.set(key, sample);
  }
  const distinct = [...first.values()];
  const truth = {
    ETA: aggregate(distinct, "ETA"),
    RUNWAY: aggregate(distinct, "RUNWAY"),
  };
  const airports: AirportQualityRow[] = [];
  const locations = [...new Set(distinct.flatMap((row) => {
    const airport = validAirport(row.destinationIcao);
    return airport ? [airport] : [];
  }))].sort();
  for (const airport of locations) {
    for (const capability of ["ETA", "RUNWAY"] as const) {
      const cohort = aggregate(distinct.filter((row) => validAirport(row.destinationIcao) === airport), capability);
      if (!cohort.flights) continue;
      airports.push({
        airport, capability,
        state: !options.complete ? "COLLECTION_INCOMPLETE"
          : cohort.confirmed < MIN_AIRPORT_FLIGHTS ? "INSUFFICIENT_TRUTH" : "MEASURED",
        cohort: options.sourceAvailable && options.complete && cohort.confirmed >= MIN_AIRPORT_FLIGHTS
          ? cohort : { ...cohort, etaMaeSeconds: null, etaP90Seconds: null, exactRunwayAccuracy: null },
      });
    }
  }
  // Rank by confirmed flights, deterministic tie break. Never allow an unbounded admin payload.
  airports.sort((a, b) => b.cohort.confirmed - a.cohort.confirmed
    || a.airport.localeCompare(b.airport) || a.capability.localeCompare(b.capability));

  const phases: PhaseQualityRow[] = [];
  const distinctPhases = [...new Set(distinct.flatMap((row) => {
    const phase = normalizedPhase(row.flightPhase);
    return phase ? [phase] : [];
  }))].sort();
  for (const phase of distinctPhases) for (const capability of ["ETA", "RUNWAY"] as const) {
    const cohort = aggregate(distinct.filter((row) => normalizedPhase(row.flightPhase) === phase), capability);
    if (!cohort.flights) continue;
    const state = !options.complete ? "COLLECTION_INCOMPLETE"
      : cohort.confirmed < MIN_AIRPORT_FLIGHTS ? "INSUFFICIENT_TRUTH" : "MEASURED";
    phases.push({
      phase, capability, state,
      cohort: state === "MEASURED" ? cohort
        : { ...cohort, etaMaeSeconds: null, etaP90Seconds: null, exactRunwayAccuracy: null },
    });
  }
  phases.sort((a, b) => b.cohort.confirmed - a.cohort.confirmed || a.phase.localeCompare(b.phase));
  const confidence: ConfidenceQualityRow[] = [];
  for (const capability of ["ETA", "RUNWAY"] as const) {
    for (const level of ["LOW", "MEDIUM", "HIGH"] as const) {
      const rows = distinct.filter((row) => row.capability === capability && confidenceLabel(row.predictionConfidence) === level);
      const scored = rows.filter(validScore);
      const eligible = options.sourceAvailable && options.complete && scored.length >= MIN_CONFIDENCE_FLIGHTS;
      confidence.push({
        capability, confidence: level,
        state: !options.complete ? "COLLECTION_INCOMPLETE" : !eligible ? "INSUFFICIENT_TRUTH" : "MEASURED",
        flights: rows.length, confirmed: scored.length,
        successRate: eligible ? scored.filter((row) => capability === "ETA"
          ? row.etaAbsoluteErrorSeconds! <= 300 : row.runwayExactEnd === true).length / scored.length : null,
        successRule: capability === "ETA" ? "ETA_ABSOLUTE_ERROR_LE_5_MINUTES" : "RUNWAY_EXACT_END",
      });
    }
  }
  const reasons: string[] = [];
  if (!options.sourceAvailable) reasons.push("SOURCE_UNAVAILABLE");
  else if (!options.complete) reasons.push("COLLECTION_INCOMPLETE");
  else if (truth.ETA.confirmed < MIN_CONFIDENCE_FLIGHTS || truth.RUNWAY.confirmed < MIN_CONFIDENCE_FLIGHTS)
    reasons.push("INSUFFICIENT_INDEPENDENT_TRUTH");
  else {
    if (truth.ETA.etaMaeSeconds !== null && truth.ETA.etaMaeSeconds > 300) reasons.push("ETA_MAE_OVER_5_MIN");
    if (truth.RUNWAY.exactRunwayAccuracy !== null && truth.RUNWAY.exactRunwayAccuracy < .85)
      reasons.push("RUNWAY_ACCURACY_BELOW_85_PERCENT");
  }
  const decision: TruthAccuracyReport["decision"] = !options.sourceAvailable ? "SOURCE_UNAVAILABLE"
    : !options.complete ? "COLLECTION_INCOMPLETE"
      : reasons.includes("INSUFFICIENT_INDEPENDENT_TRUTH") ? "INSUFFICIENT_TRUTH"
        : reasons.length ? "REVIEW_QUALITY" : "MONITOR";
  return {
    version: TRUTH_ACCURACY_VERSION,
    sourceAvailable: options.sourceAvailable, complete: options.complete,
    truth, airports: airports.slice(0, MAX_AIRPORTS), airportOverflow: Math.max(0, airports.length - MAX_AIRPORTS),
    phases: phases.slice(0, 8), confidence, decision, reasons,
    limitations: ["INDEPENDENT_LANDING_EVIDENCE_ONLY", "NO_APPROACH_RECALL", "NO_ATC_CLEARANCE", "NO_AUTOMATIC_GRADUATION"],
  };
}
