#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const samples = Math.min(100, Math.max(1, Number(process.env.T50_HEALTH_SAMPLES ?? 20)));
const localUrl = process.env.T50_HEALTH_LOCAL_URL ?? "http://192.168.1.142:3000/api/health";
const publicUrl = process.env.T50_HEALTH_PUBLIC_URL ?? "https://airradar.pomykal.cz/api/health";

function sample(path, url) {
  const format = JSON.stringify({ path, http: "%{http_code}", remote: "%{remote_ip}", connect: "%{time_connect}", ttfb: "%{time_starttransfer}", total: "%{time_total}", size: "%{size_download}" });
  try {
    const result = execFileSync("curl", ["--silent", "--show-error", "--max-time", "8", "--output", "/dev/null", "--write-out", format, url], { encoding: "utf8" });
    return JSON.parse(result);
  } catch (error) {
    return { path, error: error instanceof Error ? error.name : "curl_error" };
  }
}

const rows = [];
for (let index = 0; index < samples; index += 1) {
  const measuredAt = new Date().toISOString();
  rows.push({ measuredAt, local: sample("local", localUrl), public: sample("public", publicUrl) });
}

function percentile(values, ratio) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function summary(path) {
  const values = rows.map((row) => Number(row[path]?.total)).filter(Number.isFinite);
  return { samples: values.length, p50Seconds: percentile(values, 0.5), p95Seconds: percentile(values, 0.95), maxSeconds: values.length ? Math.max(...values) : null };
}

console.log(JSON.stringify({ schemaVersion: 1, endpoint: "/api/health", samples, rows, summary: { local: summary("local"), public: summary("public") } }, null, 2));
