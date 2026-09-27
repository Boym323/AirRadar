#!/usr/bin/env node

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const APP_DIR = join(ROOT, "app");
const REGISTRY_PATH = join(ROOT, "docs/features.registry.json");
const FEATURES_PATH = join(ROOT, "docs/FEATURES.md");
const START_MARKER = "<!-- feature-registry:start -->";
const END_MARKER = "<!-- feature-registry:end -->";
const VALID_STATUSES = new Set(["production", "optional", "internal", "experimental"]);

function walk(directory) {
  const files = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    const stats = statSync(path);
    if (stats.isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

function routeFromFile(filePath) {
  const relativePath = relative(APP_DIR, dirname(filePath)).split(sep);
  const routeSegments = relativePath
    .filter((segment) => segment && !/^\(.+\)$/.test(segment))
    .map((segment) => {
      const optionalCatchAll = segment.match(/^\[\[\.\.\.(.+)\]\]$/);
      if (optionalCatchAll) return `:${optionalCatchAll[1]}*`;
      const catchAll = segment.match(/^\[\.\.\.(.+)\]$/);
      if (catchAll) return `:${catchAll[1]}+`;
      const dynamic = segment.match(/^\[(.+)\]$/);
      return dynamic ? `:${dynamic[1]}` : segment;
    });

  return `/${routeSegments.join("/")}`.replace(/\/$/, "") || "/";
}

export function discoverRoutes(appDir = APP_DIR) {
  const pages = [];
  const apis = [];

  for (const filePath of walk(appDir)) {
    const normalized = filePath.replaceAll("\\", "/");
    if (/\/page\.(?:ts|tsx|js|jsx)$/.test(normalized)) {
      pages.push(routeFromFile(filePath));
    } else if (/\/api\/.*\/route\.(?:ts|tsx|js|jsx)$/.test(normalized)) {
      apis.push(routeFromFile(filePath));
    }
  }

  return {
    pages: [...new Set(pages)].sort(),
    apis: [...new Set(apis)].sort(),
  };
}

export function validateRegistry(registry, discovered) {
  const errors = [];
  if (registry?.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!Array.isArray(registry?.features) || registry.features.length === 0) {
    errors.push("features must be a non-empty array");
    return errors;
  }

  const ids = new Set();
  const coveredPages = new Set();
  const coveredApis = new Set();

  for (const feature of registry.features) {
    if (!feature?.id || !/^[a-z0-9-]+$/.test(feature.id)) {
      errors.push(`invalid feature id: ${String(feature?.id)}`);
      continue;
    }
    if (ids.has(feature.id)) errors.push(`duplicate feature id: ${feature.id}`);
    ids.add(feature.id);

    if (!feature.name || !feature.summary || !feature.category) {
      errors.push(`${feature.id}: name, category and summary are required`);
    }
    if (!VALID_STATUSES.has(feature.status)) {
      errors.push(`${feature.id}: invalid status ${String(feature.status)}`);
    }
    if (!Array.isArray(feature.pages) || !Array.isArray(feature.apis)) {
      errors.push(`${feature.id}: pages and apis must be arrays`);
      continue;
    }
    if (feature.pages.length === 0 && feature.apis.length === 0) {
      errors.push(`${feature.id}: at least one page or API route is required`);
    }

    for (const route of feature.pages) coveredPages.add(route);
    for (const route of feature.apis) coveredApis.add(route);
  }

  const actualPages = new Set(discovered.pages);
  const actualApis = new Set(discovered.apis);

  for (const route of discovered.pages) {
    if (!coveredPages.has(route)) errors.push(`unregistered page route: ${route}`);
  }
  for (const route of discovered.apis) {
    if (!coveredApis.has(route)) errors.push(`unregistered API route: ${route}`);
  }
  for (const route of coveredPages) {
    if (!actualPages.has(route)) errors.push(`stale registered page route: ${route}`);
  }
  for (const route of coveredApis) {
    if (!actualApis.has(route)) errors.push(`stale registered API route: ${route}`);
  }

  return errors;
}

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function surfaceList(values) {
  if (!values.length) return "—";
  return values.map((value) => `\`${value}\``).join("<br>");
}

export function renderRegistrySection(registry) {
  const rows = [...registry.features]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((feature) => {
      const introduced = feature.introducedVersion
        ? `v${feature.introducedVersion}`
        : "Pre-registry";
      return `| ${escapeCell(feature.name)} | ${feature.status} | ${escapeCell(feature.category)} | ${introduced} | ${surfaceList(feature.pages)} | ${surfaceList(feature.apis)} | ${escapeCell(feature.summary)} |`;
    })
    .join("\n");

  return `${START_MARKER}
## Feature registry

This table is generated from [\`features.registry.json\`](features.registry.json).
CI verifies that every Next.js page and API route is owned by at least one
registered feature and that the registry contains no stale routes. “Pre-registry”
means the feature existed before registry adoption and its original release has
not yet been historically attributed.

| Feature | Status | Category | Introduced | Pages | APIs | Summary |
| --- | --- | --- | --- | --- | --- | --- |
${rows}
${END_MARKER}`;
}

export function updateFeaturesDocument(existing, section) {
  const start = existing.indexOf(START_MARKER);
  const end = existing.indexOf(END_MARKER);

  if (start >= 0 && end > start) {
    return `${existing.slice(0, start)}${section}${existing.slice(end + END_MARKER.length)}`;
  }

  const heading = "# Features and routes";
  const headingIndex = existing.indexOf(heading);
  if (headingIndex < 0) throw new Error("docs/FEATURES.md is missing its title");

  const insertAt = existing.indexOf("\n", headingIndex + heading.length);
  return `${existing.slice(0, insertAt + 1)}\n${section}\n${existing.slice(insertAt + 1).replace(/^\n*/, "")}`;
}

function loadRegistry() {
  return JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
}

function main() {
  const command = process.argv[2] ?? "check";
  if (!["check", "generate"].includes(command)) {
    throw new Error("Usage: node scripts/features-registry.mjs check|generate");
  }

  const registry = loadRegistry();
  const discovered = discoverRoutes();
  const errors = validateRegistry(registry, discovered);
  if (errors.length) {
    throw new Error(`Feature registry validation failed:\n- ${errors.join("\n- ")}`);
  }

  const existing = readFileSync(FEATURES_PATH, "utf8");
  const expected = updateFeaturesDocument(existing, renderRegistrySection(registry));

  if (command === "generate") {
    if (expected !== existing) writeFileSync(FEATURES_PATH, expected, "utf8");
    process.stdout.write(
      `[AirRadar features] ${expected === existing ? "unchanged" : "generated"}; ${discovered.pages.length} pages, ${discovered.apis.length} APIs\n`,
    );
    return;
  }

  if (expected !== existing) {
    throw new Error(
      "docs/FEATURES.md generated registry section is stale; run npm run features:generate",
    );
  }

  process.stdout.write(
    `[AirRadar features] synchronized; ${discovered.pages.length} pages, ${discovered.apis.length} APIs\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`[AirRadar features] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
