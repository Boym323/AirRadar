import { execFileSync } from "node:child_process";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const BUILD_METADATA_PATH = join(APP_DIR, "generated", "build-version.json");
const RELEASE_CHANNELS = new Set(["stable", "rc"]);
const RELEASE_CANDIDATE_CHANNEL = "release-candidate";
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

function numericIdentifier(value, label) {
  if (!/^(0|[1-9]\d*)$/.test(value)) throw new Error(`Invalid numeric ${label}: ${value}`);
  return BigInt(value);
}

function parseSemVer(value, label = "version") {
  const input = String(value).trim();
  const match = SEMVER_PATTERN.exec(input);
  if (!match) throw new Error(`Unsupported ${label}: ${value}`);

  const prerelease = (match[4] ?? "").split(".").filter(Boolean).map((identifier) => ({
    identifier,
    numeric: /^(0|[1-9]\d*)$/.test(identifier),
    value: /^(0|[1-9]\d*)$/.test(identifier) ? BigInt(identifier) : null,
  }));

  return {
    input,
    major: numericIdentifier(match[1], "major version"),
    minor: numericIdentifier(match[2], "minor version"),
    patch: numericIdentifier(match[3], "patch version"),
    prerelease,
  };
}

export function parseReleaseVersion(value, label = "version") {
  const parsed = parseSemVer(value, label);
  if (parsed.prerelease.length === 0) return { ...parsed, rc: null };
  if (
    parsed.prerelease.length !== 2
    || parsed.prerelease[0].identifier !== "rc"
    || !parsed.prerelease[1].numeric
    || parsed.prerelease[1].value < 1n
  ) {
    throw new Error(`Unsupported ${label}: ${value}; expected stable SemVer or rc.N prerelease`);
  }
  return { ...parsed, rc: parsed.prerelease[1].value };
}

function exactStableVersion(value) {
  const parsed = parseReleaseVersion(value, "package version");
  if (parsed.rc !== null) throw new Error(`Package version must be stable: ${value}`);
  return parsed;
}

function versionString({ major, minor, patch, rc = null }) {
  const base = `${major}.${minor}.${patch}`;
  return rc === null ? base : `${base}-rc.${rc}`;
}

function sameBase(left, right) {
  return left.major === right.major && left.minor === right.minor && left.patch === right.patch;
}

function compareIdentifiers(left, right) {
  if (left.numeric && right.numeric) return left.value < right.value ? -1 : left.value > right.value ? 1 : 0;
  if (left.numeric !== right.numeric) return left.numeric ? -1 : 1;
  return left.identifier < right.identifier ? -1 : left.identifier > right.identifier ? 1 : 0;
}

function compareSemVer(left, right) {
  for (const key of ["major", "minor", "patch"]) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
  }
  if (left.prerelease.length === 0 && right.prerelease.length === 0) return 0;
  if (left.prerelease.length === 0) return 1;
  if (right.prerelease.length === 0) return -1;
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    if (!left.prerelease[index]) return -1;
    if (!right.prerelease[index]) return 1;
    const comparison = compareIdentifiers(left.prerelease[index], right.prerelease[index]);
    if (comparison !== 0) return comparison;
  }
  return 0;
}

function parseReleaseTag(tag) {
  const value = String(tag).trim();
  if (!value.startsWith("v")) return null;
  try {
    const version = parseReleaseVersion(value.slice(1), "release tag");
    return { tag: value, version: versionString(version), ...version };
  } catch {
    return null;
  }
}

function matchingTags(tags, series, channel) {
  return tags
    .map(parseReleaseTag)
    .filter((tag) => {
      if (!tag) return false;
      if (channel === "rc") return tag.rc !== null && sameBase(tag, series);
      return tag.rc === null && tag.major === series.major && tag.minor === series.minor;
    });
}

function highestTag(tags) {
  return tags.reduce((highest, candidate) => {
    if (!highest || compareSemVer(candidate, highest) > 0) return candidate;
    return highest;
  }, null);
}

function releaseChannel(value = "stable") {
  const channel = String(value).trim().toLowerCase();
  if (!RELEASE_CHANNELS.has(channel)) throw new Error(`Unsupported release channel: ${value}`);
  return channel;
}

/**
 * Resolve a stable or release-candidate version without changing package.json
 * or Git. Stable releases use the package major/minor series and ignore RC
 * tags; RC releases count only canonical RC tags for the exact base version.
 */
export function resolveReleaseVersion({ packageVersion, headTags = [], seriesTags = [], channel = "stable" }) {
  const releaseMode = releaseChannel(channel);
  const series = exactStableVersion(packageVersion);
  const headRelease = highestTag(matchingTags(headTags, series, releaseMode));
  if (headRelease) return { version: headRelease.version, tag: headRelease.tag, reused: true };

  const latestRelease = highestTag(matchingTags(seriesTags, series, releaseMode));
  if (releaseMode === "rc") {
    const rc = latestRelease ? latestRelease.rc + 1n : 1n;
    const version = versionString({ ...series, rc });
    return { version, tag: `v${version}`, reused: false };
  }

  const patch = latestRelease ? latestRelease.patch + 1n : 0n;
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
    return versionString(parseReleaseVersion(requested, "AIRRADAR_VERSION"));
  }

  const commit = currentCommit();
  const headTags = gitLines(["tag", "--points-at", commit ?? "HEAD"]);
  const resolved = resolveReleaseVersion({
    packageVersion,
    headTags,
    seriesTags: [],
    channel: "stable",
  });
  return resolved.reused ? resolved.version : versionString(exactStableVersion(packageVersion));
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
  const parsedVersion = parseReleaseVersion(version);
  const commit = safeCommit(process.env.AIRRADAR_COMMIT) ?? currentCommit();
  const shortCommit = safeCommit(process.env.AIRRADAR_SHORT_COMMIT) ?? currentShortCommit(commit);
  const tag = process.env.AIRRADAR_TAG?.trim() || `v${version}`;
  const parsedTag = parseReleaseTag(tag);
  if (!parsedTag || parsedTag.version !== version) throw new Error(`Build tag ${tag} does not match build version ${version}.`);
  const channel = safeChannel(process.env.AIRRADAR_CHANNEL);
  if (parsedVersion.rc !== null && channel !== RELEASE_CANDIDATE_CHANNEL) {
    throw new Error(`Release candidate ${version} requires channel ${RELEASE_CANDIDATE_CHANNEL}.`);
  }
  if (parsedVersion.rc === null && channel === RELEASE_CANDIDATE_CHANNEL) {
    throw new Error(`Stable version ${version} cannot use channel ${RELEASE_CANDIDATE_CHANNEL}.`);
  }

  return {
    version,
    tag,
    commit,
    shortCommit,
    buildTime: safeBuildTime(process.env.AIRRADAR_BUILD_TIME),
    channel,
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

function resolveReleaseVersionFromRepository(channel = "stable") {
  const packageVersion = readPackageVersion();
  const commit = gitLines(["rev-parse", "HEAD"], { strict: true })[0];
  if (!/^[0-9a-f]{7,64}$/i.test(commit ?? "")) throw new Error("Git HEAD is not a commit.");
  const headTags = gitLines(["tag", "--points-at", commit], { strict: true });
  const seriesTags = gitLines(["tag", "--list"], { strict: true });
  return resolveReleaseVersion({ packageVersion, headTags, seriesTags, channel });
}

async function main() {
  const command = process.argv[2];
  if (command === "resolve-release-version") {
    const args = process.argv.slice(3);
    let channel = "stable";
    if (args.length > 0) {
      if (args.length !== 2 || args[0] !== "--channel") throw new Error("Usage: node scripts/version.mjs resolve-release-version [--channel stable|rc]");
      channel = args[1];
    }
    process.stdout.write(`${resolveReleaseVersionFromRepository(channel).version}\n`);
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
