#!/usr/bin/env node
import "dotenv/config";
import { mkdir, open, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { mergeProcedureDatasets, parseOfficialProcedureSource, ProcedureParseError, type ProcedureDatasetDocument } from "../lib/procedures/pipeline";
import { fetchOfficialProcedureSource, PROCEDURE_DEFAULT_AIRPORTS, type ProcedureCountry } from "../lib/procedures/sources";

function args(): { countries: ProcedureCountry[]; airports: string[]; dryRun: boolean } {
  const values = process.argv.slice(2);
  if (values.some((value) => !["--dry-run"].includes(value) && !value.startsWith("--country=") && !value.startsWith("--airport="))) throw new Error("Usage: npm run procedures:sync -- [--country=CZ,SK,AT] [--airport=LKPR,LZIB] [--dry-run]");
  const countries = (values.find((value) => value.startsWith("--country="))?.slice(10).split(",").map((value) => value.trim().toUpperCase()) ?? ["CZ", "SK", "AT"]) as ProcedureCountry[];
  if (countries.some((country) => !["CZ", "SK", "AT"].includes(country))) throw new Error("Country must be CZ, SK, or AT");
  const specifiedAirports = values.find((value) => value.startsWith("--airport="))?.slice(10).split(",").map((value) => value.trim().toUpperCase()).filter(Boolean);
  const airports = specifiedAirports ?? countries.flatMap((country) => PROCEDURE_DEFAULT_AIRPORTS[country]);
  return { countries, airports, dryRun: values.includes("--dry-run") };
}

async function atomicWrite(file: string, content: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(temporary, "w", 0o644);
    await handle.writeFile(content, "utf8"); await handle.sync(); await handle.close(); handle = null;
    await rename(temporary, file);
  } catch (error) { if (handle) await handle.close().catch(() => undefined); await rm(temporary, { force: true }).catch(() => undefined); throw error; }
}

async function main(): Promise<void> {
  const options = args();
  const selected = options.airports.filter((airport) => options.countries.some((country) => airport.startsWith(country === "CZ" ? "LK" : country === "SK" ? "LZ" : "LO")));
  if (!selected.length) throw new Error("No airports selected for the requested countries");
  const documents: ProcedureDatasetDocument[] = [];
  const skippedAirports: string[] = [];
  for (const airport of selected) {
    const country = airport.startsWith("LK") ? "CZ" : airport.startsWith("LZ") ? "SK" : "AT";
    const fetched = await fetchOfficialProcedureSource(country, airport);
    if (!fetched.effectiveDate) throw new Error(`${airport}: official source did not expose an effective date`);
    const source = { countryCode: country, provider: fetched.provider, reference: fetched.reference, effectiveDate: fetched.effectiveDate, airacCycle: fetched.airacCycle, amendment: fetched.amendment, retrievedAt: new Date().toISOString() };
    try {
      const document = parseOfficialProcedureSource(fetched.html, { airportIcao: airport, source });
      documents.push(document);
      console.log(`${airport}: ${document.procedures.length} procedures, ${document.counts.legs} legs, effective ${source.effectiveDate}`);
    } catch (error) {
      if (!(error instanceof ProcedureParseError)) throw error;
      skippedAirports.push(airport);
      console.warn(`${airport}: structured SID/STAR data unavailable; keeping the existing validated dataset (${error.issues.join("; ")})`);
    }
  }
  if (!documents.length) { console.log("No new structured SID/STAR data was available; existing procedure dataset remains unchanged."); return; }
  if (skippedAirports.length) {
    console.log(`Structured SID/STAR data is incomplete for ${skippedAirports.join(", ")}; existing procedure dataset remains unchanged.`);
    return;
  }
  const merged = mergeProcedureDatasets(documents);
  const output = resolve(process.env.PROCEDURES_DATASET_PATH?.trim() || "data/procedures/generated/procedures.json");
  if (options.dryRun) { console.log(`Dry run: validated ${merged.counts.procedures} procedures; no file was written.`); return; }
  await atomicWrite(output, `${JSON.stringify(merged, null, 2)}\n`);
  console.log(`Wrote ${output}`);
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); console.error("Existing procedure dataset remains unchanged."); process.exitCode = 1; });
