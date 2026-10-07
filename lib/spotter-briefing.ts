import type { AircraftView } from "@/lib/aircraft/types";
import type { SpotterInterestScore } from "@/lib/spotter-interest";
import type { SpotterClosestApproach } from "@/lib/spotter-location";
import type { SpotterPhotoOpportunity } from "@/lib/spotter-photo-opportunity";

export type SpotterBriefingCondition = "EXCELLENT" | "GOOD" | "MIXED" | "POOR" | "EMPTY";

export interface SpotterBriefingCandidate {
  aircraft: AircraftView;
  closestApproach: SpotterClosestApproach;
  interest: SpotterInterestScore;
  photoOpportunity: SpotterPhotoOpportunity | null;
}

export interface SpotterBriefing {
  horizonMinutes: number;
  condition: SpotterBriefingCondition;
  totalPasses: number;
  interestingPasses: number;
  iconicPasses: number;
  highOpportunityPasses: number;
  bestPhotoScore: number | null;
  top: SpotterBriefingCandidate[];
}

export function buildSpotterBriefing(
  candidates: readonly SpotterBriefingCandidate[],
  horizonMinutes = 60,
  topLimit = 4,
): SpotterBriefing {
  const boundedHorizon = Math.max(5, Math.min(60, Math.round(horizonMinutes)));
  const boundedTop = Math.max(1, Math.min(8, Math.round(topLimit)));
  const horizonSeconds = boundedHorizon * 60;

  const eligible = candidates
    .filter((item) =>
      item.closestApproach.phase === "approaching"
      && item.closestApproach.secondsUntilClosest <= horizonSeconds
    )
    .sort((a, b) =>
      (b.photoOpportunity?.score ?? -1) - (a.photoOpportunity?.score ?? -1)
      || b.interest.score - a.interest.score
      || a.closestApproach.secondsUntilClosest - b.closestApproach.secondsUntilClosest
      || a.aircraft.icaoHex.localeCompare(b.aircraft.icaoHex)
    );

  const scores = eligible
    .map((item) => item.photoOpportunity?.score ?? null)
    .filter((score): score is number => score !== null);
  const bestPhotoScore = scores.length ? Math.max(...scores) : null;
  const averageTop = scores.length
    ? scores.slice(0, Math.min(3, scores.length)).reduce((sum, score) => sum + score, 0) / Math.min(3, scores.length)
    : null;

  const condition: SpotterBriefingCondition = eligible.length === 0
    ? "EMPTY"
    : bestPhotoScore !== null && bestPhotoScore >= 85 && (averageTop ?? 0) >= 70
      ? "EXCELLENT"
      : bestPhotoScore !== null && bestPhotoScore >= 70
        ? "GOOD"
        : bestPhotoScore !== null && bestPhotoScore >= 45
          ? "MIXED"
          : "POOR";

  return {
    horizonMinutes: boundedHorizon,
    condition,
    totalPasses: eligible.length,
    interestingPasses: eligible.filter((item) => item.interest.score >= 30).length,
    iconicPasses: eligible.filter((item) => item.interest.reasons.some((reason) => reason.code === "iconic_type")).length,
    highOpportunityPasses: eligible.filter((item) => (item.photoOpportunity?.score ?? 0) >= 75).length,
    bestPhotoScore,
    top: eligible.slice(0, boundedTop),
  };
}
