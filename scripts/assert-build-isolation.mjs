#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PRODUCTION_CHECKOUT = "/var/www/airradar";

export function assertSafeProductionBuild({
  cwd = process.cwd(),
  distDir = process.env.NEXT_DIST_DIR,
  releaseBuild = process.env.AIRRADAR_RELEASE_BUILD,
} = {}) {
  let root = resolve(cwd);
  try { root = realpathSync(root); } catch {}
  if (root !== PRODUCTION_CHECKOUT) return;

  // Only the release script may build in the shared production checkout,
  // with an isolated distDir. Never allow .next or an arbitrary target.
  if (releaseBuild !== "1" || !/^\.next-release-[1-9]\d*$/.test(distDir ?? "")) {
    throw new Error("production_checkout_build_forbidden: use the release pipeline or a separate worktree");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { assertSafeProductionBuild(); }
  catch (error) {
    process.stderr.write("[AirRadar build isolation] " + error.message + "\n");
    process.exitCode = 1;
  }
}
