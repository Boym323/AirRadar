#!/usr/bin/env node
import "dotenv/config";
import { CuzkStateBoundaryProvider } from "../lib/atc/cz-boundary";
import { fetchCurrentSkEaip, parseSkEaipEnr21, SK_EAIP_SOURCE_NAME } from "../lib/atc/sk-eaip";
import { validateAtcImportDocument } from "../lib/atc/import-format";
import { createAtcDatabase, existingAtcRows, runAtcImport } from "../lib/atc/import-db";

const REQUIRED_DIRECT_SECTORS = [
  "SK-KOSICE-TMA-1A",
  "SK-PIESTANY-TMA-2",
  "SK-POPRAD-TMA-1",
  "SK-POPRAD-TMA-2",
  "SK-ZILINA-TMA-3",
] as const;

function dryRunArgument(): boolean {
  const argumentsList = process.argv.slice(2);
  if (argumentsList.some((argument) => argument !== "--dry-run")) throw new Error("Usage: npm run atc:sync:sk -- [--dry-run]");
  return argumentsList.includes("--dry-run");
}

function printDiagnostics(result: ReturnType<typeof parseSkEaipEnr21>): void {
  const accepted = result.diagnostics.filter((diagnostic) => diagnostic.status === "accepted");
  const skipped = result.diagnostics.filter((diagnostic) => diagnostic.status === "skipped");
  const direct = accepted.filter((diagnostic) => diagnostic.geometry === "direct");
  const boundary = accepted.filter((diagnostic) => diagnostic.geometry === "state-boundary");
  const frequencies = new Set(result.document.sectors.flatMap((sector) => [
    sector.primaryFrequencyMhz,
    ...(sector.alternateFrequencies ?? []).map((frequency) => frequency.frequencyMhz),
  ]).filter((frequency): frequency is number => typeof frequency === "number"));
  console.log(`Dataset: accepted ${accepted.length}; skipped ${skipped.length}; direct geometry ${direct.length}; Czech-border-resolved ${boundary.length}; unique VHF frequencies ${frequencies.size}`);
  const reasons = new Map<string, number>();
  for (const diagnostic of skipped) reasons.set(diagnostic.reason ?? "unknown", (reasons.get(diagnostic.reason ?? "unknown") ?? 0) + 1);
  for (const [reason, count] of reasons) console.log(`  skipped ${count}× ${reason}`);
  for (const diagnostic of boundary) {
    const maxSnap = Math.max(...diagnostic.boundaryResolutions.flatMap((resolution) => [resolution.startSnapDistanceKm, resolution.endSnapDistanceKm]));
    console.log(`  state boundary ${diagnostic.name}: ${diagnostic.boundaryResolutions.length} segment(s), max endpoint snap ${maxSnap.toFixed(3)} km`);
  }
}

async function main(): Promise<void> {
  const dryRun = dryRunArgument();
  const source = await fetchCurrentSkEaip();

  // Several Slovak rows next to the AirRadar coverage area reference the
  // Czech-Slovak state boundary. Reuse the existing authoritative ČÚZK
  // Data50 resolver for those segments. Rows on other Slovak borders remain
  // source-limited and are skipped rather than approximated with straight lines.
  const czechBoundary = new CuzkStateBoundaryProvider();
  await czechBoundary.load();

  const parsed = parseSkEaipEnr21(source.enr21Html, {
    sourceReference: source.enr21Url,
    effectiveDate: source.effectiveDate,
    boundaryProvider: czechBoundary,
  });
  const dataset = validateAtcImportDocument(parsed.document);
  const importedIds = new Set(dataset.sectors.map((sector) => sector.id));
  const missingRequired = REQUIRED_DIRECT_SECTORS.filter((id) => !importedIds.has(id));
  if (missingRequired.length) {
    throw new Error(`SYNC FAILED: required explicit-geometry Slovak sector(s) missing: ${missingRequired.join(", ")}. No database changes were written.`);
  }

  const database = createAtcDatabase();
  const existing = database ? await existingAtcRows(database) : null;
  const existingSlovak = existing?.sectors.filter((sector) => sector.source === SK_EAIP_SOURCE_NAME) ?? [];
  const currentlySourceLimited = new Set(parsed.diagnostics.filter((diagnostic) => diagnostic.status === "skipped").map((diagnostic) => `SK-${diagnostic.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100)}`));
  const destructiveRegression = existingSlovak.filter((sector) => currentlySourceLimited.has(sector.id));
  if (!dryRun && destructiveRegression.length) {
    throw new Error(`SYNC FAILED: ${destructiveRegression.length} previously imported Slovak sector(s) are source-limited in the current parse (${destructiveRegression.map((sector) => sector.id).join(", ")}). Existing production rows remain unchanged.`);
  }

  console.log(`Official source: ${dataset.source.reference}`);
  console.log(`AIP effective date: ${parsed.effectiveDate}`);
  printDiagnostics(parsed);
  console.log(`Import preview: sectors ${dataset.sectors.length}; transmitters ${dataset.transmitters.length}`);
  console.log("Published airspace is imported with runtime activation UNKNOWN; no operational activation is inferred.");
  console.log("no authoritative transmitter-location source found");
  await runAtcImport(dataset, { dryRun, database });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  console.error("Existing production ATC dataset remains unchanged if validation or import planning failed before the transactional write.");
  process.exitCode = 1;
});
