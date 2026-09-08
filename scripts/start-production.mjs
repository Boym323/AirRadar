#!/usr/bin/env node

import { createRequire } from "node:module";

// The systemd service must keep the AirRadar coordinator in the same process
// that owns the Next server. This also prevents Next from installing its
// process.exit-based signal handler alongside the application coordinator.
process.env.NEXT_RUNTIME = "nodejs";
process.env.NEXT_MANUAL_SIG_HANDLE = "1";

const loadCommonJs = createRequire(import.meta.url);

async function start() {
  const instrumentation = loadCommonJs("../.next/server/instrumentation.js");
  await instrumentation.register();
  await import("next/dist/bin/next");
}

start().catch(() => {
  console.error("AirRadar production start failed");
  process.exitCode = 1;
});
