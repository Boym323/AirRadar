import { execFileSync, spawnSync } from "node:child_process";

const root = process.cwd();
const run = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const git = (args) => {
  try { return run(args); } catch { return ""; }
};

const base = process.env.AIRRADAR_TEST_BASE_SHA || "HEAD";
const committed = git(["diff", "--name-only", base + "...HEAD"]);
const staged = git(["diff", "--cached", "--name-only"]);
const unstaged = git(["diff", "--name-only"]);
const untracked = git(["ls-files", "--others", "--exclude-standard"]);
const changed = [...new Set([committed, staged, unstaged, untracked].flatMap((value) => value ? value.split("\n") : []))];

const globalPatterns = [
  /^(package\.json|package-lock\.json)$/,
  /^vitest[^/]*\.config\.[cm]?[jt]sx?$/,
  /^tsconfig[^/]*\.json$/,
  /^prisma\/schema\.prisma$/,
  /^(next\.config\.[cm]?[jt]sx?|test-setup\.[cm]?[jt]sx?)$/,
  /(^|\/)(global|shared|types)\.[cm]?[jt]sx?$/,
];

const isGlobal = changed.some((file) => globalPatterns.some((pattern) => pattern.test(file)));
if (isGlobal) {
  process.stdout.write(`test:changed: global change detected; running full suite\n`);
  process.exit(spawnSync("npx", ["vitest", "run"], { stdio: "inherit" }).status ?? 1);
}

const changedArgs = ["vitest", "run", "--changed", base];
const changedResult = spawnSync("npx", changedArgs, { stdio: "inherit" });
if ((changedResult.status ?? 1) !== 0) process.exit(changedResult.status ?? 1);

const untrackedProduction = untracked.split("\n").filter((file) => file && /^(app|components|lib|scripts)\/.*\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file));
if (untrackedProduction.length > 0) {
  process.stdout.write(`test:changed: checking untracked production files with related\n`);
  const related = spawnSync("npx", ["vitest", "related", "--run", ...untrackedProduction], { stdio: "inherit" });
  if ((related.status ?? 1) !== 0) process.exit(related.status ?? 1);
}
