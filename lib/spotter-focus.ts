import type { AircraftView, LogbookLabel } from "@/lib/aircraft/types";
import { isLocalSpotterAircraft } from "@/lib/spotter";
import { mySkyPersonalSignal, type MySkyFavorites, type MySkyPersonalSignal } from "@/lib/spotter-personalization";
import type { SpotterLogbookState } from "@/lib/spotter-logbook";
import { scoreSpotterInterest, type SpotterInterestScore } from "@/lib/spotter-interest";
import {
  observerGeometry, predictClosestApproach,
  type SpotterClosestApproach, type SpotterObserverGeometry, type SpotterObserverPosition,
} from "@/lib/spotter-location";

export type MySkyFocusKind = "OVERHEAD" | "APPROACHING" | "INTERESTING" | "NEARBY";

export interface MySkyFocusItem {
  aircraft: AircraftView;
  geometry: SpotterObserverGeometry;
  closestApproach: SpotterClosestApproach | null;
  interest: SpotterInterestScore;
  kind: MySkyFocusKind;
  rank: number;
  personal: MySkyPersonalSignal;
}

export interface MySkyFocus {
  items: MySkyFocusItem[];
  nearbyCount: number;
  interestingCount: number;
  approachingCount: number;
}

const MAX_RADIUS_KM = 30;
const MAX_APPROACH_SECONDS = 10 * 60;

function kindFor(geometry: SpotterObserverGeometry, approach: SpotterClosestApproach | null, interest: SpotterInterestScore): MySkyFocusKind {
  if (geometry.horizontalDistanceKm <= 2) return "OVERHEAD";
  if (approach?.phase === "approaching" && approach.secondsUntilClosest <= MAX_APPROACH_SECONDS
    && approach.closestHorizontalDistanceKm <= 10) return "APPROACHING";
  if (interest.score >= 30) return "INTERESTING";
  return "NEARBY";
}

// Private observer geometry and ranking are calculated only in the browser.
// Reuse the existing LOCAL aircraft stream and canonical spotter scores;
// unknown positions and NETWORK-only aircraft must never appear as "overhead".
export function buildMySkyFocus(
  aircraft: readonly AircraftView[],
  observer: SpotterObserverPosition,
  labelsByHex: ReadonlyMap<string, readonly LogbookLabel[]> = new Map(),
  receptionRecordHex: string | null = null,
  limit = 5,
  context: { favorites: MySkyFavorites; logbook: SpotterLogbookState } | null = null,
): MySkyFocus {
  const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(8, Math.floor(limit))) : 5;
  const seen = new Set<string>();
  const eligible: MySkyFocusItem[] = [];
  for (const item of aircraft) {
    if (!isLocalSpotterAircraft(item) || seen.has(item.icaoHex)) continue;
    seen.add(item.icaoHex);
    const geometry = observerGeometry(item, observer);
    if (!geometry || !Number.isFinite(geometry.horizontalDistanceKm) || geometry.horizontalDistanceKm > MAX_RADIUS_KM) continue;
    const closestApproach = predictClosestApproach(item, observer, MAX_APPROACH_SECONDS);
    const interest = scoreSpotterInterest(
      item, labelsByHex.get(item.icaoHex) ?? [],
      closestApproach?.closestHorizontalDistanceKm ?? null, receptionRecordHex,
    );
    const kind = kindFor(geometry, closestApproach, interest);
    const personal = context ? mySkyPersonalSignal(item.icaoHex, context.favorites, context.logbook)
      : { favorite: false, sightings: 0, lastSeenAt: null };
    const proximity = Math.max(0, MAX_RADIUS_KM - geometry.horizontalDistanceKm) * 1.5;
    const imminent = kind === "APPROACHING" ? Math.max(0, 10 - closestApproach!.secondsUntilClosest / 60) * 3 : 0;
    const rank = interest.score * 2 + proximity + imminent + (kind === "OVERHEAD" ? 60 : 0)
      + (personal.favorite ? 40 : 0) + (personal.sightings > 0 ? 15 : 0);
    eligible.push({ aircraft: item, geometry, closestApproach, interest, kind, rank, personal });
  }
  eligible.sort((a, b) => b.rank - a.rank
    || a.geometry.horizontalDistanceKm - b.geometry.horizontalDistanceKm
    || a.aircraft.icaoHex.localeCompare(b.aircraft.icaoHex));
  return {
    items: eligible.slice(0, boundedLimit),
    nearbyCount: eligible.length,
    interestingCount: eligible.filter(item => item.interest.score >= 30).length,
    approachingCount: eligible.filter(item => item.closestApproach?.phase === "approaching"
      && item.closestApproach.secondsUntilClosest <= MAX_APPROACH_SECONDS).length,
  };
}

export function selectMySkyFocus(focus: MySkyFocus, selectedHex: string | null): MySkyFocusItem | null {
  return focus.items.find(item => item.aircraft.icaoHex === selectedHex) ?? focus.items[0] ?? null;
}
