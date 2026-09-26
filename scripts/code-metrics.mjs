#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const HISTORY_PATH = path.join(ROOT, "docs/metrics/code-history.json");
const SVG_PATH = path.join(ROOT, "docs/metrics/code-growth.svg");

const INCLUDED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".css",
  ".scss",
  ".sh",
  ".py",
  ".sql",
  ".prisma",
]);

const EXCLUDED_PREFIXES = [
  ".github/",
  ".next/",
  ".cache/",
  "coverage/",
  "dist/",
  "build/",
  "docs/",
  "migrations/",
  "node_modules/",
  "public/",
  "generated/",
  "src/generated/",
];

function normalizeRepositoryPath(filePath) {
  return filePath.replaceAll("\\", "/").replace(/^\.\/+/, "");
}

export function classifyPath(filePath) {
  const normalized = normalizeRepositoryPath(filePath);

  if (EXCLUDED_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return null;
  }

  const extension = path.extname(normalized).toLowerCase();
  if (!INCLUDED_EXTENSIONS.has(extension)) {
    return null;
  }

  const base = path.basename(normalized);
  const isTest =
    normalized.startsWith("tests/") ||
    normalized.startsWith("test/") ||
    normalized.includes("/__tests__/") ||
    /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(base) ||
    /^vitest(?:\..+)?\.config\.[cm]?[jt]s$/.test(base) ||
    /^playwright(?:\..+)?\.config\.[cm]?[jt]s$/.test(base);

  return isTest ? "tests" : "production";
}

export function countNonEmptyLines(content) {
  if (!content) return 0;
  return content
    .split(/\r?\n/)
    .reduce((count, line) => count + (line.trim().length > 0 ? 1 : 0), 0);
}

function git(...args) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
}

function trackedFiles() {
  const output = execFileSync("git", ["ls-files", "-z"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });

  return output.split("\0").filter(Boolean);
}

async function scanCodebase() {
  const totals = {
    production: { files: 0, loc: 0 },
    tests: { files: 0, loc: 0 },
  };

  for (const filePath of trackedFiles()) {
    const category = classifyPath(filePath);
    if (!category) continue;

    const content = await readFile(path.join(ROOT, filePath), "utf8");
    totals[category].files += 1;
    totals[category].loc += countNonEmptyLines(content);
  }

  return totals;
}

async function loadHistory() {
  try {
    const parsed = JSON.parse(await readFile(HISTORY_PATH, "utf8"));
    if (
      parsed?.schemaVersion === 1 &&
      parsed?.metric === "non-empty-physical-lines" &&
      Array.isArray(parsed.snapshots)
    ) {
      return parsed;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  return {
    schemaVersion: 1,
    metric: "non-empty-physical-lines",
    description:
      "Tracked non-empty physical source lines. Production excludes tests, docs, migrations, generated output and public vendor assets.",
    snapshots: [],
  };
}

function sameCounts(snapshot, totals) {
  return (
    snapshot?.production?.loc === totals.production.loc &&
    snapshot?.production?.files === totals.production.files &&
    snapshot?.tests?.loc === totals.tests.loc &&
    snapshot?.tests?.files === totals.tests.files
  );
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatCompact(value) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  return String(value);
}

function niceMax(value) {
  if (value <= 0) return 1;
  const exponent = 10 ** Math.floor(Math.log10(value));
  const normalized = value / exponent;
  const nice =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * exponent;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function pointPath(values, xFor, yFor) {
  if (values.length === 0) return "";
  return values
    .map(
      (value, index) =>
        `${index === 0 ? "M" : "L"} ${xFor(index).toFixed(1)} ${yFor(value).toFixed(1)}`,
    )
    .join(" ");
}

function labelIndexes(count, desired = 6) {
  if (count <= desired) return Array.from({ length: count }, (_, index) => index);
  const result = new Set([0, count - 1]);
  for (let step = 1; step < desired - 1; step += 1) {
    result.add(Math.round((step * (count - 1)) / (desired - 1)));
  }
  return [...result].sort((a, b) => a - b);
}

export function renderSvg(history) {
  const snapshots = history.snapshots ?? [];
  const width = 960;
  const height = 400;

  if (snapshots.length === 0) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">AirRadar codebase growth</title>
  <desc id="desc">The first metrics snapshot will be generated after the workflow runs on main.</desc>
  <rect width="100%" height="100%" rx="12" fill="#ffffff"/>
  <text x="48" y="72" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="24" font-weight="700" fill="#1f2328">AirRadar codebase growth</text>
  <text x="48" y="110" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="15" fill="#59636e">Awaiting first metrics snapshot on main.</text>
</svg>
`;
  }

  const margin = { top: 92, right: 32, bottom: 56, left: 72 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const productionValues = snapshots.map((snapshot) => snapshot.production.loc);
  const testValues = snapshots.map((snapshot) => snapshot.tests.loc);
  const maximum = niceMax(Math.max(...productionValues, ...testValues));
  const latest = snapshots.at(-1);
  const xFor = (index) =>
    margin.left +
    (snapshots.length === 1
      ? plotWidth / 2
      : (index / (snapshots.length - 1)) * plotWidth);
  const yFor = (value) => margin.top + plotHeight - (value / maximum) * plotHeight;
  const productionPath = pointPath(productionValues, xFor, yFor);
  const testPath = pointPath(testValues, xFor, yFor);

  const grid = Array.from({ length: 6 }, (_, index) => {
    const ratio = index / 5;
    const value = maximum * (1 - ratio);
    const y = margin.top + ratio * plotHeight;
    return `<line x1="${margin.left}" y1="${y.toFixed(1)}" x2="${width - margin.right}" y2="${y.toFixed(1)}" stroke="#d8dee4" stroke-width="1"/>
  <text x="${margin.left - 12}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="12" fill="#6e7781">${escapeXml(formatCompact(Math.round(value)))}</text>`;
  }).join("\n  ");

  const xLabels = labelIndexes(snapshots.length)
    .map((index) => {
      const snapshot = snapshots[index];
      const date = new Date(snapshot.timestamp);
      const label = Number.isNaN(date.valueOf())
        ? snapshot.timestamp.slice(0, 10)
        : date.toISOString().slice(0, 10);
      return `<text x="${xFor(index).toFixed(1)}" y="${height - 24}" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="12" fill="#6e7781">${escapeXml(label)}</text>`;
    })
    .join("\n  ");

  const lastIndex = snapshots.length - 1;
  const productionCircle = `<circle cx="${xFor(lastIndex).toFixed(1)}" cy="${yFor(latest.production.loc).toFixed(1)}" r="4.5" fill="#0969da"/>`;
  const testCircle = `<circle cx="${xFor(lastIndex).toFixed(1)}" cy="${yFor(latest.tests.loc).toFixed(1)}" r="4.5" fill="#8250df"/>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">AirRadar codebase growth</title>
  <desc id="desc">Line chart of non-empty physical source lines split between production code and tests.</desc>
  <rect width="100%" height="100%" rx="12" fill="#ffffff"/>
  <text x="48" y="48" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="24" font-weight="700" fill="#1f2328">AirRadar codebase growth</text>
  <text x="48" y="72" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="13" fill="#59636e">Non-empty physical source lines · snapshots only when code counts change</text>

  <line x1="500" y1="47" x2="528" y2="47" stroke="#0969da" stroke-width="3" stroke-linecap="round"/>
  <text x="536" y="51" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="13" font-weight="600" fill="#1f2328">Production ${escapeXml(formatNumber(latest.production.loc))}</text>
  <line x1="700" y1="47" x2="728" y2="47" stroke="#8250df" stroke-width="3" stroke-linecap="round"/>
  <text x="736" y="51" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="13" font-weight="600" fill="#1f2328">Tests ${escapeXml(formatNumber(latest.tests.loc))}</text>

  ${grid}

  <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotHeight}" stroke="#8c959f" stroke-width="1"/>
  <line x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${width - margin.right}" y2="${margin.top + plotHeight}" stroke="#8c959f" stroke-width="1"/>

  <path d="${productionPath}" fill="none" stroke="#0969da" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${testPath}" fill="none" stroke="#8250df" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  ${productionCircle}
  ${testCircle}

  ${xLabels}
</svg>
`;
}

async function main() {
  const totals = await scanCodebase();
  const history = await loadHistory();
  const commit = (process.env.GITHUB_SHA || git("rev-parse", "HEAD")).slice(0, 12);
  const timestamp = process.env.METRICS_TIMESTAMP || new Date().toISOString();
  const latest = history.snapshots.at(-1);

  if (!sameCounts(latest, totals)) {
    history.snapshots.push({
      timestamp,
      commit,
      production: totals.production,
      tests: totals.tests,
      totalLoc: totals.production.loc + totals.tests.loc,
    });
  }

  history.snapshots = history.snapshots.slice(-400);

  await mkdir(path.dirname(HISTORY_PATH), { recursive: true });
  await writeFile(HISTORY_PATH, `${JSON.stringify(history, null, 2)}\n`, "utf8");
  await writeFile(SVG_PATH, renderSvg(history), "utf8");

  console.log(
    `Code metrics: production=${totals.production.loc} LOC (${totals.production.files} files), ` +
      `tests=${totals.tests.loc} LOC (${totals.tests.files} files)`,
  );
}

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isMainModule) {
  await main();
}
