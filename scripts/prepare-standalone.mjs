#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const distDir = resolve(process.argv[2] || ".next");
const standaloneDir = resolve(distDir, "standalone");
const standaloneStaticDir = resolve(standaloneDir, ".next", "static");
const sourceStaticDir = resolve(distDir, "static");
const sourcePublicDir = resolve("public");
const standalonePublicDir = resolve(standaloneDir, "public");
const sourceAtsDir = resolve("data", "ats", "generated");
const standaloneAtsDir = resolve(standaloneDir, "data", "ats", "generated");
const readyMarker = resolve(standaloneDir, ".airradar-runtime-ready");

rmSync(readyMarker, { force: true });

if (!existsSync(resolve(standaloneDir, "server.js"))) {
  throw new Error(`Standalone server is missing under ${standaloneDir}`);
}

rmSync(standaloneStaticDir, { recursive: true, force: true });
mkdirSync(resolve(standaloneDir, ".next"), { recursive: true });
if (existsSync(sourceStaticDir)) {
  cpSync(sourceStaticDir, standaloneStaticDir, { recursive: true });
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
