import type { AirportCorrelatedTrafficSnapshot } from "@/lib/airport-intelligence/v3";
import type { AirportOperationsResponse } from "@/lib/server/airport-operations";
import type { AirportMovement } from "@/lib/server/airport-movements";

export type ApproachEvidenceState =
  | "REAPPROACH_EVIDENCE" | "GO_AROUND_EVIDENCE" | "HOLDING_EVIDENCE"
  | "FINAL_APPROACH_EVIDENCE" | "APPROACH_EVIDENCE" | "LIVE_ONLY";

export interface ApproachEvidenceItemD3 {
  icaoHex: string;
  label: string;
  state: ApproachEvidenceState;
  flightId: number | null;
  evidenceAt: string | null;
  /** No historical landing status is inferred from an aircraft disappearing. */
  basis: "OBSERVED_CORRELATED_MOVEMENT" | "FRESH_LIVE_STAGE_ONLY";
}

export interface ApproachEvidenceD3 {
  version: "airport-approach-evidence-d3";
  items: ApproachEvidenceItemD3[];
  counts: { reapproach: number; goAround: number; holding: number; approach: number; liveOnly: number };
  complete: boolean;
}

const MAX_ITEMS = 6;
const MAX_MOVEMENT_AGE_MS = 20 * 60_000;
const FUTURE_TOLERANCE_MS = 2 * 60_000;
const EVENT_TYPES = new Set<AirportMovement["movement"]>(["APPROACH", "GO_AROUND", "HOLDING"]);

function validTime(value: string, reference: number): number | null {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp <= reference + FUTURE_TOLERANCE_MS
    && reference - timestamp <= MAX_MOVEMENT_AGE_MS
    ? timestamp : null;
}

/** Read-only corroboration; a stage label alone is not a historical transition. */
export function buildAirportApproachEvidenceD3(input: {
  traffic: AirportCorrelatedTrafficSnapshot;
  operations: AirportOperationsResponse | null;
  now?: Date;
}): ApproachEvidenceD3 {
  const now = (input.now ?? new Date()).getTime();
  const histories = new Map<number, AirportMovement[]>();
  for (const movement of [
    ...(input.operations?.eventEvidence ?? []).slice(0, 250),
    ...(input.operations?.recentMovements ?? []).slice(0, 250),
  ]) {
    if (!EVENT_TYPES.has(movement.movement) || validTime(movement.observedAt, now) === null) continue;
    const history = histories.get(movement.flightId) ?? [];
    history.push(movement);
    histories.set(movement.flightId, history);
  }
  for (const history of histories.values()) {
    history.sort((left, right) => Date.parse(left.observedAt) - Date.parse(right.observedAt)
      || left.movement.localeCompare(right.movement));
  }

  const seen = new Set<string>();
  const items: ApproachEvidenceItemD3[] = [];
  for (const observation of input.traffic.inbound.slice(0, 12)) {
    const hex = observation.aircraft.icaoHex.trim().toUpperCase();
    if (!hex || seen.has(hex) || observation.aircraft.onGround) continue;
    seen.add(hex);
    const matched = observation.movement;
    const matchedAt = matched && matched.icaoHex.trim().toUpperCase() === hex
      ? validTime(matched.observedAt, now) : null;
    const confirmed = matchedAt !== null
      && typeof observation.movementAgeSeconds === "number"
      && observation.movementAgeSeconds >= 0
      && observation.movementAgeSeconds <= MAX_MOVEMENT_AGE_MS / 1000;
    const history = confirmed && matched ? (histories.get(matched.flightId) ?? [])
      .filter((event) => event.icaoHex.trim().toUpperCase() === hex) : [];
    const latestApproach = history.filter((event) => event.movement === "APPROACH")
      .findLast((event) => Date.parse(event.observedAt) <= matchedAt!);
    const priorGoAround = latestApproach && history.some((event) =>
      event.movement === "GO_AROUND"
      && Date.parse(event.observedAt) < Date.parse(latestApproach.observedAt));
    let state: ApproachEvidenceState = "LIVE_ONLY";
    if (confirmed && matched) {
      if (matched.movement === "APPROACH" && priorGoAround) state = "REAPPROACH_EVIDENCE";
      else if (matched.movement === "GO_AROUND" && observation.journey.stage === "GO_AROUND") state = "GO_AROUND_EVIDENCE";
      else if (matched.movement === "HOLDING" && observation.journey.stage === "HOLDING") state = "HOLDING_EVIDENCE";
      else if (matched.movement === "APPROACH" && observation.journey.stage === "FINAL") state = "FINAL_APPROACH_EVIDENCE";
      else if (matched.movement === "APPROACH" && observation.journey.stage === "APPROACH") state = "APPROACH_EVIDENCE";
    }
    items.push({
      icaoHex: hex, label: observation.aircraft.callsign || hex, state,
      flightId: confirmed && matched ? matched.flightId : null,
      evidenceAt: confirmed && matched ? matched.observedAt : null,
      basis: state === "LIVE_ONLY" ? "FRESH_LIVE_STAGE_ONLY" : "OBSERVED_CORRELATED_MOVEMENT",
    });
    if (items.length >= MAX_ITEMS) break;
  }
  return {
    version: "airport-approach-evidence-d3",
    items,
    counts: {
      reapproach: items.filter((row) => row.state === "REAPPROACH_EVIDENCE").length,
      goAround: items.filter((row) => row.state === "GO_AROUND_EVIDENCE").length,
      holding: items.filter((row) => row.state === "HOLDING_EVIDENCE").length,
      approach: items.filter((row) => ["APPROACH_EVIDENCE", "FINAL_APPROACH_EVIDENCE"].includes(row.state)).length,
      liveOnly: items.filter((row) => row.state === "LIVE_ONLY").length,
    },
    complete: Boolean(input.operations?.complete && !input.operations?.truncated
      && !input.operations?.eventEvidenceTruncated),
  };
}
