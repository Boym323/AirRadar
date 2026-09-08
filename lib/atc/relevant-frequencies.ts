import type { AtcFrequencySummary } from "@/lib/atc/types";

export const MAX_DISPLAYED_RELEVANT_ATC_FREQUENCIES = 3;

export function uniqueRelevantAtcFrequencies(
  summaries: ReadonlyArray<AtcFrequencySummary>,
): AtcFrequencySummary[] {
  return [...new Map(summaries.map((summary) => [relevantAtcFrequencyKey(summary), summary])).values()];
}

export function displayedRelevantAtcFrequencies(
  summaries: ReadonlyArray<AtcFrequencySummary>,
  showAll = false,
): AtcFrequencySummary[] {
  const unique = uniqueRelevantAtcFrequencies(summaries);
  return showAll ? unique : unique.slice(0, MAX_DISPLAYED_RELEVANT_ATC_FREQUENCIES);
}

export function relevantAtcFrequencyKey(summary: Pick<AtcFrequencySummary, "frequencyMhz" | "callsign" | "service">): string {
  return `${summary.frequencyMhz.toFixed(3)}|${summary.callsign ?? ""}|${summary.service ?? ""}`;
}
