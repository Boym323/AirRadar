import type { AtcFrequencySummary } from "@/lib/atc/types";

export const MAX_DISPLAYED_RELEVANT_ATC_FREQUENCIES = 5;

export function displayedRelevantAtcFrequencies(
  summaries: ReadonlyArray<AtcFrequencySummary>,
  showAll = false,
): AtcFrequencySummary[] {
  return showAll ? [...summaries] : summaries.slice(0, MAX_DISPLAYED_RELEVANT_ATC_FREQUENCIES);
}

export function relevantAtcFrequencyKey(summary: Pick<AtcFrequencySummary, "frequencyMhz" | "callsign" | "service">): string {
  return `${summary.frequencyMhz.toFixed(3)}|${summary.callsign ?? ""}|${summary.service ?? ""}`;
}
