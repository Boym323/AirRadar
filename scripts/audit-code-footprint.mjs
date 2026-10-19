#!/usr/bin/env node
/**
 * Conservative code footprint audit. Unreachable != safe to delete:
 * dynamic imports, manually invoked scripts and external integrations
 * require independent investigation before pruning.
 *
 * Run: node scripts/audit-code-footprint.mjs
 * Never rewrites tracked files, runs a migration or accesses the network.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const sourceExtensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".scss"];
const metricExtensions = new Set([...sourceExtensions, ".sh", ".py", ".sql", ".prisma"]);
const excluded = [".github/", ".next/", ".cache/", "coverage/", "dist/", "build/",
  "docs/", "migrations/", "node_modules/", "public/", "generated/", "src/generated/"];
const paths = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
  .split("\0").filter(Boolean);
const pathSet = new Set(paths);
const tracked = paths.filter((p) => !excluded.some((prefix) => p.startsWith(prefix))
  && metricExtensions.has(path.extname(p).toLowerCase()));
const isTest = (p) => p.startsWith("tests/") || p.startsWith("test/") ||
  p.includes("/__tests__/") || /\.(test|spec)\.[cm]?[jt]sx?$/.test(p) ||
  /^vitest(\..+)?\.config\.[cm]?[jt]s$/.test(path.basename(p)) ||
  /^playwright(\..+)?\.config\.[cm]?[jt]s$/.test(path.basename(p));
const fileContent = new Map();
function content(p) {
  if (!fileContent.has(p)) fileContent.set(p, readFileSync(p, "utf8"));
  return fileContent.get(p);
}
const nonEmpty = (src) => src.split(/\r?\n/).filter((line) => line.trim()).length;
const production = tracked.filter((p) => !isTest(p));
const tests = tracked.filter(isTest);
const totals = {
  production: { files: production.length, loc: production.reduce((s, p) => s + nonEmpty(content(p)), 0) },
  tests: { files: tests.length, loc: tests.reduce((s, p) => s + nonEmpty(content(p)), 0) },
};
const imports = new Map();
const graphPaths = tracked.filter((p) => /\.[cm]?[jt]sx?$/.test(p));
function resolveImport(origin, specifier) {
  if (typeof specifier !== "string") return null;
  if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return null;
  const base = specifier.startsWith("@/")
    ? specifier.slice(2) : path.posix.normalize(path.posix.join(path.posix.dirname(origin), specifier));
  const candidates = [base, ...sourceExtensions.map((ext) => base + ext),
    ...sourceExtensions.map((ext) => base + "/index" + ext)];
  return candidates.find((p) => pathSet.has(p)) ?? null;
}
for (const p of graphPaths) {
  const edges = new Set();
  const source = content(p);
  const ast = ts.createSourceFile(p, source, ts.ScriptTarget.Latest, true,
    /\.tsx$/.test(p) ? ts.ScriptKind.TSX : /\.jsx$/.test(p) ? ts.ScriptKind.JSX : ts.ScriptKind.TS);
  function collect(node) {
    let value = null;
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier
      && ts.isStringLiteralLike(node.moduleSpecifier)) {
      value = node.moduleSpecifier.text;
    } else if (ts.isCallExpression(node) && node.arguments.length &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
      value = node.arguments[0].text;
    }
    const target = resolveImport(p, value);
    if (target) edges.add(target);
    ts.forEachChild(node, collect);
  }
  collect(ast);
  imports.set(p, edges);
}
const workflowTexts = paths.filter((p) => p.startsWith(".github/workflows/") && /\.ya?ml$/.test(p))
  .map(content).join("\n");
const packageScripts = JSON.stringify(JSON.parse(content("package.json")).scripts ?? {});
const deployReferences = paths.filter((p) => p.startsWith("deploy/") && /\.(sh|service|timer)$/.test(p))
  .map(content).join("\n");
const commandReferences = workflowTexts + "\n" + packageScripts + "\n" + deployReferences;
const productionRoots = production.filter((p) => p.startsWith("app/") ||
  /^(instrumentation(\.node)?|proxy|next\.config|prisma\.config|eslint\.config)\./.test(p) ||
  (p.startsWith("scripts/") && commandReferences.includes(p)) ||
  (p.startsWith("deploy/") && /\.(sh|py)$/.test(p)));
function reachable(roots) {
  const visited = new Set();
  const queue = [...roots];
  while (queue.length) {
    const p = queue.pop();
    if (visited.has(p)) continue;
    visited.add(p);
    for (const dep of imports.get(p) ?? []) if (!visited.has(dep)) queue.push(dep);
  }
  return visited;
}
const runtimeReachable = reachable(productionRoots);
const testReachable = reachable(tests);
const unreferenced = production
  .filter((p) => (p.startsWith("lib/") || p.startsWith("components/") || p.startsWith("scripts/")) &&
    /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(p) && !runtimeReachable.has(p))
  .map((p) => ({
    path: p,
    loc: nonEmpty(content(p)),
    inTests: testReachable.has(p),
    script: p.startsWith("scripts/"),
  })).sort((a, b) => b.loc - a.loc);

const featureGroups = [
  ["OGN/FLARM", /^(lib\/ogn\/|lib\/server\/ogn-|app\/api\/ogn\/|scripts\/update-ogn-)/],
  ["RXW ACARS/VDL2", /^(lib\/server\/rxw-|lib\/radar\/rxw-|lib\/aircraft\/rxw-|components\/historical-acars-)/],
  ["FlightAware", /^(lib\/server\/flightaware-|app\/api\/admin\/flightaware\/|scripts\/audit-flightaware-)/],
];
const optionalFootprint = featureGroups.map(([name, re]) => {
  const selected = production.filter((p) => re.test(p));
  return { name, files: selected.length,
    loc: selected.reduce((s, p) => s + nonEmpty(content(p)), 0),
    warning: "Lower bound only; shared UI, configuration, localization and tests excluded" };
});
const byArea = Object.entries(Object.groupBy(production, (p) => p.split("/")[0]))
  .map(([name, items]) => ({ area: name, files: items.length,
    loc: items.reduce((s, p) => s + nonEmpty(content(p)), 0) }))
  .sort((a, b) => b.loc - a.loc);
const result = { schemaVersion: 1, commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  totals, targetProductionLoc: 100000, linesToRemove: Math.max(0, totals.production.loc - 99999),
  byArea, optionalFootprint,
  conservativeRoots: productionRoots.length,
  reviewCandidates: unreferenced.length,
  reviewOnlyLoc: unreferenced.reduce((s, x) => s + x.loc, 0),
  topReviewCandidates: unreferenced.slice(0, 45),
  limitations: [
    "Static import graph only; computed imports, reflection, external CLI calls and code generation may be missed.",
    "Not reachable from Next.js/package/workflow/deploy roots does not prove dead code.",
    "Never delete candidates automatically; verify references, runtime contracts, tests and external consumers.",
    "Script/tooling LOC is counted as production by the existing canonical metric.",
  ] };
const summary = [
  "## AirRadar source footprint (review only)", "",
  "- Production: **" + result.totals.production.loc.toLocaleString("en-US") + "** nonempty lines",
  "- Tests: **" + result.totals.tests.loc.toLocaleString("en-US") + "**",
  "- Required production reduction to stay below 100,000: **" + result.linesToRemove.toLocaleString("en-US") + "**",
  "- Unreachable *candidates for manual review*, not proven dead: **" + result.reviewCandidates + "**",
  "", "| Area | LOC | Files |", "|---|---:|---:|",
  ...byArea.slice(0, 14).map((x) => "| " + x.area + " | " + x.loc + " | " + x.files + " |"),
  "", "### Optional subsystem lower bounds", "",
  ...optionalFootprint.map((x) => "- " + x.name + ": " + x.loc + " LOC in " + x.files + " exclusive files"),
  "", "### Largest unreferenced candidates (manual verification required)", "",
  ...unreferenced.slice(0, 25).map((x) => "- " + x.path + " — " + x.loc + " LOC" +
    (x.inTests ? " (used in tests)" : "") + (x.script ? " (manual CLI possible)" : "")),
  "", ...result.limitations.map((x) => "- ⚠ " + x), "",
].join("\n");
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
if (process.argv.includes("--json")) console.log(JSON.stringify(result));
