#!/usr/bin/env node
import "dotenv/config";
import { fetchCurrentCzEaip, parseCzEaipEnr21 } from "../lib/atc/cz-eaip";
import { validateAtcImportDocument } from "../lib/atc/import-format";
import { runAtcImport } from "../lib/atc/import-db";

function dryRunArgument(): boolean {
  const argumentsList = process.argv.slice(2);
  if (argumentsList.some((argument) => argument !== "--dry-run")) throw new Error("Usage: npm run atc:sync:cz -- [--dry-run]");
  return argumentsList.includes("--dry-run");
}

function printDiagnostics(result: ReturnType<typeof parseCzEaipEnr21>): void {
  const skipped = result.diagnostics.filter((diagnostic) => diagnostic.status === "skipped");
  console.log(`ACC operational sectors detected: ${result.counts.accOperationalDetected}`);
  console.log(`ACC sectors valid: ${result.counts.valid}`);
  console.log(`ACC sectors skipped: ${result.counts.skipped}`);
  console.log(`Classification: ${Object.entries(result.counts.classification).map(([key, value]) => `${key}=${value}`).join(", ")}`);
  for (const sector of result.document.sectors) {
    const alternate = sector.alternateFrequencies?.map((frequency) => `${frequency.frequencyMhz}${frequency.label ? ` (${frequency.label})` : ""}`).join(", ") || "none";
    console.log(`  accepted ${sector.id}: ${sector.name}; ${sector.lowerAltitude ?? "?"}–${sector.upperAltitude ?? "?"}; primary ${sector.primaryFrequencyMhz}; alternate ${alternate}`);
  }
  for (const diagnostic of skipped) console.log(`  skipped ${diagnostic.name}: ${diagnostic.reason}`);
}

async function main(): Promise<void> {
  const dryRun = dryRunArgument();
  const source = await fetchCurrentCzEaip();
  const parsed = parseCzEaipEnr21(source.enr21Html, { publicationHtml: source.publicationHtml });
  const dataset = validateAtcImportDocument(parsed.document);
  console.log(`Official source: ${dataset.source.reference}`);
  console.log(`Publication effective: ${parsed.effectiveDate}; published: ${parsed.publicationDate ?? "unknown"}`);
  console.log(`Detected amendments: ${parsed.publication.aipAmendment ?? "unknown"}; AIRAC ${parsed.publication.airacAmendment ?? "unknown"}`);
  printDiagnostics(parsed);
  const unsupported = parsed.diagnostics.filter((diagnostic) => diagnostic.status === "skipped" && !diagnostic.reason?.startsWith("aggregate sector row"));
  if (!dryRun && unsupported.length) {
    throw new Error(`SYNC FAILED: ${unsupported.length} ACC sector(s) have unsupported source constructs; no database changes were written.`);
  }
  await runAtcImport(dataset, { dryRun });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
