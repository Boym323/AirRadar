export type ReceiverCoverageHealthState = "GOOD" | "DEGRADED" | "INSUFFICIENT_DATA";

export interface ReceiverCoverageTrendStatsRow {
  date: string;
  uniqueAircraftCount: number;
  maxDistanceKm: number;
  receiverMessagesCount: number | null;
}

export interface ReceiverCoverageTrendCoverageRow {
  date: string;
  azimuthBucket: number;
  maxDistanceKm: number;
}

export interface ReceiverCoverageTrendPoint {
  date: string;
  complete: boolean;
  uniqueAircraft: number;
  maxDistanceKm: number | null;
  medianSectorRangeKm: number | null;
  populatedSectors: number;
  receiverMessages: number | null;
}

export interface ReceiverCoverageHealth {
  state: ReceiverCoverageHealthState;
  evaluatedDate: string | null;
  baselineDays: number;
  rangeRatio: number | null;
  sectorRatio: number | null;
  uniqueAircraftRatio: number | null;
  messageRatio: number | null;
  reasons: string[];
}

export interface ReceiverCoverageIntelligenceV1 {
  version: "receiver-coverage-intelligence-v1";
  trend: {
    methodology: "daily-receiver-aggregates";
    currentDay: ReceiverCoverageTrendPoint | null;
    recentDays: ReceiverCoverageTrendPoint[];
  };
  health: ReceiverCoverageHealth;
}

function finitePositive(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function finiteNonNegative(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle] ?? null
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function ratio(value: number | null, baseline: number | null): number | null {
  if (value === null || baseline === null || baseline <= 0) return null;
  return value / baseline;
}

function buildPoints(
  statsRows: readonly ReceiverCoverageTrendStatsRow[],
  coverageRows: readonly ReceiverCoverageTrendCoverageRow[],
  currentDate: string,
): ReceiverCoverageTrendPoint[] {
  const statsByDate = new Map(statsRows.map((row) => [row.date, row]));
  const sectorByDate = new Map<string, Map<number, number>>();

  for (const row of coverageRows) {
    if (!Number.isInteger(row.azimuthBucket) || row.azimuthBucket < 0 || row.azimuthBucket >= 36) continue;
    const distance = finitePositive(row.maxDistanceKm);
    if (distance === null) continue;
    let sectors = sectorByDate.get(row.date);
    if (!sectors) {
      sectors = new Map();
      sectorByDate.set(row.date, sectors);
    }
    sectors.set(row.azimuthBucket, Math.max(sectors.get(row.azimuthBucket) ?? 0, distance));
  }

  const dates = [...new Set([...statsByDate.keys(), ...sectorByDate.keys()])].sort();
  return dates.map((date) => {
    const stats = statsByDate.get(date);
    const sectors = [...(sectorByDate.get(date)?.values() ?? [])];
    return {
      date,
      complete: date < currentDate,
      uniqueAircraft: Math.max(0, Math.trunc(finiteNonNegative(stats?.uniqueAircraftCount) ?? 0)),
      maxDistanceKm: finitePositive(stats?.maxDistanceKm) ?? (sectors.length ? Math.max(...sectors) : null),
      medianSectorRangeKm: median(sectors),
      populatedSectors: sectors.length,
      receiverMessages: finiteNonNegative(stats?.receiverMessagesCount),
    };
  });
}

export function buildReceiverCoverageIntelligenceV1(input: {
  currentDate: string;
  statsRows: readonly ReceiverCoverageTrendStatsRow[];
  coverageRows: readonly ReceiverCoverageTrendCoverageRow[];
  historyDays?: number;
}): ReceiverCoverageIntelligenceV1 {
  const points = buildPoints(input.statsRows, input.coverageRows, input.currentDate);
  const currentDay = points.find((point) => point.date === input.currentDate) ?? null;
  const completed = points
    .filter((point) => point.complete)
    .sort((a, b) => a.date.localeCompare(b.date));
  const historyDays = Math.min(30, Math.max(1, Math.trunc(input.historyDays ?? 7)));
  const completedLimit = Math.max(0, historyDays - (currentDay ? 1 : 0));
  const recentCompleted = completedLimit > 0 ? completed.slice(-completedLimit) : [];\n  const recentDays = [...recentCompleted, ...(currentDay ? [currentDay] : [])];

  const eligibleCompleted = completed.filter((point) =>
    point.medianSectorRangeKm !== null && point.populatedSectors >= 12,
  );
  const evaluated = eligibleCompleted.at(-1) ?? null;
  const baseline = evaluated
    ? eligibleCompleted.filter((point) => point.date < evaluated.date).slice(-7)
    : [];

  if (!evaluated || baseline.length < 3) {
    return {
      version: "receiver-coverage-intelligence-v1",
      trend: { methodology: "daily-receiver-aggregates", currentDay, recentDays },
      health: {
        state: "INSUFFICIENT_DATA",
        evaluatedDate: evaluated?.date ?? null,
        baselineDays: baseline.length,
        rangeRatio: null,
        sectorRatio: null,
        uniqueAircraftRatio: null,
        messageRatio: null,
        reasons: ["coverage.baseline_insufficient"],
      },
    };
  }

  const baselineRange = median(baseline.map((point) => point.medianSectorRangeKm).filter((value): value is number => value !== null));
  const baselineSectors = median(baseline.map((point) => point.populatedSectors));
  const baselineUnique = median(baseline.map((point) => point.uniqueAircraft).filter((value) => value > 0));
  const baselineMessages = median(baseline.map((point) => point.receiverMessages).filter((value): value is number => value !== null && value > 0));

  const rangeRatio = ratio(evaluated.medianSectorRangeKm, baselineRange);
  const sectorRatio = ratio(evaluated.populatedSectors, baselineSectors);
  const uniqueAircraftRatio = ratio(evaluated.uniqueAircraft || null, baselineUnique);
  const messageRatio = ratio(evaluated.receiverMessages, baselineMessages);
  const reasons: string[] = [];

  if (rangeRatio !== null && rangeRatio < 0.75) reasons.push("coverage.range_below_baseline");
  if (sectorRatio !== null && sectorRatio < 0.75) reasons.push("coverage.sectors_below_baseline");
  if (uniqueAircraftRatio !== null && uniqueAircraftRatio < 0.55) reasons.push("coverage.unique_aircraft_below_baseline");
  if (messageRatio !== null && messageRatio < 0.60) reasons.push("coverage.messages_below_baseline");

  const severeRange = rangeRatio !== null && rangeRatio < 0.55;
  const severeSectors = sectorRatio !== null && sectorRatio < 0.50;
  const corroboratedDrop = reasons.filter((reason) =>
    reason === "coverage.range_below_baseline"
    || reason === "coverage.sectors_below_baseline"
    || reason === "coverage.messages_below_baseline",
  ).length >= 2;

  return {
    version: "receiver-coverage-intelligence-v1",
    trend: { methodology: "daily-receiver-aggregates", currentDay, recentDays },
    health: {
      state: severeRange || severeSectors || corroboratedDrop ? "DEGRADED" : "GOOD",
      evaluatedDate: evaluated.date,
      baselineDays: baseline.length,
      rangeRatio,
      sectorRatio,
      uniqueAircraftRatio,
      messageRatio,
      reasons,
    },
  };
}
