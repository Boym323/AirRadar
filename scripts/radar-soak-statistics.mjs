import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

/** Nearest-rank percentile of bounded, directly observed samples. */
export function nearestRank(samples, percentile) {
  if (!samples.length) return null;
  if (!(percentile > 0 && percentile <= 1)) throw new RangeError("percentile must be within (0, 1]");
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * percentile) - 1)];
}

export function summarizeDistribution(rawSamples) {
  const values = rawSamples.filter((n) => typeof n === "number" && Number.isFinite(n) && n >= 0);
  if (!values.length) return { sampleCount: 0, mean: null, p50: null, p95: null, p99: null, max: null };
  const mean = values.reduce((sum, n) => sum + n, 0) / values.length;
  return {
    sampleCount: values.length, mean,
    p50: nearestRank(values, 0.5), p95: nearestRank(values, 0.95),
    p99: nearestRank(values, 0.99), max: Math.max(...values),
  };
}

/** /proc/PID/stat fields 14 and 15 after removing the comm field in parentheses. */
export function parseLinuxCpuTicks(statLine) {
  if (typeof statLine !== "string") return null;
  const end = statLine.lastIndexOf(")");
  if (end < 0) return null;
  const columns = statLine.slice(end + 1).trim().split(/\s+/);
  const utime = Number(columns[11]);
  const stime = Number(columns[12]);
  return Number.isSafeInteger(utime) && utime >= 0 && Number.isSafeInteger(stime) && stime >= 0
    ? utime + stime : null;
}

/** Percentage of one logical CPU. 100% = one saturated core, >100% is valid. */
export function cpuPercent(previous, current, ticksPerSecond) {
  if (!previous || !current || !(ticksPerSecond > 0)) return null;
  const elapsedMs = current.atMs - previous.atMs;
  const ticks = current.ticks - previous.ticks;
  if (!(elapsedMs > 0) || ticks < 0) return null;
  return ticks * 100_000 / (ticksPerSecond * elapsedMs);
}

export function startCpuSampler(pid, intervalMs = 1000) {
  let ticksPerSecond = null;
  try {
    const parsed = Number(execFileSync("getconf", ["CLK_TCK"], { encoding: "utf8" }).trim());
    if (Number.isFinite(parsed) && parsed > 0) ticksPerSecond = parsed;
  } catch { /* Non-Linux runners report CPU distribution unavailable. */ }
  const samples = [];
  const read = () => {
    try {
      const ticks = parseLinuxCpuTicks(readFileSync(`/proc/${pid}/stat`, "utf8"));
      return ticks === null ? null : { ticks, atMs: performance.now() };
    } catch { return null; }
  };
  let previous = ticksPerSecond ? read() : null;
  const timer = setInterval(() => {
    const next = read();
    const value = cpuPercent(previous, next, ticksPerSecond);
    if (value !== null && samples.length < 1024) samples.push(value);
    previous = next;
  }, intervalMs);
  timer.unref?.();
  return {
    finish() {
      clearInterval(timer);
      return {
        unit: "percent_of_one_core", intervalMs, ticksPerSecond,
        available: Boolean(ticksPerSecond) && samples.length > 0,
        ...summarizeDistribution(samples),
      };
    },
  };
}
