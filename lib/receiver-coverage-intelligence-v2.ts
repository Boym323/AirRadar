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
