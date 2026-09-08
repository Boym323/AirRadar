#!/usr/bin/env node

import { createRequire } from "node:module";
import { waitForBuildReady } from "./build-start-lock.mjs";

// The systemd service must keep the AirRadar coordinator in the same process
// that owns the Next server. This also prevents Next from installing its
// process.exit-based signal handler alongside the application coordinator.
process.env.NEXT_RUNTIME = "nodejs";
process.env.NEXT_MANUAL_SIG_HANDLE = "1";

const loadCommonJs = createRequire(import.meta.url);

async function start() {
  await waitForBuildReady({
    buildIdPath: new URL("../.next/BUILD_ID", import.meta.url),
  });
  const instrumentation = loadCommonJs("../.next/server/instrumentation.js");
  await instrumentation.register();
  await import("next/dist/bin/next");
}

start().catch((error) => {
  console.error("AirRadar production start failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
