#!/usr/bin/env node
import "dotenv/config";
import { BkgGermanyPolandBoundaryProvider } from "../lib/atc/bkg-boundary";
import { AuthoritativeBoundaryResolver } from "../lib/atc/boundary-resolver";
import { CuzkBoundaryError, CuzkStateBoundaryProvider } from "../lib/atc/cz-boundary";
import { fetchCurrentCzEaip, mergeCzAd2AtcResults, parseCzEaipAd2AtcAirspace, parseCzEaipEnr21 } from "../lib/atc/cz-eaip";
import { validateAtcImportDocument } from "../lib/atc/import-format";
import { runAtcImport } from "../lib/atc/import-db";

function dryRunArgument(): boolean {
  const argumentsList = process.argv.slice(2);
  if (argumentsList.some((argument) => argument !== "--dry-run")) throw new Error("Usage: npm run atc:sync:cz -- [--dry-run]");
  return argumentsList.includes("--dry-run");
}

function printDiagnostics(result: ReturnType<typeof parseCzEaipEnr21>): void {
  const skipped = result.diagnostics.filter((diagnostic) => diagnostic.status === "skipped");
  const categories = new Map<string, number>();
  for (const diagnostic of result.diagnostics) categories.set(diagnostic.objectType, (categories.get(diagnostic.objectType) ?? 0) + 1);
  const frequencies = new Set(result.document.sectors.flatMap((sector) => [sector.primaryFrequencyMhz, ...(sector.alternateFrequencies ?? []).map((frequency) => frequency.frequencyMhz)]).filter((frequency): frequency is number => frequency !== null && frequency !== undefined));
  const importedByType = new Map<string, number>();
  for (const diagnostic of result.diagnostics.filter((item) => item.status === "accepted")) importedByType.set(diagnostic.objectType, (importedByType.get(diagnostic.objectType) ?? 0) + 1);
  const reasonCounts = new Map<string, number>();
  for (const diagnostic of skipped) {
    const reason = diagnostic.reason ?? "unknown";
    reasonCounts.set(`${diagnostic.objectType}: ${reason}`, (reasonCounts.get(`${diagnostic.objectType}: ${reason}`) ?? 0) + 1);
  }
  console.log(`Dataset: total parsed ${result.diagnostics.length}; valid ${result.document.sectors.length}; skipped ${skipped.length}; unsupported ${skipped.filter((item) => item.reason === "unsupported airspace object type").length}; unique frequencies ${frequencies.size}`);
  console.log(`Breakdown: ACC=${importedByType.get("ACC_OPERATIONAL_SECTOR") ?? 0}/${categories.get("ACC_OPERATIONAL_SECTOR") ?? 0}, TMA=${importedByType.get("TMA") ?? 0}/${categories.get("TMA") ?? 0}, CTR=${importedByType.get("CTR") ?? 0}/${categories.get("CTR") ?? 0}, other=${(importedByType.get("FIC_SECTOR") ?? 0) + (importedByType.get("CTA") ?? 0)}/${(categories.get("FIC_SECTOR") ?? 0) + (categories.get("CTA") ?? 0) + (categories.get("OTHER") ?? 0)}`);
  for (const [reason, count] of reasonCounts) console.log(`  skipped ${count}× ${reason}`);
  console.log(`Classification: ${Object.entries(result.counts.classification).map(([key, value]) => `${key}=${value}`).join(", ")}`);
  for (const diagnostic of skipped.filter((item) => item.boundaryError)) console.log(`  boundary ${diagnostic.name}: blocked; ${diagnostic.boundaryError}`);
  const metrics = result.diagnostics.flatMap((diagnostic) => diagnostic.status === "accepted" ? diagnostic.polygonMetrics ?? [] : []);
  if (metrics.length) console.log(`Geometry: ${metrics.length} validated ring(s), ${metrics.reduce((sum, metric) => sum + metric.vertexCount, 0)} vertices, ${metrics.reduce((sum, metric) => sum + metric.areaSquareKm, 0).toFixed(1)} km² total`);
  const resolutions = result.diagnostics.flatMap((diagnostic) => diagnostic.boundaryResolutions ?? []);
  if (resolutions.length) console.log(`Authoritative boundary geometry: ${resolutions.length} segment resolution(s); max endpoint snap ${Math.max(...resolutions.map((resolution) => Math.max(resolution.startSnapDistanceKm, resolution.endSnapDistanceKm))).toFixed(3)} km`);
}

async function main(): Promise<void> {
  const dryRun = dryRunArgument();
  const source = await fetchCurrentCzEaip();
  const boundaryResolver = new AuthoritativeBoundaryResolver(new CuzkStateBoundaryProvider(), new BkgGermanyPolandBoundaryProvider());
  await boundaryResolver.load();
  const parsedEnr21 = parseCzEaipEnr21(source.enr21Html, { publicationHtml: source.publicationHtml, boundaryResolver });
  const parsedAd2 = source.ad2Html.map(({ html }) => parseCzEaipAd2AtcAirspace(html));
  const parsed = mergeCzAd2AtcResults(parsedEnr21, parsedAd2);
  const dataset = validateAtcImportDocument(parsed.document);
  console.log(`Official source: ${dataset.source.reference}`);
  console.log(`Publication effective: ${parsed.effectiveDate}; published: ${parsed.publicationDate ?? "unknown"}`);
  console.log(`Detected amendments: ${parsed.publication.aipAmendment ?? "unknown"}; AIRAC ${parsed.publication.airacAmendment ?? "unknown"}`);
  printDiagnostics(parsed);
  const unsupported = parsed.diagnostics.filter((diagnostic) => diagnostic.status === "skipped"
    && diagnostic.objectType !== "OTHER"
    && !diagnostic.reason?.startsWith("aggregate sector row"));
  if (!dryRun && unsupported.length) {
    throw new Error(`SYNC FAILED: ${unsupported.length} supported ATC row(s) have unsupported source constructs; no database changes were written.`);
  }
  console.log(`Import preview: sectors ${dataset.sectors.length}; transmitters ${dataset.transmitters.length}`);
  if (dataset.transmitters.length === 0) console.log("no authoritative transmitter-location source found");
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
