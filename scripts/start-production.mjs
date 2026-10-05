#!/usr/bin/env node

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { waitForBuildReady } from "./build-start-lock.mjs";

// The systemd service must keep the AirRadar coordinator in the same process
// that owns the Next server. This also prevents Next from installing its
// process.exit-based signal handler alongside the application coordinator.
process.env.NEXT_RUNTIME = "nodejs";
process.env.NEXT_MANUAL_SIG_HANDLE = "1";

const appDir = fileURLToPath(new URL("../", import.meta.url));
process.env.AIRRADAR_APP_ROOT = appDir;

const loadCommonJs = createRequire(import.meta.url);

function cliOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : null;
}

async function start() {
  await waitForBuildReady({
    buildIdPath: new URL("../.next/BUILD_ID", import.meta.url),
  });
  const instrumentation = loadCommonJs("../.next/server/instrumentation.js");
  await instrumentation.register();

  const standaloneServer = resolve(appDir, ".next/standalone/server.js");
  if (existsSync(standaloneServer)) {
    process.env.HOSTNAME = cliOption("--hostname") ?? process.env.AIRRADAR_HOSTNAME ?? "0.0.0.0";
    process.env.PORT = cliOption("--port") ?? process.env.PORT ?? "3000";
    loadCommonJs(standaloneServer);
    return;
  }

  await import("next/dist/bin/next");
}

start().catch((error) => {
  console.error("AirRadar production start failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
