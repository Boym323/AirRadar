import type { AtcContextResult, AtcPredictionConfidence } from "@/lib/atc-context/types";

export interface AtcHandoffEstimate {
  fromSectorId: string | null;
  fromSectorName: string | null;
  toSectorId: string;
  toSectorName: string;
  publishedUnit: string | null;
  primaryFrequencyMhz: number | null;
  alternateFrequenciesMhz: number[];
  distanceNm: number;
  estimatedSeconds: number;
  confidence: AtcPredictionConfidence;
}

/**
 * Builds a user-facing estimate from the short-horizon sector projection.
 * This is published/probable context only; it is not an observed or confirmed
 * operational ATC handoff and does not prove a tuned aircraft frequency.
 */
export function buildAtcHandoffEstimate(context: AtcContextResult | null): AtcHandoffEstimate | null {
  if (!context || context.status !== "available" || !context.nextSector) return null;

  const next = context.nextSector;
  const current = context.primaryAirspace;
  if (current?.id === next.airspace.id) return null;

  if (next.airspace.verticalMatch === "false") return null;

  const frequencies = next.airspace.publishedFrequenciesMhz.filter((value) => Number.isFinite(value) && value > 0);
  const confidence: AtcPredictionConfidence = next.airspace.verticalMatch === "uncertain"
    ? next.confidence === "high" ? "medium" : "low"
    : next.confidence;

  return {
    fromSectorId: current?.id ?? null,
    fromSectorName: current?.name ?? null,
    toSectorId: next.airspace.id,
    toSectorName: next.airspace.name,
    publishedUnit: next.airspace.publishedUnit,
    primaryFrequencyMhz: frequencies[0] ?? null,
    alternateFrequenciesMhz: frequencies.slice(1),
    distanceNm: next.distanceNm,
    estimatedSeconds: next.estimatedSeconds,
    confidence,
  };
}
