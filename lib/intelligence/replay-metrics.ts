import type { FlightEventType } from "@/lib/intelligence/types";
import type { FlightIntelligenceReplayReport } from "@/lib/intelligence/replay";

export interface FlightIntelligenceEventQuality {
  type: FlightEventType;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number | null;
  recall: number | null;
  timing: {
    samples: number;
    meanAbsoluteDeltaMs: number | null;
    p50AbsoluteDeltaMs: number | null;
    p95AbsoluteDeltaMs: number | null;
    maxAbsoluteDeltaMs: number | null;
  };
  replayedConfidence: {
    samples: number;
    mean: number | null;
    low: number;
    medium: number;
    high: number;
  };
}

export interface FlightIntelligenceReplayQualitySummary {
  flights: number;
  positions: number;
  truncatedFlights: number;
  metrics: {
    truePositives: number;
    falsePositives: number;
    falseNegatives: number;
    precision: number | null;
    recall: number | null;
  };
  byEventType: FlightIntelligenceEventQuality[];
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 10_000) / 10_000 : null;
}

function rounded(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function percentile(values: readonly number[], quantile: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1));
  return sorted[index] ?? null;
}

export function summarizeFlightIntelligenceReplay(
  reports: readonly FlightIntelligenceReplayReport[],
): FlightIntelligenceReplayQualitySummary {
  const types = new Set<FlightEventType>();
  for (const report of reports) {
    for (const event of report.replayedEvents) types.add(event.type);
    for (const event of report.persistedComparableEvents) types.add(event.type);
  }

  const byEventType = [...types].sort().map((type): FlightIntelligenceEventQuality => {
    const matches = reports.flatMap((report) => report.matches.filter((match) => match.type === type));
    const falsePositives = reports.reduce((sum, report) => sum + report.falsePositives.filter((event) => event.type === type).length, 0);
    const falseNegatives = reports.reduce((sum, report) => sum + report.falseNegatives.filter((event) => event.type === type).length, 0);
    const replayed = reports.flatMap((report) => report.replayedEvents.filter((event) => event.type === type));
    const timing = matches.map((match) => Math.abs(match.deltaMs));
    const confidences = replayed.map((event) => event.confidence).filter((value) => Number.isFinite(value));

    return {
      type,
      truePositives: matches.length,
      falsePositives,
      falseNegatives,
      precision: ratio(matches.length, matches.length + falsePositives),
      recall: ratio(matches.length, matches.length + falseNegatives),
      timing: {
        samples: timing.length,
        meanAbsoluteDeltaMs: timing.length ? Math.round(timing.reduce((sum, value) => sum + value, 0) / timing.length) : null,
        p50AbsoluteDeltaMs: percentile(timing, 0.5),
        p95AbsoluteDeltaMs: percentile(timing, 0.95),
        maxAbsoluteDeltaMs: timing.length ? Math.max(...timing) : null,
      },
      replayedConfidence: {
        samples: confidences.length,
        mean: confidences.length ? rounded(confidences.reduce((sum, value) => sum + value, 0) / confidences.length) : null,
        low: confidences.filter((value) => value < 0.6).length,
        medium: confidences.filter((value) => value >= 0.6 && value < 0.85).length,
        high: confidences.filter((value) => value >= 0.85).length,
      },
    };
  });

  const truePositives = reports.reduce((sum, report) => sum + report.metrics.truePositives, 0);
  const falsePositives = reports.reduce((sum, report) => sum + report.metrics.falsePositives, 0);
  const falseNegatives = reports.reduce((sum, report) => sum + report.metrics.falseNegatives, 0);

  return {
    flights: reports.length,
    positions: reports.reduce((sum, report) => sum + report.positions, 0),
    truncatedFlights: reports.filter((report) => report.inputQuality.missingSignals.includes("HistoryFlightDetail.positionsTruncated")).length,
    metrics: {
      truePositives,
      falsePositives,
      falseNegatives,
      precision: ratio(truePositives, truePositives + falsePositives),
      recall: ratio(truePositives, truePositives + falseNegatives),
    },
    byEventType,
  };
}
