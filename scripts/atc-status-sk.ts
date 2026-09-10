#!/usr/bin/env node
import "dotenv/config";
import { CuzkStateBoundaryProvider } from "../lib/atc/cz-boundary";
import { fetchCurrentSkEaip, parseSkEaipEnr21, SK_EAIP_SOURCE_NAME } from "../lib/atc/sk-eaip";
import { createAtcDatabase, existingAtcRows } from "../lib/atc/import-db";
import { planAtcImport, validateAtcImportDocument } from "../lib/atc/import-format";
import { compareAtcSectorIds, determineAtcDatasetStatus } from "../lib/atc/status";

function dateOnly(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : null;
}

async function main(): Promise<void> {
  const source = await fetchCurrentSkEaip();
  const czechBoundary = new CuzkStateBoundaryProvider();
  await czechBoundary.load();
  const parsed = parseSkEaipEnr21(source.enr21Html, {
    sourceReference: source.enr21Url,
    effectiveDate: source.effectiveDate,
    boundaryProvider: czechBoundary,
  });
  const dataset = validateAtcImportDocument(parsed.document);
  const database = createAtcDatabase();
  const rows = database ? await existingAtcRows(database) : null;
  const stored = rows?.sectors.filter((sector) => sector.source === SK_EAIP_SOURCE_NAME) ?? [];
  const comparison = compareAtcSectorIds(dataset.sectors.map((sector) => sector.id), stored.map((sector) => sector.id));
  const importedDates = stored.map((sector) => dateOnly(sector.validFrom)).filter((date): date is string => date !== null).sort();
  const databaseEffectiveDate = importedDates.at(-1) ?? null;
  const status = determineAtcDatasetStatus({
    databaseAvailable: database !== null,
    databaseEffectiveDate,
    currentEffectiveDate: parsed.effectiveDate,
    comparison,
  });
  const plan = planAtcImport(dataset, rows ?? { sectors: [], transmitters: [] });
  const accepted = parsed.diagnostics.filter((diagnostic) => diagnostic.status === "accepted");
  const skipped = parsed.diagnostics.filter((diagnostic) => diagnostic.status === "skipped");
  const verified = stored.map((row) => Date.parse(String(row.lastVerifiedAt))).filter(Number.isFinite);

  console.log("ATC Slovak dataset");
  console.log(`Official source: ${dataset.source.reference}`);
  console.log(`Current AIP effective date: ${parsed.effectiveDate}`);
  console.log(`Current persistable sectors: ${dataset.sectors.length}`);
  console.log(`Current direct geometry: ${accepted.filter((item) => item.geometry === "direct").length}`);
  console.log(`Current Czech-border-resolved geometry: ${accepted.filter((item) => item.geometry === "state-boundary").length}`);
  console.log(`Current source-limited/skipped rows: ${skipped.length}`);
  console.log(`Stored Slovak eAIP sectors: ${stored.length}`);
  console.log(`Matching sector IDs: ${comparison.matchingIds.length}`);
  console.log(`Missing sector IDs: ${comparison.missingIds.length}`);
  console.log(`Extra sector IDs: ${comparison.extraIds.length}`);
  console.log(`Database effective date: ${databaseEffectiveDate ?? "not imported"}`);
  console.log(`Last verified: ${verified.length ? new Date(Math.max(...verified)).toISOString() : "not imported"}`);
  console.log(`Status: ${status}`);
  console.log(`Import plan: sectors added ${plan.sectors.added.length}, updated ${plan.sectors.updated.length}, unchanged ${plan.sectors.unchanged.length}, obsolete ${plan.sectors.obsolete.length}`);
  for (const diagnostic of skipped) console.log(`  source-limited ${diagnostic.name}: ${diagnostic.reason ?? "unknown"}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
