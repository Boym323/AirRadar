#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
let normalizedServerSource = serverSource.replace(
  distDirConfig[0],
  '"distDir":"./.next"',
);
// Next also embeds the temporary build root separately. Normalize that value
// as well, otherwise the standalone server still looks for the build under
// the pre-activation `.next-release-*` directory.
normalizedServerSource = normalizedServerSource.replace(/"distDirRoot":"\.next-release-[^"]+"/, '"distDirRoot":".next"');
if (!normalizedServerSource.includes('"distDir":"./.next"') || !normalizedServerSource.includes('"distDirRoot":".next"')) {
  throw new Error(`Could not normalize standalone distDir: ${standaloneServer}`);
}
writeFileSync(standaloneServer, normalizedServerSource, "utf8");

rmSync(standaloneStaticDir, { recursive: true, force: true });
mkdirSync(resolve(standaloneDir, ".next"), { recursive: true });
// The generated server runs with `standalone` as cwd and resolves its
// relative distDir there. Publish the build metadata alongside the copied
// static assets so it can find BUILD_ID and the server manifests.
for (const entry of readdirSync(distDir)) {
  if (entry === "standalone") continue;
  const source = resolve(distDir, entry);
  const target = resolve(standaloneDir, ".next", entry);
  rmSync(target, { recursive: true, force: true });
  cpSync(source, target, { recursive: true });
}
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
