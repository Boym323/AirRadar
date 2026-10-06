#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const distDir = resolve(process.argv[2] || ".next");
const standaloneDir = resolve(distDir, "standalone");
const standaloneStaticDir = resolve(standaloneDir, ".next", "static");
const sourceStaticDir = resolve(distDir, "static");
const sourcePublicDir = resolve("public");
const standalonePublicDir = resolve(standaloneDir, "public");

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

process.stdout.write(`[standalone] prepared ${standaloneDir}\n`);
