import type { AircraftView, LogbookLabel } from "@/lib/aircraft/types";

export type SpotterInterestReasonCode =
  | "emergency"
  | "rare"
  | "new"
  | "returning"
  | "iconic_type"
  | "widebody"
  | "close_pass"
  | "reception_record";

export interface SpotterInterestReason {
  code: SpotterInterestReasonCode;
  points: number;
}

export interface SpotterInterestScore {
  score: number;
  reasons: SpotterInterestReason[];
}

const ICONIC_TYPES = new Set(["A380", "A388", "B741", "B742", "B743", "B744", "B748", "AN124", "A124", "AN225", "A225"]);
const WIDEBODY_PREFIXES = ["A30", "A31", "A33", "A34", "A35", "B76", "B77", "B78"];

function normalizedType(aircraft: AircraftView): string {
  return (
    aircraft.enrichment?.metadata?.icaoTypeCode
    ?? aircraft.aircraftType
    ?? aircraft.enrichment?.metadata?.aircraftType
    ?? ""
  ).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function isEmergency(aircraft: AircraftView): boolean {
  const emergency = aircraft.emergency?.trim().toLowerCase();
  return Boolean(
    emergency && emergency !== "none" && emergency !== "no emergency"
  ) || ["7500", "7600", "7700"].includes(aircraft.squawk ?? "");
}

export function scoreSpotterInterest(
  aircraft: AircraftView,
  labels: readonly LogbookLabel[] = [],
  closestApproachKm: number | null = null,
  receptionRecordHex: string | null = null,
): SpotterInterestScore {
  const reasons: SpotterInterestReason[] = [];
  const type = normalizedType(aircraft);

  if (isEmergency(aircraft)) reasons.push({ code: "emergency", points: 60 });
  if (labels.includes("rare")) reasons.push({ code: "rare", points: 30 });
  if (labels.includes("new")) reasons.push({ code: "new", points: 15 });
  if (labels.includes("returning")) reasons.push({ code: "returning", points: 8 });

  if (ICONIC_TYPES.has(type)) {
    reasons.push({ code: "iconic_type", points: 30 });
  } else if (WIDEBODY_PREFIXES.some((prefix) => type.startsWith(prefix))) {
    reasons.push({ code: "widebody", points: 10 });
  }

  if (closestApproachKm !== null && Number.isFinite(closestApproachKm)) {
    const points = closestApproachKm < 1 ? 25
      : closestApproachKm < 3 ? 20
      : closestApproachKm < 5 ? 15
      : closestApproachKm < 10 ? 5
      : 0;
    if (points) reasons.push({ code: "close_pass", points });
  }

  if (receptionRecordHex && aircraft.icaoHex.toUpperCase() === receptionRecordHex.toUpperCase()) {
    reasons.push({ code: "reception_record", points: 20 });
  }

  reasons.sort((a, b) => b.points - a.points || a.code.localeCompare(b.code));
  return {
    score: Math.min(100, reasons.reduce((sum, reason) => sum + reason.points, 0)),
    reasons,
  };
}

export function isSpotterInteresting(score: SpotterInterestScore): boolean {
  return score.score >= 30;
}
