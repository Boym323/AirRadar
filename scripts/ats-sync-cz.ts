#!/usr/bin/env node
import "dotenv/config";
import { mkdir, open, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  CZ_ATS_ROUTES_DEFAULT_PATH,
  fetchCurrentCzAtsRoutes,
  parseCzEaipEnr32Routes,
  validateCzAtsRouteDocument,
} from "../lib/ats/cz-eaip-routes";
import { normalizeCzEaipEnr32SegmentAnnotations } from "../lib/ats/cz-eaip-source-normalizer";

function dryRunArgument(): boolean {
  const argumentsList = process.argv.slice(2);
  if (argumentsList.some((argument) => argument !== "--dry-run")) {
    throw new Error("Usage: npm run ats:sync:cz -- [--dry-run]");
  }
  return argumentsList.includes("--dry-run");
}

async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(temporaryPath, "w", 0o644);
    await handle.writeFile(content, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporaryPath, path);
    const directory = await open(dirname(path), "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } catch (error) {
    if (handle) await handle.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function main(): Promise<void> {
  const dryRun = dryRunArgument();
  const outputPath = resolve(process.env.ATS_CZ_ROUTES_PATH?.trim() || CZ_ATS_ROUTES_DEFAULT_PATH);
  const source = await fetchCurrentCzAtsRoutes();
  const normalized = normalizeCzEaipEnr32SegmentAnnotations(source.enr32Html);
  const document = validateCzAtsRouteDocument(parseCzEaipEnr32Routes(normalized.html, {
    publicationHtml: source.publicationHtml,
  }));

  console.log(`Official source: ${document.source.reference}`);
  console.log(`Publication effective: ${document.source.effectiveDate}`);
  console.log(`Detected amendments: AIP ${document.source.aipAmendment ?? "unknown"}; AIRAC ${document.source.airacAmendment ?? "unknown"}`);
  console.log(`Source annotation normalization: ${normalized.correctedRows} rows; ${normalized.correctedAnnotations} annotations corrected`);
  console.log(`Routes: ${document.counts.routes}; points: ${document.counts.points}; segments: ${document.counts.segments}; CDR segments: ${document.counts.cdrSegments}; discontinuities: ${document.counts.discontinuities}`);

  if (dryRun) {
    console.log("Dry run: dataset validated; no file was written.");
    return;
  }

  await atomicWrite(outputPath, `${JSON.stringify(document, null, 2)}\n`);
  console.log(`Wrote ${outputPath}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  console.error("Existing ATS route dataset remains unchanged.");
  process.exitCode = 1;
});