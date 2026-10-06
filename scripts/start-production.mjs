#!/usr/bin/env node

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { waitForBuildReady } from "./build-start-lock.mjs";

// The systemd service must keep the AirRadar coordinator in the same process
// that owns the Next server. This also prevents Next from installing its
// process.exit-based signal handler alongside the application coordinator.
process.env.NEXT_RUNTIME = "nodejs";
process.env.NEXT_MANUAL_SIG_HANDLE = "1";

const loadCommonJs = createRequire(import.meta.url);

function cliValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function start() {
  await waitForBuildReady({
    buildIdPath: new URL("../.next/BUILD_ID", import.meta.url),
  });

  const standaloneServer = new URL("../.next/standalone/server.js", import.meta.url);
  const standaloneReadyMarker = new URL("../.next/standalone/.airradar-runtime-ready", import.meta.url);
  let standaloneAvailable = false;
  try {
    loadCommonJs.resolve("../.next/standalone/server.js");
    standaloneAvailable = existsSync(standaloneReadyMarker);
  } catch (error) {
    if (error?.code !== "MODULE_NOT_FOUND") throw error;
  }

  if (standaloneAvailable) {
    process.env.HOSTNAME = cliValue("--hostname", process.env.HOSTNAME || "0.0.0.0");
    process.env.PORT = cliValue("--port", process.env.PORT || "3000");
    await import(standaloneServer.href);
    return;
  }

  // Backward-compatible fallback for builds that do not contain a fully prepared
  // standalone runtime. The readiness marker is written only after public/static
  // assets have been copied, which also makes the first transition deploy safe.
  const instrumentation = loadCommonJs("../.next/server/instrumentation.js");
  await instrumentation.register();
  await import("next/dist/bin/next");
}

start().catch((error) => {
  console.error("AirRadar production start failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
