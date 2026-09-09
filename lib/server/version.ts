import { readFileSync } from "node:fs";
import { join } from "node:path";
import appPackage from "../../package.json" with { type: "json" };

export interface BuildMetadata {
  version: string;
  tag: string;
  commit: string | null;
  shortCommit: string | null;
  buildTime: string | null;
  channel: string;
}

export interface PublicVersionResponse {
  version: string;
  commit: string | null;
  buildTime: string | null;
  channel: string;
}

const BUILD_METADATA_PATH = join(process.cwd(), "generated", "build-version.json");
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const COMMIT_PATTERN = /^[0-9a-f]{7,64}$/i;
const CHANNEL_PATTERN = /^[a-z0-9._-]{1,32}$/i;

function fallbackMetadata(): BuildMetadata {
  const version = typeof appPackage.version === "string" && VERSION_PATTERN.test(appPackage.version)
    ? appPackage.version
    : "0.0.0";
  const commit = process.env.AIRRADAR_COMMIT && COMMIT_PATTERN.test(process.env.AIRRADAR_COMMIT)
    ? process.env.AIRRADAR_COMMIT
    : null;
  return {
    version,
    tag: `v${version}`,
    commit,
    shortCommit: commit?.slice(0, 8) ?? null,
    buildTime: null,
    channel: process.env.NODE_ENV === "production" ? "production" : "development",
  };
}

function parseBuildMetadata(value: unknown): BuildMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<BuildMetadata>;
  if (typeof candidate.version !== "string" || !VERSION_PATTERN.test(candidate.version)) return null;
  if (typeof candidate.tag !== "string" || candidate.tag !== `v${candidate.version}`) return null;
  if (candidate.commit !== null && (typeof candidate.commit !== "string" || !COMMIT_PATTERN.test(candidate.commit))) return null;
  if (candidate.shortCommit !== null && (typeof candidate.shortCommit !== "string" || !COMMIT_PATTERN.test(candidate.shortCommit))) return null;
  if (candidate.buildTime !== null && (typeof candidate.buildTime !== "string" || !Number.isFinite(Date.parse(candidate.buildTime)))) return null;
  if (typeof candidate.channel !== "string" || !CHANNEL_PATTERN.test(candidate.channel)) return null;
  return {
    version: candidate.version,
    tag: candidate.tag,
    commit: candidate.commit ?? null,
    shortCommit: candidate.shortCommit ?? null,
    buildTime: candidate.buildTime ?? null,
    channel: candidate.channel,
  };
}

let cachedMetadata: BuildMetadata | undefined;

export function getBuildMetadata(): BuildMetadata {
  if (cachedMetadata) return cachedMetadata;
  let metadata: BuildMetadata | null = null;
  try {
    metadata = parseBuildMetadata(JSON.parse(readFileSync(BUILD_METADATA_PATH, "utf8")));
  } catch {
    metadata = null;
  }
  cachedMetadata = metadata ?? fallbackMetadata();
  return cachedMetadata;
}

export function getPublicVersion(): PublicVersionResponse {
  const metadata = getBuildMetadata();
  return {
    version: metadata.version,
    commit: metadata.shortCommit ?? metadata.commit,
    buildTime: metadata.buildTime,
    channel: metadata.channel,
  };
}
