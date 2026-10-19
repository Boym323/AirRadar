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
  const recentCompleted = completedLimit > 0 ? completed.slice(-completedLimit) : [];
  const recentDays = [...recentCompleted, ...(currentDay ? [currentDay] : [])];

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

// Rolling capture evidence complements physical daily range observations.
export type ReceiverCoverageV2HealthState = "GOOD" | "DEGRADED" | "RECOVERING" | "INSUFFICIENT_DATA";
export type ReceiverCoverageV2SectorState = "GOOD" | "DEGRADED" | "IMPROVED" | "INSUFFICIENT_DATA";

export interface ReceiverCoverageHourlyEvidenceRow {
  hour: string;
  dimension: string;
  bucketKey: string;
  availableCount: number;
  capturedCount: number;
}

export interface ReceiverCoverageV2HourlyPoint {
  hour: string;
  available: number;
  captured: number;
  captureRatio: number | null;
}

export interface ReceiverCoverageV2Sector {
  bearingFrom: number;
  bearingTo: number;
  currentAvailable: number;
  currentCaptured: number;
  currentRatio: number | null;
  baselineAvailable: number;
  baselineCaptured: number;
  baselineRatio: number | null;
  deltaPercentagePoints: number | null;
  state: ReceiverCoverageV2SectorState;
}

export interface ReceiverCoverageIntelligenceV2 {
  version: "receiver-coverage-intelligence-v2";
  methodology: "rolling-24h-vs-prior-7d-hourly-capture";
  window: {
    currentFrom: string;
    currentTo: string;
    baselineFrom: string;
    baselineTo: string;
  };
  health: {
    state: ReceiverCoverageV2HealthState;
    currentRatio: number | null;
    baselineRatio: number | null;
    deltaPercentagePoints: number | null;
    last6hRatio: number | null;
    previous18hRatio: number | null;
    degradedSectors: number;
    improvedSectors: number;
    evaluatedSectors: number;
    reasons: string[];
  };
  hourly: ReceiverCoverageV2HourlyPoint[];
  sectors: ReceiverCoverageV2Sector[];
}

const HOUR_MS = 3_600_000;
const CURRENT_HOURS = 24;
const BASELINE_HOURS = 7 * 24;
const MIN_CURRENT_SECTOR_AVAILABLE = 40;
const MIN_BASELINE_SECTOR_AVAILABLE = 200;
const MIN_CURRENT_OVERALL_AVAILABLE = 120;
const MIN_BASELINE_OVERALL_AVAILABLE = 800;

function safeCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function aggregate(rows: readonly ReceiverCoverageHourlyEvidenceRow[]): { available: number; captured: number } {
  let available = 0;
  let captured = 0;
  for (const row of rows) {
    available += safeCount(row.availableCount);
    captured += safeCount(row.capturedCount);
  }
  return { available, captured: Math.min(available, captured) };
}

function captureRatio(value: { available: number; captured: number }): number | null {
  return value.available > 0 ? value.captured / value.available : null;
}

function percentagePointDelta(current: number | null, baseline: number | null): number | null {
  return current === null || baseline === null ? null : (current - baseline) * 100;
}

function normalizedHour(value: number): string {
  return new Date(Math.floor(value / HOUR_MS) * HOUR_MS).toISOString();
}

function within(value: number, from: number, to: number): boolean {
  return value >= from && value < to;
}

function sectorIndex(bucketKey: string): number | null {
  const match = /^azimuth:(\d{1,2})$/.exec(bucketKey);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isInteger(value) && value >= 0 && value < 36 ? value : null;
}

export function buildReceiverCoverageIntelligenceV2(input: {
  now: Date;
  rows: readonly ReceiverCoverageHourlyEvidenceRow[];
}): ReceiverCoverageIntelligenceV2 {
  const nowMs = input.now.getTime();
  const currentToMs = nowMs;
  const currentFromMs = currentToMs - CURRENT_HOURS * HOUR_MS;
  const baselineToMs = currentFromMs;
  const baselineFromMs = baselineToMs - BASELINE_HOURS * HOUR_MS;

  const parsed = input.rows
    .map((row) => ({ row, at: Date.parse(row.hour) }))
    .filter((item) => Number.isFinite(item.at) && within(item.at, baselineFromMs, currentToMs));

  const currentOverallRows = parsed
    .filter((item) => within(item.at, currentFromMs, currentToMs) && item.row.bucketKey === "overall")
    .map((item) => item.row);
  const baselineOverallRows = parsed
    .filter((item) => within(item.at, baselineFromMs, baselineToMs) && item.row.bucketKey === "overall")
    .map((item) => item.row);
  const currentOverall = aggregate(currentOverallRows);
  const baselineOverall = aggregate(baselineOverallRows);
  const currentRatio = currentOverall.available >= MIN_CURRENT_OVERALL_AVAILABLE ? captureRatio(currentOverall) : null;
  const baselineRatio = baselineOverall.available >= MIN_BASELINE_OVERALL_AVAILABLE ? captureRatio(baselineOverall) : null;
  const deltaPercentagePoints = percentagePointDelta(currentRatio, baselineRatio);

  const hourlyMap = new Map<string, { available: number; captured: number }>();
  for (const item of parsed) {
    if (!within(item.at, currentFromMs, currentToMs) || item.row.bucketKey !== "overall") continue;
    const key = normalizedHour(item.at);
    const current = hourlyMap.get(key) ?? { available: 0, captured: 0 };
    const available = current.available + safeCount(item.row.availableCount);
    const captured = current.captured + safeCount(item.row.capturedCount);
    hourlyMap.set(key, { available, captured: Math.min(available, captured) });
  }
  const hourly = [...hourlyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hour, value]) => ({ hour, ...value, captureRatio: captureRatio(value) }));

  const sixHoursAgo = currentToMs - 6 * HOUR_MS;
  const last6 = aggregate(parsed
    .filter((item) => within(item.at, sixHoursAgo, currentToMs) && item.row.bucketKey === "overall")
    .map((item) => item.row));
  const previous18 = aggregate(parsed
    .filter((item) => within(item.at, currentFromMs, sixHoursAgo) && item.row.bucketKey === "overall")
    .map((item) => item.row));
  const last6hRatio = last6.available >= 30 ? captureRatio(last6) : null;
  const previous18hRatio = previous18.available >= 90 ? captureRatio(previous18) : null;

  const sectors: ReceiverCoverageV2Sector[] = Array.from({ length: 36 }, (_, index) => {
    const current = aggregate(parsed
      .filter((item) => within(item.at, currentFromMs, currentToMs) && sectorIndex(item.row.bucketKey) === index)
      .map((item) => item.row));
    const baseline = aggregate(parsed
      .filter((item) => within(item.at, baselineFromMs, baselineToMs) && sectorIndex(item.row.bucketKey) === index)
      .map((item) => item.row));
    const currentSectorRatio = current.available >= MIN_CURRENT_SECTOR_AVAILABLE ? captureRatio(current) : null;
    const baselineSectorRatio = baseline.available >= MIN_BASELINE_SECTOR_AVAILABLE ? captureRatio(baseline) : null;
    const delta = percentagePointDelta(currentSectorRatio, baselineSectorRatio);
    let state: ReceiverCoverageV2SectorState = "INSUFFICIENT_DATA";
    if (currentSectorRatio !== null && baselineSectorRatio !== null && delta !== null) {
      const relative = baselineSectorRatio > 0 ? currentSectorRatio / baselineSectorRatio : 1;
      if (delta <= -15 && relative < 0.75) state = "DEGRADED";
      else if (delta >= 15 && currentSectorRatio > baselineSectorRatio) state = "IMPROVED";
      else state = "GOOD";
    }
    return {
      bearingFrom: index * 10,
      bearingTo: index * 10 + 10,
      currentAvailable: current.available,
      currentCaptured: current.captured,
      currentRatio: currentSectorRatio,
      baselineAvailable: baseline.available,
      baselineCaptured: baseline.captured,
      baselineRatio: baselineSectorRatio,
      deltaPercentagePoints: delta,
      state,
    };
  });

  const degradedSectors = sectors.filter((sector) => sector.state === "DEGRADED").length;
  const improvedSectors = sectors.filter((sector) => sector.state === "IMPROVED").length;
  const evaluatedSectors = sectors.filter((sector) => sector.state !== "INSUFFICIENT_DATA").length;
  const reasons: string[] = [];

  if (currentRatio === null || baselineRatio === null || evaluatedSectors < 8) {
    reasons.push("coverage_v2.baseline_insufficient");
    return {
      version: "receiver-coverage-intelligence-v2",
      methodology: "rolling-24h-vs-prior-7d-hourly-capture",
      window: {
        currentFrom: new Date(currentFromMs).toISOString(),
        currentTo: new Date(currentToMs).toISOString(),
        baselineFrom: new Date(baselineFromMs).toISOString(),
        baselineTo: new Date(baselineToMs).toISOString(),
      },
      health: {
        state: "INSUFFICIENT_DATA",
        currentRatio,
        baselineRatio,
        deltaPercentagePoints,
        last6hRatio,
        previous18hRatio,
        degradedSectors,
        improvedSectors,
        evaluatedSectors,
        reasons,
      },
      hourly,
      sectors,
    };
  }

  if (deltaPercentagePoints !== null && deltaPercentagePoints <= -10) reasons.push("coverage_v2.overall_capture_below_baseline");
  if (degradedSectors >= 3) reasons.push("coverage_v2.sector_degradation");
  const materiallyDegraded = reasons.length > 0;
  const recoverySignal = materiallyDegraded
    && last6hRatio !== null
    && previous18hRatio !== null
    && last6hRatio - previous18hRatio >= 0.08;

  return {
    version: "receiver-coverage-intelligence-v2",
    methodology: "rolling-24h-vs-prior-7d-hourly-capture",
    window: {
      currentFrom: new Date(currentFromMs).toISOString(),
      currentTo: new Date(currentToMs).toISOString(),
      baselineFrom: new Date(baselineFromMs).toISOString(),
      baselineTo: new Date(baselineToMs).toISOString(),
    },
    health: {
      state: recoverySignal ? "RECOVERING" : materiallyDegraded ? "DEGRADED" : "GOOD",
      currentRatio,
      baselineRatio,
      deltaPercentagePoints,
      last6hRatio,
      previous18hRatio,
      degradedSectors,
      improvedSectors,
      evaluatedSectors,
      reasons,
    },
    hourly,
    sectors,
  };
}

/**
 * Evaluate both daily physical coverage and rolling reference-capture coverage.
 * Existing API field names remain unchanged for compatibility.
 */
export function buildReceiverCoverageIntelligence(input: {
  daily: Parameters<typeof buildReceiverCoverageIntelligenceV1>[0];
  rolling: Parameters<typeof buildReceiverCoverageIntelligenceV2>[0];
}): { daily: ReceiverCoverageIntelligenceV1; rolling: ReceiverCoverageIntelligenceV2 } {
  return {
    daily: buildReceiverCoverageIntelligenceV1(input.daily),
    rolling: buildReceiverCoverageIntelligenceV2(input.rolling),
  };
}
