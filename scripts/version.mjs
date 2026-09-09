import { execFileSync } from "node:child_process";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const BUILD_METADATA_PATH = join(APP_DIR, "generated", "build-version.json");
const RELEASE_TAG_PATTERN = /^v(\d+)\.(\d+)\.(\d+)$/;
const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

function exactVersion(value) {
  const match = VERSION_PATTERN.exec(String(value).trim());
  if (!match) throw new Error(`Unsupported package version: ${value}`);
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function versionString({ major, minor, patch }) {
  return `${major}.${minor}.${patch}`;
}

function matchingTags(tags, series) {
  return tags
    .map((tag) => {
      const match = RELEASE_TAG_PATTERN.exec(tag.trim());
      if (!match || Number(match[1]) !== series.major || Number(match[2]) !== series.minor) return null;
      return { tag: tag.trim(), version: `${match[1]}.${match[2]}.${match[3]}`, patch: Number(match[3]) };
    })
    .filter(Boolean);
}

function highestTag(tags) {
  return [...tags].sort((left, right) => left.patch - right.patch).at(-1) ?? null;
}

/**
 * Resolve the version for a release without changing package.json or Git.
 * A release tag already on HEAD wins; otherwise the next patch after the
 * highest tag in package.json's major/minor series is selected.
 */
export function resolveReleaseVersion({ packageVersion, headTags, seriesTags }) {
  const series = exactVersion(packageVersion);
  const headRelease = highestTag(matchingTags(headTags, series));
  if (headRelease) return { version: headRelease.version, tag: headRelease.tag, reused: true };

  const latestRelease = highestTag(matchingTags(seriesTags, series));
  const patch = latestRelease ? latestRelease.patch + 1 : 0;
  const version = versionString({ ...series, patch });
  return { version, tag: `v${version}`, reused: false };
}

function readPackageVersion() {
  const packageJson = JSON.parse(readFileSync(join(APP_DIR, "package.json"), "utf8"));
  if (typeof packageJson.version !== "string") throw new Error("package.json does not declare a version.");
  return packageJson.version;
}

function gitLines(args, { strict = false } = {}) {
  try {
    return execFileSync("git", ["-c", `safe.directory=${APP_DIR}`, ...args], { cwd: APP_DIR, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
      .trim()
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    if (strict) throw error;
    return [];
  }
}

function currentCommit() {
  const commit = gitLines(["rev-parse", "HEAD"])[0];
  return /^[0-9a-f]{7,64}$/i.test(commit ?? "") ? commit : null;
}

function currentShortCommit(commit) {
  return commit ? commit.slice(0, 8) : null;
}

function buildVersionFromEnvironment(packageVersion) {
  const requested = process.env.AIRRADAR_VERSION?.trim();
  if (requested) {
    const parsed = exactVersion(requested);
    return versionString(parsed);
  }

  const commit = currentCommit();
  const headTags = gitLines(["tag", "--points-at", commit ?? "HEAD"]);
  const resolved = resolveReleaseVersion({
    packageVersion,
    headTags,
    seriesTags: [],
  });
  return resolved.reused ? resolved.version : versionString(exactVersion(packageVersion));
}

function safeChannel(value) {
  const channel = value?.trim();
  if (!channel) return process.env.NODE_ENV === "production" ? "production" : "development";
  if (!/^[a-z0-9._-]{1,32}$/i.test(channel)) throw new Error(`Unsupported build channel: ${value}`);
  return channel;
}

function safeCommit(value) {
  const commit = value?.trim();
  return commit && /^[0-9a-f]{7,64}$/i.test(commit) ? commit : null;
}

function safeBuildTime(value) {
  if (!value) return new Date().toISOString();
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`Unsupported build time: ${value}`);
  return new Date(timestamp).toISOString();
}

export function createBuildMetadata({ packageVersion = readPackageVersion() } = {}) {
  const version = buildVersionFromEnvironment(packageVersion);
  const commit = safeCommit(process.env.AIRRADAR_COMMIT) ?? currentCommit();
  const shortCommit = safeCommit(process.env.AIRRADAR_SHORT_COMMIT) ?? currentShortCommit(commit);
  const tag = process.env.AIRRADAR_TAG?.trim() || `v${version}`;
  if (tag !== `v${version}`) throw new Error(`Build tag ${tag} does not match build version ${version}.`);

  return {
    version,
    tag,
    commit,
    shortCommit,
    buildTime: safeBuildTime(process.env.AIRRADAR_BUILD_TIME),
    channel: safeChannel(process.env.AIRRADAR_CHANNEL),
  };
}

async function writeBuildMetadata() {
  const metadata = createBuildMetadata();
  await mkdir(dirname(BUILD_METADATA_PATH), { recursive: true });
  const temporaryPath = `${BUILD_METADATA_PATH}.tmp-${process.pid}`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    await rename(temporaryPath, BUILD_METADATA_PATH);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
  process.stdout.write(`[AirRadar version] ${metadata.version} ${metadata.shortCommit ?? "unknown"}\n`);
}

function resolveReleaseVersionFromRepository() {
  const packageVersion = readPackageVersion();
  const commit = gitLines(["rev-parse", "HEAD"], { strict: true })[0];
  if (!/^[0-9a-f]{7,64}$/i.test(commit ?? "")) throw new Error("Git HEAD is not a commit.");
  const headTags = gitLines(["tag", "--points-at", commit], { strict: true });
  const seriesTags = gitLines(["tag", "--list"], { strict: true });
  return resolveReleaseVersion({ packageVersion, headTags, seriesTags });
}

async function main() {
  const command = process.argv[2];
  if (command === "resolve-release-version") {
    process.stdout.write(`${resolveReleaseVersionFromRepository().version}\n`);
    return;
  }
  if (command === "write-build-metadata") {
    await writeBuildMetadata();
    return;
  }
  throw new Error("Usage: node scripts/version.mjs <resolve-release-version|write-build-metadata>");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`[AirRadar version] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
