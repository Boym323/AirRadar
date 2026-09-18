#!/usr/bin/env node
import { spawn } from "node:child_process";

const root = process.cwd();
const jiti = `${root}/node_modules/jiti/lib/jiti-cli.mjs`;
const jobs = [
  ["ATC CZ", "scripts/atc-sync-cz.ts", []],
  ["ATC SK", "scripts/atc-sync-sk.ts", []],
  ["ATC AT", "scripts/atc-sync-at.ts", ["--apply"]],
  ["SID/STAR", "scripts/procedures-sync.ts", []],
];

function run(label, script, args) {
  return new Promise((resolve) => {
    console.log(`[aviation-data] ${label}: start`);
    const child = spawn(process.execPath, [jiti, script, ...args], {
      cwd: root,
      env: { ...process.env, JITI_TSCONFIG_PATHS: "true" },
      stdio: "inherit",
    });
    child.once("error", (error) => {
      console.error(`[aviation-data] ${label}: ${error.message}`);
      resolve(false);
    });
    child.once("exit", (code, signal) => {
      const ok = code === 0;
      console.log(`[aviation-data] ${label}: ${ok ? "success" : `failed (${signal ?? code})`}`);
      resolve(ok);
    });
  });
}

const results = [];
for (const [label, script, args] of jobs) results.push(await run(label, script, args));
if (results.every(Boolean)) process.exitCode = 0;
else {
  console.error("[aviation-data] one or more sources failed; successful datasets were kept");
  process.exitCode = 1;
}
