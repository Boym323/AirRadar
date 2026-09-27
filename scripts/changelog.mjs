import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = resolve(fileURLToPath(new URL("..", import.meta.url)));
const CHANGELOG_PATH = join(APP_DIR, "CHANGELOG.md");
const FEATURE_REGISTRY_PATH = join(APP_DIR, "docs/features.registry.json");

const CATEGORY_ORDER = [
  "Added",
  "Changed",
  "Fixed",
  "Performance",
  "Documentation",
  "Maintenance",
];

function git(args) {
  return execFileSync("git", ["-c", `safe.directory=${APP_DIR}`, ...args], {
    cwd: APP_DIR,
    encoding: "utf8",
  }).trim();
}

function latestReleaseTag() {
  try {
    return git(["describe", "--tags", "--match", "v[0-9]*", "--abbrev=0", "HEAD"]);
  } catch {
    return null;
  }
}

function commitsSince(tag) {
  const range = tag ? `${tag}..HEAD` : "HEAD";
  const output = git(["log", "--reverse", "--format=%h%x09%s", range]);
  return output ? output.split("\n").map((line) => {
    const [hash, ...subject] = line.split("\t");
    return { hash, subject: subject.join("\t") };
  }) : [];
}

function releaseTags() {
  return git(["tag", "--list", "v[0-9]*", "--sort=-version:refname"])
    .split("\n")
    .filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag));
}

function tagVersion(tag) {
  return tag.slice(1);
}

function tagDate(tag) {
  return git(["show", "-s", "--format=%cs", tag]);
}

function commitsBetween(previousTag, tag) {
  const range = previousTag ? `${previousTag}..${tag}` : tag;
  const output = git(["log", "--reverse", "--format=%h%x09%s", range]);
  return output ? output.split("\n").map((line) => {
    const [hash, ...subject] = line.split("\t");
    return { hash, subject: subject.join("\t") };
  }) : [];
}

function loadFeatureRegistry() {
  try {
    return JSON.parse(readFileSync(FEATURE_REGISTRY_PATH, "utf8"));
  } catch {
    return { features: [] };
  }
}

export function parseConventionalSubject(subject) {
  const match = subject.match(/^([a-z]+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/i);
  if (!match) {
    return {
      type: null,
      scope: null,
      breaking: false,
      summary: subject.trim(),
    };
  }

  return {
    type: match[1].toLowerCase(),
    scope: match[2]?.toLowerCase() ?? null,
    breaking: Boolean(match[3]),
    summary: match[4].trim(),
  };
}

export function categorizeCommit(subject) {
  if (/^Merge pull request\b/i.test(subject) || /^Merge branch\b/i.test(subject)) {
    return null;
  }

  const { type } = parseConventionalSubject(subject);
  switch (type) {
    case "feat":
      return "Added";
    case "fix":
      return "Fixed";
    case "perf":
      return "Performance";
    case "docs":
      return "Documentation";
    case "refactor":
    case "change":
    case "update":
    case "enhance":
    case "improve":
      return "Changed";
    case "test":
    case "ci":
    case "chore":
    case "build":
    case "style":
    case "revert":
      return "Maintenance";
    default:
      return "Changed";
  }
}

export function formatSummarySubject(subject) {
  const parsed = parseConventionalSubject(subject);
  const summary = parsed.summary.replace(/[.!]+$/, "");
  if (!summary) return subject;
  return summary.charAt(0).toUpperCase() + summary.slice(1);
}

export function featureNamesForCommits(commits, registry = loadFeatureRegistry()) {
  const names = new Set();

  for (const commit of commits) {
    const { scope } = parseConventionalSubject(commit.subject);
    if (!scope) continue;

    for (const feature of registry.features ?? []) {
      if ((feature.changelogScopes ?? []).includes(scope)) names.add(feature.name);
    }
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}

export function groupChangelogCommits(commits) {
  const groups = new Map(CATEGORY_ORDER.map((category) => [category, []]));

  for (const commit of commits) {
    const category = categorizeCommit(commit.subject);
    if (!category) continue;
    groups.get(category)?.push(commit);
  }

  return groups;
}

function renderCategorizedChanges(commits) {
  if (!commits.length) return "No user-facing changes.";

  const groups = groupChangelogCommits(commits);
  const sections = [];

  for (const category of CATEGORY_ORDER) {
    const categoryCommits = groups.get(category) ?? [];
    if (!categoryCommits.length) continue;

    sections.push(
      `### ${category}\n\n${categoryCommits
        .map(({ hash, subject }) => `- ${formatSummarySubject(subject)} (${hash})`)
        .join("\n")}`,
    );
  }

  return sections.length ? sections.join("\n\n") : "No user-facing changes.";
}

function renderTechnicalCommits(commits) {
  if (!commits.length) return "";
  return `<details>
<summary>Technical commits</summary>

${commits.map(({ hash, subject }) => `- ${subject} (${hash})`).join("\n")}

</details>`;
}

export function createChangelogEntry({
  version,
  date,
  previousTag,
  commits,
  registry = loadFeatureRegistry(),
}) {
  const comparison = previousTag ? `\n\nChanges since ${previousTag}.` : "";
  const features = featureNamesForCommits(commits, registry);
  const featureLine = features.length
    ? `\n\n**Features touched:** ${features.join(", ")}.`
    : "";
  const categorized = renderCategorizedChanges(commits);
  const technical = renderTechnicalCommits(commits);
  const technicalBlock = technical ? `\n\n${technical}` : "";

  return `## [${version}] - ${date}${comparison}${featureLine}\n\n${categorized}${technicalBlock}`;
}

export function updateChangelog({
  version,
  date,
  existing = "",
  previousTag = latestReleaseTag(),
  commits = commitsSince(previousTag),
  registry = loadFeatureRegistry(),
}) {
  const heading = `## [${version}]`;
  if (existing.includes(heading)) return existing;
  const entry = createChangelogEntry({ version, date, existing, previousTag, commits, registry });
  const prefix = existing.trim() || "# Changelog\n\nAll notable changes to AirRadar are documented here.\n";
  const firstEntry = prefix.search(/\n\n## \[/);
  if (firstEntry < 0) return `${prefix.trimEnd()}\n\n${entry}\n`;
  return `${prefix.slice(0, firstEntry).trimEnd()}\n\n${entry}\n\n${prefix.slice(firstEntry + 2).trimStart()}`;
}

function compareVersionsDescending(left, right) {
  const parse = (version) => {
    const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-rc\.(\d+))?$/);
    return match ? match.slice(1).map((part) => part === undefined ? -1 : Number(part)) : [0, 0, 0, -1];
  };
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? -1 : 1;
  }
  return 0;
}

export function normalizeChangelog(existing = "") {
  const marker = "\n\n## [";
  const firstEntry = existing.indexOf(marker);
  if (firstEntry < 0) return existing;
  const intro = existing.slice(0, firstEntry);
  const entries = existing.slice(firstEntry + 2).split(/\n\n(?=## \[)/).filter(Boolean);
  entries.sort((left, right) => compareVersionsDescending(
    left.match(/^## \[([^\]]+)\]/)?.[1] ?? "",
    right.match(/^## \[([^\]]+)\]/)?.[1] ?? "",
  ));
  return `${intro.trimEnd()}\n\n${entries.join("\n\n")}\n`;
}

export function missingChangelogVersions({ existing = "", tags = releaseTags() } = {}) {
  return tags
    .map(tagVersion)
    .filter((version) => !existing.includes(`## [${version}]`));
}

export function backfillChangelog({
  existing = "",
  tags = releaseTags(),
  releases = {},
  registry = loadFeatureRegistry(),
}) {
  const missingEntries = [];
  for (let index = 0; index < tags.length; index += 1) {
    const tag = tags[index];
    const version = tagVersion(tag);
    if (existing.includes(`## [${version}]`)) continue;
    const previousTag = tags[index + 1] ?? null;
    const release = releases[tag];
    missingEntries.push(createChangelogEntry({
      version,
      date: release?.date ?? tagDate(tag),
      previousTag,
      commits: release?.commits ?? commitsBetween(previousTag, tag),
      registry,
    }));
  }
  if (!missingEntries.length) return existing;

  const prefix = existing.trim() || "# Changelog\n\nAll notable changes to AirRadar are documented here.\n";
  const firstEntry = prefix.search(/\n\n## \[/);
  if (firstEntry < 0) return `${prefix.trimEnd()}\n\n${missingEntries.join("\n\n")}\n`;
  return `${prefix.slice(0, firstEntry).trimEnd()}\n\n${missingEntries.join("\n\n")}\n${prefix.slice(firstEntry + 2).trimStart()}\n`;
}

function main() {
  const [command, version, date] = process.argv.slice(2);
  if (command === "backfill") {
    const existing = readFileSync(CHANGELOG_PATH, "utf8");
    const updated = backfillChangelog({ existing });
    if (updated !== existing) writeFileSync(CHANGELOG_PATH, updated, "utf8");
    process.stdout.write(`[AirRadar changelog] ${updated === existing ? "unchanged" : "backfilled"}\n`);
    return;
  }
  if (command === "check") {
    const existing = readFileSync(CHANGELOG_PATH, "utf8");
    const missing = missingChangelogVersions({ existing });
    if (missing.length) {
      throw new Error(`CHANGELOG.md is missing release tags: ${missing.join(", ")}`);
    }
    process.stdout.write("[AirRadar changelog] synchronized\n");
    return;
  }
  if (command === "normalize") {
    const existing = readFileSync(CHANGELOG_PATH, "utf8");
    const updated = normalizeChangelog(existing);
    if (updated !== existing) writeFileSync(CHANGELOG_PATH, updated, "utf8");
    process.stdout.write(`[AirRadar changelog] ${updated === existing ? "unchanged" : "normalized"}\n`);
    return;
  }
  if (command !== "generate" || !version || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Usage: node scripts/changelog.mjs generate VERSION YYYY-MM-DD | backfill | check | normalize");
  }
  const existing = readFileSync(CHANGELOG_PATH, "utf8");
  const updated = updateChangelog({ version, date, existing });
  if (updated !== existing) writeFileSync(CHANGELOG_PATH, updated, "utf8");
  process.stdout.write(`[AirRadar changelog] ${updated === existing ? "unchanged" : "updated"} ${version}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`[AirRadar changelog] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
