export const SECTOR_TRACKING_GAP_MS = 90_000;

export type SectorTransitionKind = "entering" | "leaving";

/**
 * A transition needs a known, continuous predecessor. A first sighting and a
 * sample after a tracking gap are both an unknown predecessor, not "outside".
 */
export function detectSectorTransition(
  previous: boolean | undefined,
  current: boolean,
  gapMs: number | null,
  maxGapMs = SECTOR_TRACKING_GAP_MS,
): SectorTransitionKind | null {
  if (previous === undefined || gapMs === null || !Number.isFinite(gapMs) || gapMs < 0 || gapMs > maxGapMs) return null;
  if (previous === current) return null;
  return current ? "entering" : "leaving";
}

export type SectorMembership = string | null;

/** Shared continuity rule for sector-to-sector flow detection. */
export function detectSectorMembershipTransition(
  previous: SectorMembership | undefined,
  current: SectorMembership,
  gapMs: number | null,
  maxGapMs = SECTOR_TRACKING_GAP_MS,
): { fromSectorId: string; toSectorId: string } | null {
  if (previous === undefined || current === null || previous === null || previous === current) return null;
  if (gapMs === null || !Number.isFinite(gapMs) || gapMs < 0 || gapMs > maxGapMs) return null;
  return { fromSectorId: previous, toSectorId: current };
}
