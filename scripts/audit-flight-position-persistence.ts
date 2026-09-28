import { mkdir, writeFile } from "node:fs/promises";
import {
  DEFAULT_FLIGHT_POSITION_POLICY_CONTEXT,
  makeFlightPositionPolicySample,
  shouldPersistFlightPosition,
  type FlightPositionCandidate,
  type PersistedFlightPositionSample,
} from "@/lib/server/flight-position-persistence-policy";

type Scenario = { name: string; points: FlightPositionCandidate[]; eventIndexes: number[] };

function point(index: number, patch: Partial<FlightPositionCandidate> = {}): FlightPositionCandidate {
  return {
    recordedAtMs: index * 20_000,
    lat: 50 + index * 0.001,
    lon: 14 + index * 0.001,
    altitudeFt: 30_000,
    trackDeg: 90,
    groundSpeedKt: 430,
    verticalRateFpm: 0,
    onGround: false,
    source: "ADS-B",
    airportProximity: false,
    phase: "cruise",
    ...patch,
  };
}

function makeScenarios(): Scenario[] {
  const cruise = Array.from({ length: 31 }, (_, index) => point(index, { lat: 50 + index * 0.0001, lon: 14 + index * 0.0001 }));
  const climb = Array.from({ length: 31 }, (_, index) => point(index, { altitudeFt: 5_000 + index * 900, verticalRateFpm: 1_200, phase: "climb" }));
  const approach = Array.from({ length: 31 }, (_, index) => point(index, { lat: 50.1 + index * 0.001, lon: 14.1 + index * 0.001, altitudeFt: 4_000 - index * 100, verticalRateFpm: -600, trackDeg: index < 15 ? 270 : 90, airportProximity: index >= 15, phase: index >= 15 ? "approach" : "descent" }));
  const goAround = approach.map((item, index) => index < 24 ? item : { ...item, altitudeFt: (item.altitudeFt ?? 0) + (index - 23) * 500, verticalRateFpm: 1_000, airportProximity: true, phase: "airport" as const });
  const holding = Array.from({ length: 31 }, (_, index) => point(index, { trackDeg: (90 + (index % 4) * 90) % 360, phase: "unknown" }));
  const sparse = [point(0), point(1), point(2), point(8, { recordedAtMs: 190_000 })];
  return [
    { name: "stable-cruise", points: cruise, eventIndexes: [] },
    { name: "continuous-climb", points: climb, eventIndexes: [10, 20] },
    { name: "approach-landing", points: approach, eventIndexes: [25, 30] },
    { name: "go-around", points: goAround, eventIndexes: [24, 28] },
    { name: "holding", points: holding, eventIndexes: [8, 16, 24] },
    { name: "ads-b-interruption", points: sparse, eventIndexes: [3] },
  ];
}

function persistWith(strategy: "A-current" | "B-longer-fixed" | "C-adaptive" | "D-adaptive-heartbeat", points: FlightPositionCandidate[]): PersistedFlightPositionSample[] {
  const result: PersistedFlightPositionSample[] = [];
  let previous: PersistedFlightPositionSample | null = null;
  for (const candidate of points) {
    const elapsed = previous ? candidate.recordedAtMs - previous.recordedAtMs : Number.POSITIVE_INFINITY;
    const fixedDue = strategy === "A-current" ? elapsed >= 20_000 : strategy === "B-longer-fixed" ? elapsed >= 60_000 : false;
    const adaptive = strategy === "C-adaptive" || strategy === "D-adaptive-heartbeat"
      ? shouldPersistFlightPosition(previous, candidate, {
        ...DEFAULT_FLIGHT_POSITION_POLICY_CONTEXT,
        heartbeatMs: strategy === "D-adaptive-heartbeat" ? 120_000 : 60_000,
      }).persist
      : false;
    if (!previous || fixedDue || adaptive) {
      previous = makeFlightPositionPolicySample(candidate);
      result.push(previous);
    }
  }
  return result;
}

function metrics(scenario: Scenario, points: PersistedFlightPositionSample[]) {
  const gaps = points.slice(1).map((item, index) => item.recordedAtMs - points[index]!.recordedAtMs);
  const eventParity = scenario.eventIndexes.every((eventIndex) => {
    const target = scenario.points[eventIndex]?.recordedAtMs;
    return target === undefined || points.some((item) => Math.abs(item.recordedAtMs - target) <= 60_000);
  });
  return {
    inputPoints: scenario.points.length,
    persistedPoints: points.length,
    reductionPercent: Number(((1 - points.length / scenario.points.length) * 100).toFixed(2)),
    maxTemporalGapMs: Math.max(0, ...gaps),
    medianTemporalGapMs: gaps.length ? gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : 0,
    eventParity,
  };
}

async function main() {
  const scenarios = makeScenarios();
  const strategies = ["A-current", "B-longer-fixed", "C-adaptive", "D-adaptive-heartbeat"] as const;
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    safety: "Replay-only synthetic dataset. No database reads, writes, migrations, deployment, or production shadow data.",
    scenarios: scenarios.map((scenario) => ({
      name: scenario.name,
      strategies: Object.fromEntries(strategies.map((strategy) => [strategy, metrics(scenario, persistWith(strategy, scenario.points))])),
    })),
  };
  await mkdir("artifacts", { recursive: true });
  await writeFile("artifacts/flight-position-persistence-audit.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
