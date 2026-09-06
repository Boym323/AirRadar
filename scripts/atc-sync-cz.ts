#!/usr/bin/env node
import "dotenv/config";
import { CuzkBoundaryError, CuzkStateBoundaryProvider } from "../lib/atc/cz-boundary";
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
  for (const diagnostic of result.diagnostics.filter((item) => item.status === "accepted" && item.polygonMetrics?.length)) {
    const metrics = diagnostic.polygonMetrics ?? [];
    const box = metrics.reduce((current, metric) => ({
      west: Math.min(current.west, metric.boundingBox.west),
      south: Math.min(current.south, metric.boundingBox.south),
      east: Math.max(current.east, metric.boundingBox.east),
      north: Math.max(current.north, metric.boundingBox.north),
    }), { west: Number.POSITIVE_INFINITY, south: Number.POSITIVE_INFINITY, east: Number.NEGATIVE_INFINITY, north: Number.NEGATIVE_INFINITY });
    console.log(`  geometry ${diagnostic.name}: ${metrics.length} ring(s), ${metrics.reduce((sum, metric) => sum + metric.vertexCount, 0)} vertices; ${metrics.reduce((sum, metric) => sum + metric.areaSquareKm, 0).toFixed(1)} km²; max segment ${Math.max(...metrics.map((metric) => metric.maxSegmentKm)).toFixed(3)} km; bbox ${box.west.toFixed(5)},${box.south.toFixed(5)}–${box.east.toFixed(5)},${box.north.toFixed(5)}`);
  }
  for (const diagnostic of result.diagnostics.filter((item) => item.boundaryResolutions?.length)) {
    for (const resolution of diagnostic.boundaryResolutions ?? []) {
      console.log(`  boundary ${diagnostic.name}: snap ${resolution.startSnapDistanceKm.toFixed(3)} km/${resolution.endSnapDistanceKm.toFixed(3)} km; ${resolution.vertexCount} vertices; ${resolution.pathLengthKm.toFixed(3)} km path; max segment ${resolution.maxSegmentLengthKm.toFixed(3)} km; features ${resolution.featureIds.join(",")}`);
    }
  }
}

async function main(): Promise<void> {
  const dryRun = dryRunArgument();
  const source = await fetchCurrentCzEaip();
  const boundaryProvider = new CuzkStateBoundaryProvider();
  await boundaryProvider.load();
  const parsed = parseCzEaipEnr21(source.enr21Html, { publicationHtml: source.publicationHtml, stateBoundaryProvider: boundaryProvider });
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
  if (error instanceof CuzkBoundaryError) {
    console.error("Unable to resolve authoritative Czech state-boundary geometry.");
    console.error("Existing production ATC dataset remains unchanged.");
  }
  process.exitCode = 1;
});
