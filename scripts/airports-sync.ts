#!/usr/bin/env node
import "dotenv/config";
import "temporal-polyfill/full/global";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "@prisma/orm-postgres/runtime";
import type { Contract } from "../generated/prisma8/contract";
import contractJson from "../generated/prisma8/contract.json" with { type: "json" };
import {
  OURAIRPORTS_AIRPORTS_URL,
  OURAIRPORTS_FREQUENCIES_URL,
  OURAIRPORTS_NAVAIDS_URL,
  OURAIRPORTS_RUNWAYS_URL,
  parseOurAirportsCsv,
  parseOurAirportsFrequenciesCsv,
  parseOurAirportsNavaidsCsv,
  parseOurAirportsRunwaysCsv,
} from "../lib/airports/ourairports";
import { assertAirportSyncSanity, makeAirportSyncPlan, writeAirportSyncPlan } from "../lib/airports/sync";

const DOWNLOAD_TIMEOUT_MS = 30_000;
const OURAIRPORTS_USER_AGENT = "AirRadar/1.0 (+https://airradar.pomykal.cz; ourairports-sync)";
type DatasetName = "airports" | "runways" | "frequencies" | "navaids";
const urls: Record<DatasetName, string> = { airports: OURAIRPORTS_AIRPORTS_URL, runways: OURAIRPORTS_RUNWAYS_URL, frequencies: OURAIRPORTS_FREQUENCIES_URL, navaids: OURAIRPORTS_NAVAIDS_URL };
const files: Record<DatasetName, string> = { airports: "airports.csv", runways: "runways.csv", frequencies: "airport-frequencies.csv", navaids: "navaids.csv" };

interface Arguments { dryRun: boolean; directory: string | null; urls: Record<DatasetName, string> }
function parseArguments(): Arguments {
  const args = [...process.argv.slice(2)]; const dryRun = args.includes("--dry-run");
  const directoryIndex = args.indexOf("--dir");
  if (directoryIndex >= 0 && !args[directoryIndex + 1]) throw new Error("Missing value for --dir");
  const directory = directoryIndex >= 0 ? args[directoryIndex + 1] : null;
  if (directoryIndex >= 0) args.splice(directoryIndex, 2);
  args.splice(args.indexOf("--dry-run"), dryRun ? 1 : 0);
  const result = { ...urls };
  for (const name of Object.keys(urls) as DatasetName[]) {
    const flag = `--${name}-url`; const index = args.indexOf(flag);
    if (index >= 0) { if (!args[index + 1]) throw new Error(`Missing value for ${flag}`); result[name] = args[index + 1]; args.splice(index, 2); }
  }
  if (args.length) throw new Error("Usage: npm run airports:sync -- [--dry-run] [--dir DIRECTORY] [--airports-url URL] [--runways-url URL] [--frequencies-url URL] [--navaids-url URL]");
  return { dryRun, directory: directory ? resolve(process.cwd(), directory) : null, urls: result };
}

async function download(name: DatasetName, source: string, directory: string | null): Promise<{ text: string; bytes: number; source: string }> {
  if (directory) {
    const path = resolve(directory, files[name]); const data = await readFile(path);
    return { text: data.toString("utf8"), bytes: data.byteLength, source: path };
  }
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(source, { cache: "no-store", signal: controller.signal, headers: { "User-Agent": OURAIRPORTS_USER_AGENT, Accept: "text/csv" } });
    if (!response.ok) throw new Error(`OurAirports ${name} download failed: HTTP ${response.status}`);
    const text = await response.text(); return { text, bytes: Buffer.byteLength(text), source };
  } finally { clearTimeout(timer); }
}

function printDiagnostics(name: DatasetName, skipped: number, diagnostics: { reasons: Record<string, number> }): void {
  const reasons = Object.entries(diagnostics.reasons).map(([reason, count]) => `${reason}=${count}`).join(", ");
  console.log(`${name}: skipped ${skipped}${reasons ? ` (${reasons})` : ""}`);
}

async function main(): Promise<void> {
  const started = Date.now(); const options = parseArguments();
  // Promise.all is intentional here: all four inputs are downloaded before any database mutation.
  const downloaded = await Promise.all((Object.keys(urls) as DatasetName[]).map(async (name) => [name, await download(name, options.urls[name], options.directory)] as const));
  const input = Object.fromEntries(downloaded) as Record<DatasetName, { text: string; bytes: number; source: string }>;
  const airportResult = parseOurAirportsCsv(input.airports.text); const runwayResult = parseOurAirportsRunwaysCsv(input.runways.text); const frequencyResult = parseOurAirportsFrequenciesCsv(input.frequencies.text); const navaidResult = parseOurAirportsNavaidsCsv(input.navaids.text);
  const plan = makeAirportSyncPlan({ airports: airportResult.airports, runways: runwayResult.records, frequencies: frequencyResult.records, navaids: navaidResult.records, skipped: { airports: airportResult.skipped, runways: runwayResult.skipped, frequencies: frequencyResult.skipped, navaids: navaidResult.skipped }, bytes: { airports: input.airports.bytes, runways: input.runways.bytes, frequencies: input.frequencies.bytes, navaids: input.navaids.bytes } });
  assertAirportSyncSanity(plan, process.env.AIRPORTS_SYNC_SKIP_SANITY === "true");
  console.log("OurAirports sync plan");
  console.log(`\nAirports selected:        ${plan.airports.length.toLocaleString()}`); console.log(`Runways:                  ${(plan.runways.length - plan.relationships.runwaysUnknownAirport).toLocaleString()}`); console.log(`Frequencies:              ${(plan.frequencies.length - plan.relationships.frequenciesUnknownAirport).toLocaleString()}`); console.log(`Navaids:                  ${plan.navaids.length.toLocaleString()}`);
  for (const name of ["airports", "runways", "frequencies", "navaids"] as DatasetName[]) printDiagnostics(name, plan.skipped[name], { reasons: name === "airports" ? airportResult.diagnostics.reasons : name === "runways" ? runwayResult.diagnostics.reasons : name === "frequencies" ? frequencyResult.diagnostics.reasons : navaidResult.diagnostics.reasons });
  console.log(`\nRunways unknown airport:  ${plan.relationships.runwaysUnknownAirport.toLocaleString()}`); console.log(`Frequencies unknown airport: ${plan.relationships.frequenciesUnknownAirport.toLocaleString()}`); console.log(`Navaids associated:        ${plan.relationships.navaidsAssociated.toLocaleString()}`); console.log(`Navaids standalone:        ${plan.relationships.navaidsStandalone.toLocaleString()}`); console.log(`Downloaded bytes:          ${Object.values(plan.bytes).reduce((sum, value) => sum + value, 0).toLocaleString()}`);
  if (options.dryRun) { console.log(`\nDry-run: no database changes. Elapsed: ${Date.now() - started} ms; RSS: ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MiB.`); return; }
  const databaseUrl = process.env.DATABASE_URL?.trim(); if (!databaseUrl) throw new Error("DATABASE_URL is required for an airport sync");
  const database = postgres<Contract>({ contractJson, url: databaseUrl });
  try { await writeAirportSyncPlan(database, plan, Temporal.Instant.fromEpochMilliseconds(Date.now())); } finally { await database.close(); }
  console.log(`\nSync completed: airports core preserved (no airport pruning); children replaced atomically and pruned by current source feed in ${Date.now() - started} ms; RSS: ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MiB.`);
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
