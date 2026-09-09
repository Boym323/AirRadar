import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = resolve(fileURLToPath(new URL("..", import.meta.url)));
const CHANGELOG_PATH = join(APP_DIR, "CHANGELOG.md");

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

export function createChangelogEntry({ version, date, previousTag, commits }) {
  const changes = commits.length
    ? commits.map(({ hash, subject }) => `- ${subject} (${hash})`).join("\n")
    : "- No user-facing changes.";
  const comparison = previousTag ? `\n\nChanges since ${previousTag}:` : "";
  return `## [${version}] - ${date}${comparison}\n\n${changes}`;
}

export function updateChangelog({ version, date, existing = "", previousTag = latestReleaseTag(), commits = commitsSince(previousTag) }) {
  const heading = `## [${version}]`;
  if (existing.includes(heading)) return existing;
  const entry = createChangelogEntry({ version, date, previousTag, commits });
  const prefix = existing.trim() || "# Changelog\n\nAll notable changes to AirRadar are documented here.\n";
  return `${prefix.trimEnd()}\n\n${entry}\n`;
}

export function backfillChangelog({ existing = "", tags = releaseTags(), releases = {} }) {
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
  if (command !== "generate" || !version || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Usage: node scripts/changelog.mjs generate VERSION YYYY-MM-DD | backfill");
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
