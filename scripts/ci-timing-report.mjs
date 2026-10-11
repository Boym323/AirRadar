#!/usr/bin/env node
/** Summarize one finished GitHub Actions CI run; no secrets or runner logs. */
import { fileURLToPath } from "node:url";

const REFERENCE_SECONDS = 589; // Successful pre-optimization main run on 2026-10-11.

function secondsBetween(start, end) {
  const a = Date.parse(start ?? "");
  const b = Date.parse(end ?? "");
  return Number.isFinite(a) && Number.isFinite(b) && b >= a ? Math.round((b - a) / 1000) : null;
}
function duration(value) {
  return value === null ? "–" : `${Math.floor(value / 60)}m ${String(value % 60).padStart(2, "0")}s`;
}
export function timingReport(payload) {
  if (!payload || !Array.isArray(payload.jobs)) throw new TypeError("Expected GitHub jobs payload");
  const names = ["Release scope", "Release validation", "Release tests and typecheck",
    "Release performance regression", "Deploy production"];
  const selected = payload.jobs.filter((job) => names.includes(job.name));
  const rows = selected.map((job) => ({
    name: job.name, conclusion: job.conclusion ?? job.status ?? "unknown",
    seconds: secondsBetween(job.started_at, job.completed_at),
  }));
  const deployment = selected.find((job) => job.name === "Deploy production" && job.conclusion === "success");
  const firstStart = selected.map((job) => Date.parse(job.started_at ?? "")).filter(Number.isFinite).sort((a,b)=>a-b)[0];
  const total = deployment && Number.isFinite(firstStart)
    ? secondsBetween(new Date(firstStart).toISOString(), deployment.completed_at) : null;
  const result = [
    "### AirRadar CI/CD timing",
    "",
    "| Job | Result | Wall time |",
    "|---|---|---:|",
    ...rows.map((row) => `| ${row.name} | ${row.conclusion} | ${duration(row.seconds)} |`),
    "",
    `**Main validation to successful production deploy:** ${duration(total)}.`,
    `Historical reference (2026-10-11): ${duration(REFERENCE_SECONDS)}. Not a guaranteed target: runner queue and change scope vary.`,
    "",
  ];
  return { rows, totalSeconds: total, markdown: result.join("\n") };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  try {
    process.stdout.write(timingReport(JSON.parse(raw)).markdown);
  } catch (error) {
    console.error(`ci-timing-report: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
