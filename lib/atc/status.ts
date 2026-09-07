export type AtcDatasetStatus = "not imported" | "current" | "update available" | "incomplete" | "unavailable";

export interface AtcSectorIdComparison {
  expectedIds: string[];
  storedIds: string[];
  matchingIds: string[];
  missingIds: string[];
  extraIds: string[];
}

function normalizedIds(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))].sort();
}

export function compareAtcSectorIds(expectedIds: readonly string[], storedIds: readonly string[]): AtcSectorIdComparison {
  const expected = normalizedIds(expectedIds);
  const stored = normalizedIds(storedIds);
  const expectedSet = new Set(expected);
  const storedSet = new Set(stored);
  return {
    expectedIds: expected,
    storedIds: stored,
    matchingIds: expected.filter((id) => storedSet.has(id)),
    missingIds: expected.filter((id) => !storedSet.has(id)),
    extraIds: stored.filter((id) => !expectedSet.has(id)),
  };
}

export function determineAtcDatasetStatus(options: {
  databaseAvailable: boolean;
  databaseEffectiveDate: string | null;
  currentEffectiveDate: string;
  comparison: Pick<AtcSectorIdComparison, "storedIds" | "missingIds" | "extraIds">;
}): AtcDatasetStatus {
  if (!options.databaseAvailable) return "unavailable";
  if (options.comparison.storedIds.length === 0) return "not imported";
  if (options.databaseEffectiveDate !== options.currentEffectiveDate) return "update available";
  if (options.comparison.missingIds.length || options.comparison.extraIds.length) return "incomplete";
  return "current";
}
