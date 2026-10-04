import type { AlertRule } from "@/lib/server/alert-config";
import type { PublicEtaAdvisory } from "@/lib/predictive-intelligence/eta-advisory";
import type { PublicRunwayChangeAdvisory } from "@/lib/predictive-intelligence/runway-change-advisory";

export type WatchlistPredictiveAlertKind = "ETA_THRESHOLD" | "RUNWAY_CHANGE";

export interface WatchlistPredictiveAlertCandidate {
  kind: WatchlistPredictiveAlertKind;
  eventKey: string;
  metadata: Record<string, string | number | boolean | null>;
}

function normalizedIcao(value: string | null | undefined): string | null {
  const candidate = value?.trim().toUpperCase();
  return candidate && /^[A-Z]{4}$/.test(candidate) ? candidate : null;
}

function stableEtaFlightKey(input: {
  aircraftIcao: string;
  callsign: string | null;
  destinationIcao: string | null;
  estimatedArrivalAt: string;
}): string {
  const etaMs = Date.parse(input.estimatedArrivalAt);
  const threeHourBucket = Number.isFinite(etaMs) ? Math.floor(etaMs / (3 * 60 * 60_000)) : 0;
  const callsign = input.callsign?.trim().toUpperCase() || "NO_CALLSIGN";
  const destination = normalizedIcao(input.destinationIcao) ?? "NO_DEST";
  return `${input.aircraftIcao.trim().toUpperCase()}:${callsign}:${destination}:${threeHourBucket}`;
}

export function evaluateWatchlistPredictiveRule(input: {
  rule: AlertRule;
  aircraftIcao: string;
  callsign: string | null;
  destinationIcao: string | null;
  etaAdvisory: PublicEtaAdvisory | null;
  runwayChangeAdvisory: PublicRunwayChangeAdvisory | null;
}): WatchlistPredictiveAlertCandidate[] {
  const candidates: WatchlistPredictiveAlertCandidate[] = [];
  const destination = normalizedIcao(input.destinationIcao);
  const configuredDestination = normalizedIcao(input.rule.etaDestinationIcao);

  if (
    input.rule.etaThresholdMinutes !== undefined
    && input.etaAdvisory
    && input.etaAdvisory.horizonMinutes <= input.rule.etaThresholdMinutes
    && (!configuredDestination || destination === configuredDestination)
  ) {
    const flightKey = stableEtaFlightKey({
      aircraftIcao: input.aircraftIcao,
      callsign: input.callsign,
      destinationIcao: destination,
      estimatedArrivalAt: input.etaAdvisory.estimatedArrivalAt,
    });
    candidates.push({
      kind: "ETA_THRESHOLD",
      eventKey: `predictive:eta:${input.rule.id}:${flightKey}:${input.rule.etaThresholdMinutes}`,
      metadata: {
        destinationIcao: destination,
        thresholdMinutes: input.rule.etaThresholdMinutes,
        horizonMinutes: input.etaAdvisory.horizonMinutes,
        estimatedArrivalAt: input.etaAdvisory.estimatedArrivalAt,
        uncertaintyMinutes: input.etaAdvisory.uncertaintyMinutes,
        confidence: input.etaAdvisory.confidence,
        provenance: "predicted",
      },
    });
  }

  if (input.rule.notifyRunwayChange === true && input.runwayChangeAdvisory) {
    const change = input.runwayChangeAdvisory;
    candidates.push({
      kind: "RUNWAY_CHANGE",
      eventKey: `predictive:runway-change:${input.rule.id}:${input.aircraftIcao.trim().toUpperCase()}:${change.changedAt}:${change.changedFrom}:${change.runway}`,
      metadata: {
        destinationIcao: destination,
        changedFrom: change.changedFrom,
        runway: change.runway,
        changedAt: change.changedAt,
        confidence: change.confidence,
        provenance: "predicted",
      },
    });
  }

  return candidates;
}
