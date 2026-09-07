#!/usr/bin/env node
import "dotenv/config";
import { BkgGermanyPolandBoundaryProvider } from "../lib/atc/bkg-boundary";
import { AuthoritativeBoundaryResolver } from "../lib/atc/boundary-resolver";
import { CuzkStateBoundaryProvider } from "../lib/atc/cz-boundary";
import { fetchCurrentCzEaip, mergeCzAd2AtcResults, parseCzEaipAd2AtcAirspace, parseCzEaipEnr21 } from "../lib/atc/cz-eaip";
import { createAtcDatabase, existingAtcRows } from "../lib/atc/import-db";
import { planAtcImport, validateAtcImportDocument } from "../lib/atc/import-format";
import { compareAtcSectorIds, determineAtcDatasetStatus } from "../lib/atc/status";

function dateOnly(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : null;
}

async function main(): Promise<void> {
  const source = await fetchCurrentCzEaip();
  const boundaryResolver = new AuthoritativeBoundaryResolver(new CuzkStateBoundaryProvider(), new BkgGermanyPolandBoundaryProvider());
  await boundaryResolver.load();
  const parsedEnr21 = parseCzEaipEnr21(source.enr21Html, { publicationHtml: source.publicationHtml, boundaryResolver });
  const parsed = mergeCzAd2AtcResults(parsedEnr21, source.ad2Html.map(({ html }) => parseCzEaipAd2AtcAirspace(html)));
  const dataset = validateAtcImportDocument(parsed.document);
  const database = createAtcDatabase();
  const rows = database ? await existingAtcRows(database) : null;
  const czechEaipSectors = rows?.sectors
    .filter((sector) => sector.sourceReference.includes("aim.rlp.cz")) ?? [];
  const comparison = compareAtcSectorIds(
    dataset.sectors.map((sector) => sector.id),
    czechEaipSectors.map((sector) => sector.id),
  );
  const importedDates = czechEaipSectors
    .map((sector) => dateOnly(sector.validFrom))
    .filter((date): date is string => date !== null);
  const databaseEffectiveDate = importedDates.sort().at(-1) ?? null;
  const status = determineAtcDatasetStatus({
    databaseAvailable: database !== null,
    databaseEffectiveDate,
    currentEffectiveDate: parsed.effectiveDate,
    comparison,
  });
  const plan = planAtcImport(dataset, rows ?? { sectors: [], transmitters: [] });
  const storedRows = rows ? [...rows.sectors, ...rows.transmitters] : [];
  const sources = [...new Set(storedRows.map((row) => row.source))];
  const sourceLabel = sources.length === 1 ? sources[0] : sources.length > 1 ? "multiple sources" : "not imported";
  const czechEaipRows = [...czechEaipSectors, ...(rows?.transmitters.filter((transmitter) => transmitter.sourceReference.includes("aim.rlp.cz")) ?? [])];
  const lastVerifiedValues = czechEaipRows.map((row) => Date.parse(String(row.lastVerifiedAt))).filter(Number.isFinite);
  console.log("ATC Czech dataset");
  console.log(`Database status: ${rows ? rows.sectors.length || rows.transmitters.length ? "configured" : "empty" : "unavailable"}`);
  console.log(`Database sectors: ${rows?.sectors.length ?? 0}`);
  console.log(`Current valid sectors: ${comparison.expectedIds.length}`);
  console.log(`Stored Czech eAIP sector IDs: ${comparison.storedIds.length}`);
  console.log(`Matching sector IDs: ${comparison.matchingIds.length}`);
  console.log(`Missing sector IDs: ${comparison.missingIds.length}`);
  console.log(`Extra sector IDs: ${comparison.extraIds.length}`);
  console.log(`Database transmitters: ${rows?.transmitters.length ?? 0}`);
  console.log(`Database source: ${sourceLabel}`);
  console.log(`Database effective date: ${databaseEffectiveDate ?? "not imported"}`);
  console.log(`Current AIP effective date: ${parsed.effectiveDate}`);
  console.log(`Last verified: ${lastVerifiedValues.length ? new Date(Math.max(...lastVerifiedValues)).toISOString() : "not imported"}`);
  console.log(`Status: ${status}`);
  console.log(`Import plan: sectors added ${plan.sectors.added.length}, updated ${plan.sectors.updated.length}, unchanged ${plan.sectors.unchanged.length}, obsolete ${plan.sectors.obsolete.length}; transmitters added ${plan.transmitters.added.length}, updated ${plan.transmitters.updated.length}, unchanged ${plan.transmitters.unchanged.length}, obsolete ${plan.transmitters.obsolete.length}`);
  if (!rows?.transmitters.length) console.log("no authoritative transmitter-location source found");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
