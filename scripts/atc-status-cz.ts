#!/usr/bin/env node
import "dotenv/config";
import { fetchCurrentCzEaip, parseCzEaipEnr21, CZ_EAIP_ENR21_URL } from "../lib/atc/cz-eaip";
import { createAtcDatabase, existingAtcRows } from "../lib/atc/import-db";

function dateOnly(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : null;
}

async function main(): Promise<void> {
  const source = await fetchCurrentCzEaip();
  const parsed = parseCzEaipEnr21(source.enr21Html, { publicationHtml: source.publicationHtml });
  const database = createAtcDatabase();
  const rows = database ? await existingAtcRows(database) : null;
  const importedDates = rows?.sectors
    .filter((sector) => sector.sourceReference.startsWith(CZ_EAIP_ENR21_URL))
    .map((sector) => dateOnly(sector.validFrom))
    .filter((date): date is string => date !== null) ?? [];
  const databaseEffectiveDate = importedDates.sort().at(-1) ?? null;
  const status = databaseEffectiveDate === null ? "not imported" : databaseEffectiveDate === parsed.effectiveDate ? "current" : "update available";
  console.log("ATC Czech dataset");
  console.log(`Database effective date: ${databaseEffectiveDate ?? "not imported"}`);
  console.log(`Current AIP effective date: ${parsed.effectiveDate}`);
  console.log(`Status: ${status}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
