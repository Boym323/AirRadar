#!/usr/bin/env node
import "dotenv/config";
import { fetchCurrentCzEaip, mergeCzAd2AtcResults, parseCzEaipAd2AtcAirspace, parseCzEaipEnr21 } from "../lib/atc/cz-eaip";
import { createAtcDatabase, existingAtcRows } from "../lib/atc/import-db";

function dateOnly(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : null;
}

async function main(): Promise<void> {
  const source = await fetchCurrentCzEaip();
  const parsed = mergeCzAd2AtcResults(
    parseCzEaipEnr21(source.enr21Html, { publicationHtml: source.publicationHtml }),
    source.ad2Html.map(({ html }) => parseCzEaipAd2AtcAirspace(html)),
  );
  const database = createAtcDatabase();
  const rows = database ? await existingAtcRows(database) : null;
  const czechEaipSectors = rows?.sectors
    .filter((sector) => sector.sourceReference.includes("aim.rlp.cz")) ?? [];
  const importedDates = czechEaipSectors
    .map((sector) => dateOnly(sector.validFrom))
    .filter((date): date is string => date !== null);
  const databaseEffectiveDate = importedDates.sort().at(-1) ?? null;
  const status = databaseEffectiveDate === null ? "not imported" : databaseEffectiveDate === parsed.effectiveDate ? "current" : "update available";
  const storedRows = rows ? [...rows.sectors, ...rows.transmitters] : [];
  const sources = [...new Set(storedRows.map((row) => row.source))];
  const sourceLabel = sources.length === 1 ? sources[0] : sources.length > 1 ? "multiple sources" : "not imported";
  const czechEaipRows = [...czechEaipSectors, ...(rows?.transmitters.filter((transmitter) => transmitter.sourceReference.includes("aim.rlp.cz")) ?? [])];
  const lastVerifiedValues = czechEaipRows.map((row) => Date.parse(String(row.lastVerifiedAt))).filter(Number.isFinite);
  console.log("ATC Czech dataset");
  console.log(`Database status: ${rows ? rows.sectors.length || rows.transmitters.length ? "configured" : "empty" : "unavailable"}`);
  console.log(`Database sectors: ${rows?.sectors.length ?? 0}`);
  console.log(`Database transmitters: ${rows?.transmitters.length ?? 0}`);
  console.log(`Database source: ${sourceLabel}`);
  console.log(`Database effective date: ${databaseEffectiveDate ?? "not imported"}`);
  console.log(`Current AIP effective date: ${parsed.effectiveDate}`);
  console.log(`Last verified: ${lastVerifiedValues.length ? new Date(Math.max(...lastVerifiedValues)).toISOString() : "not imported"}`);
  console.log(`Status: ${status}`);
  if (!rows?.transmitters.length) console.log("no authoritative transmitter-location source found");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
