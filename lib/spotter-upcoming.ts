import type { AircraftView, LogbookLabel } from "@/lib/aircraft/types";
import { predictClosestApproach, type SpotterObserverPosition } from "@/lib/spotter-location";
import { scoreSpotterInterest } from "@/lib/spotter-interest";

export interface SpotterUpcomingCandidate {
  aircraft: AircraftView;
  closestApproach: NonNullable<ReturnType<typeof predictClosestApproach>>;
  interest: ReturnType<typeof scoreSpotterInterest>;
  rankScore: number;
}

export function rankUpcomingSky(
  aircraft: readonly AircraftView[],
  observer: SpotterObserverPosition,
  labelsByHex: ReadonlyMap<string, readonly LogbookLabel[]>,
  receptionRecordHex: string | null,
  options: { horizonSeconds?: number; maxClosestDistanceKm?: number; limit?: number } = {},
): SpotterUpcomingCandidate[] {
  const horizonSeconds = options.horizonSeconds ?? 20 * 60;
  const maxClosestDistanceKm = options.maxClosestDistanceKm ?? 25;
  const limit = Math.max(1, Math.min(20, options.limit ?? 8));

  return aircraft
    .flatMap((item) => {
      const closestApproach = predictClosestApproach(item, observer, horizonSeconds);
      if (!closestApproach || closestApproach.phase !== "approaching") return [];
      if (closestApproach.secondsUntilClosest > horizonSeconds) return [];
      if (closestApproach.closestHorizontalDistanceKm > maxClosestDistanceKm) return [];

      const interest = scoreSpotterInterest(
        item,
        labelsByHex.get(item.icaoHex) ?? [],
        closestApproach.closestHorizontalDistanceKm,
        receptionRecordHex,
      );
      const leadMinutes = closestApproach.secondsUntilClosest / 60;
      const urgency = Math.max(0, 20 - leadMinutes);
      const proximity = Math.max(0, maxClosestDistanceKm - closestApproach.closestHorizontalDistanceKm);
      const rankScore = interest.score + urgency + proximity;

      if (interest.score < 15 && closestApproach.closestHorizontalDistanceKm >= 5) return [];
      return [{ aircraft: item, closestApproach, interest, rankScore }];
    })
    .sort((a, b) => b.rankScore - a.rankScore
      || a.closestApproach.secondsUntilClosest - b.closestApproach.secondsUntilClosest
      || a.closestApproach.closestHorizontalDistanceKm - b.closestApproach.closestHorizontalDistanceKm
      || a.aircraft.icaoHex.localeCompare(b.aircraft.icaoHex))
    .slice(0, limit);
}
