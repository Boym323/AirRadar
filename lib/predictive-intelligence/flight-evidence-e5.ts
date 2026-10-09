import { scoreEta, scoreRunway } from "@/lib/predictive-intelligence/validation";

export const FLIGHT_EVIDENCE_E5_VERSION = "flight-evidence-e5" as const;
export interface FlightEvidenceObservation {
  observationKey: string;
  lifecycleKey: string;
  capability: string;
  aircraftIcao: string;
  flightId: number | null;
  predictedAt: unknown;
  predictedLandingAt: unknown;
  predictedRunway: string | null;
}
export interface FlightEvidenceLanding {
  icaoHex: string;
  flightId: number | null;
  occurredAt: unknown;
  metadataJson: string | null;
}
export interface FlightEvidenceItem {
  capability: "ETA" | "RUNWAY";
  predictedAt: string;
  prediction: string | null;
  outcome: string | null;
  status: "SCORED" | "UNSCORABLE";
  absoluteErrorSeconds: number | null;
  runwayExactEnd: boolean | null;
  reason: "CONFIRMED_OUTCOME" | "INDEPENDENT_TRUTH_MISSING";
}
export interface FlightEvidenceE5 {
  version: typeof FLIGHT_EVIDENCE_E5_VERSION;
  flightId: number;
  items: FlightEvidenceItem[];
  complete: boolean;
  limitation: "ADMIN_ONLY_PROSPECTIVE_AUDIT";
}
function instant(value: unknown): number | null {
  const valueMs = value instanceof Date ? value.getTime()
    : typeof value === "number" ? value
      : typeof value === "string" ? Date.parse(value)
        : value && typeof value === "object" && "epochMilliseconds" in value
          ? value.epochMilliseconds : null;
  return typeof valueMs === "number" && Number.isSafeInteger(valueMs) && valueMs >= 0 ? valueMs : null;
}
function safeLanding(row: FlightEvidenceLanding): {
  lifecycleKey: string; landingMs: number | null; runway: string | null;
} | null {
  if (!row.metadataJson || row.metadataJson.length > 32768) return null;
  try {
    const data: unknown = JSON.parse(row.metadataJson);
    if (!data || typeof data !== "object") return null;
    const value = data as {
      lifecycleKey?: unknown;
      terminalEvidence?: { groundConfirmation?: { observedAt?: unknown };
        reportedArrivalRunway?: { runway?: unknown } };
    };
    if (typeof value.lifecycleKey !== "string" || value.lifecycleKey.length > 160
      || !value.lifecycleKey.trim()) return null;
    const rawRunway = value.terminalEvidence?.reportedArrivalRunway?.runway;
    const normalized = typeof rawRunway === "string"
      ? rawRunway.trim().toUpperCase().replace(/^RWY\s*/, "") : "";
    const runway = /^(?:0?[1-9]|[12]\d|3[0-6])[LCR]?$/.test(normalized)
      ? normalized.replace(/^(\d)(?=[LCR]?$)/, "0$1") : null;
    return {
      lifecycleKey: value.lifecycleKey,
      landingMs: instant(value.terminalEvidence?.groundConfirmation?.observedAt),
      runway,
    };
  } catch { return null; }
}
export function buildFlightEvidenceE5(input: {
  flightId: number;
  aircraftIcao: string;
  observations: readonly FlightEvidenceObservation[];
  landings: readonly FlightEvidenceLanding[];
  complete: boolean;
}): FlightEvidenceE5 {
  const seen = new Set<string>();
  const list = input.observations.filter((row) =>
    (row.capability === "ETA" || row.capability === "RUNWAY")
    && row.flightId === input.flightId
    && row.aircraftIcao.toUpperCase() === input.aircraftIcao.toUpperCase()
    && instant(row.predictedAt) !== null
  ).sort((a,b) => (instant(a.predictedAt)! - instant(b.predictedAt)!)
    || a.observationKey.localeCompare(b.observationKey));
  const items: FlightEvidenceItem[] = [];
  for (const observation of list) {
    if (seen.has(observation.capability)) continue;
    seen.add(observation.capability);
    const at = instant(observation.predictedAt)!;
    const landing = input.landings.flatMap((row) => {
      if (row.flightId !== input.flightId || row.icaoHex.toUpperCase() !== input.aircraftIcao.toUpperCase()) return [];
      const outcome = safeLanding(row);
      const eventAt = instant(row.occurredAt);
      return outcome && outcome.lifecycleKey === observation.lifecycleKey
        && eventAt !== null && eventAt >= at && eventAt - at <= 6 * 60 * 60_000
        ? [{ ...outcome, eventAt }] : [];
    }).sort((a,b) => a.eventAt - b.eventAt)[0] ?? null;
    const capability = observation.capability as "ETA" | "RUNWAY";
    const eta = capability === "ETA"
      ? scoreEta(instant(observation.predictedLandingAt), landing?.landingMs ?? null,
        landing?.landingMs !== null && landing?.landingMs !== undefined ? "CONFIRMED" : "UNKNOWN") : null;
    const runway = capability === "RUNWAY"
      ? scoreRunway(observation.predictedRunway, landing?.runway ?? null,
        landing?.runway ? "CONFIRMED" : "UNKNOWN") : null;
    const scored = eta?.status === "SCORED" || runway?.status === "SCORED";
    const estimated = instant(observation.predictedLandingAt);
    items.push({
      capability,
      predictedAt: new Date(at).toISOString(),
      prediction: capability === "ETA" ? estimated === null ? null : new Date(estimated).toISOString()
        : observation.predictedRunway,
      outcome: capability === "ETA" ? landing?.landingMs === null || landing?.landingMs === undefined
        ? null : new Date(landing.landingMs).toISOString() : landing?.runway ?? null,
      status: scored ? "SCORED" : "UNSCORABLE",
      absoluteErrorSeconds: eta?.absoluteErrorSeconds ?? null,
      runwayExactEnd: runway?.exactEnd ?? null,
      reason: scored ? "CONFIRMED_OUTCOME" : "INDEPENDENT_TRUTH_MISSING",
    });
  }
  return {
    version: FLIGHT_EVIDENCE_E5_VERSION, flightId: input.flightId,
    items: items.slice(0,2), complete: input.complete,
    limitation: "ADMIN_ONLY_PROSPECTIVE_AUDIT",
  };
}
