#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const distDir = resolve(process.argv[2] || ".next");
const standaloneDir = resolve(distDir, "standalone");
const standaloneServer = resolve(standaloneDir, "server.js");
const standaloneStaticDir = resolve(standaloneDir, ".next", "static");
const sourceStaticDir = resolve(distDir, "static");
const sourcePublicDir = resolve("public");
const standalonePublicDir = resolve(standaloneDir, "public");
const sourceAtsDir = resolve("data", "ats", "generated");
const standaloneAtsDir = resolve(standaloneDir, "data", "ats", "generated");
const readyMarker = resolve(standaloneDir, ".airradar-runtime-ready");

rmSync(readyMarker, { force: true });

if (!existsSync(standaloneServer)) {
  throw new Error(`Standalone server is missing under ${standaloneDir}`);
}

// The production release builds into a versioned temporary distDir and then
// moves that directory to `.next`. Next embeds the temporary distDir in the
// generated standalone server; without normalizing it here, the server starts
// successfully but looks for static assets under a directory that no longer
// exists after activation.
const serverSource = readFileSync(standaloneServer, "utf8");
const distDirConfig = serverSource.match(/"distDir":"([^"]+)"/);
if (!distDirConfig) {
  throw new Error(`Standalone server has no embedded distDir: ${standaloneServer}`);
}
const normalizedServerSource = serverSource.replace(
  distDirConfig[0],
  '"distDir":"./.next"',
);
if (!normalizedServerSource.includes('"distDir":"./.next"')) {
  throw new Error(`Could not normalize standalone distDir: ${standaloneServer}`);
}
writeFileSync(standaloneServer, normalizedServerSource, "utf8");

rmSync(standaloneStaticDir, { recursive: true, force: true });
mkdirSync(resolve(standaloneDir, ".next"), { recursive: true });
if (existsSync(sourceStaticDir)) {
  cpSync(sourceStaticDir, standaloneStaticDir, { recursive: true });
}
if (!existsSync(standaloneStaticDir)) {
  throw new Error(`Standalone static assets are missing under ${standaloneStaticDir}`);
}

rmSync(standalonePublicDir, { recursive: true, force: true });
if (existsSync(sourcePublicDir)) {
  cpSync(sourcePublicDir, standalonePublicDir, { recursive: true });
}

// The standalone server runs with its working directory set to the standalone
// runtime. Keep the published ATS datasets beside it; the loaders resolve their
// default paths from process.cwd() at runtime.
rmSync(resolve(standaloneDir, "data", "ats"), { recursive: true, force: true });
if (existsSync(sourceAtsDir)) {
  cpSync(sourceAtsDir, standaloneAtsDir, { recursive: true });
}

writeFileSync(readyMarker, "standalone-v1\n", "utf8");
process.stdout.write(`[standalone] prepared ${standaloneDir}\n`);
