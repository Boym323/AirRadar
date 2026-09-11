#!/usr/bin/env node
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CZ_ATS_ROUTES_DEFAULT_PATH, validateCzAtsRouteDocument } from "../lib/ats/cz-eaip-routes";

async function main(): Promise<void> {
  const path = resolve(process.env.ATS_CZ_ROUTES_PATH?.trim() || CZ_ATS_ROUTES_DEFAULT_PATH);
  const document = validateCzAtsRouteDocument(JSON.parse(await readFile(path, "utf8")) as unknown);
  console.log(`Dataset: ${path}`);
  console.log(`Source: ${document.source.reference}`);
  console.log(`Effective: ${document.source.effectiveDate}; verified: ${document.source.lastVerifiedAt}`);
  console.log(`Routes: ${document.counts.routes}; points: ${document.counts.points}; segments: ${document.counts.segments}; CDR segments: ${document.counts.cdrSegments}; discontinuities: ${document.counts.discontinuities}`);
  console.log("Runtime availability: UNKNOWN (published ENR 3.2 data only).");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
