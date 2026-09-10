#!/usr/bin/env node
import "dotenv/config";
import "temporal-polyfill/full/global";
import postgres from "@prisma/orm-postgres/runtime";
import type { Contract } from "../generated/prisma8/contract";
import contractJson from "../generated/prisma8/contract.json" with { type: "json" };
import { OURAIRPORTS_DATA_URL, parseOurAirportsCsv } from "../lib/airports/ourairports";

const DOWNLOAD_TIMEOUT_MS = 30_000;
const OURAIRPORTS_USER_AGENT = "AirRadar/1.0 (+https://airradar.pomykal.cz; ourairports-import)";

function parseArguments(): { dryRun: boolean; url: string } {
  const argumentsList = process.argv.slice(2);
  const dryRun = argumentsList.includes("--dry-run");
  const extraArguments = argumentsList.filter((argument) => argument !== "--dry-run");
  if (extraArguments.length > 1) throw new Error("Usage: npm run airports:import -- [--dry-run] [CSV URL]");
  return { dryRun, url: extraArguments[0] ?? OURAIRPORTS_DATA_URL };
}

async function main(): Promise<void> {
  const { dryRun, url } = parseArguments();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  const response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": OURAIRPORTS_USER_AGENT }, cache: "no-store" }).finally(() => clearTimeout(timeout));
  if (!response.ok) throw new Error(`OurAirports download failed: HTTP ${response.status}`);
  const { airports, skipped } = parseOurAirportsCsv(await response.text());
  console.log(`Prepared ${airports.length} airports from ${url}; skipped ${skipped} invalid selected rows.`);
  if (dryRun) {
    console.log("Dry-run: no database changes written.");
    return;
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required for an airport import");
  const database = postgres<Contract>({ contractJson, url: databaseUrl });
  const now = Temporal.Instant.fromEpochMilliseconds(Date.now());
  for (const airport of airports) {
    const values = {
      iata: airport.iataCode,
      name: airport.name,
      city: airport.city,
      country: airport.country,
      latitude: airport.latitude,
      longitude: airport.longitude,
      ourAirportsId: airport.ourAirportsId,
      ourAirportsIdent: airport.ourAirportsIdent,
      type: airport.type ?? null,
      elevationFt: airport.elevationFt ?? null,
      scheduledService: airport.scheduledService ?? null,
      region: airport.region ?? null,
      localCode: airport.localCode ?? null,
      updatedAt: now,
    };
    const bySource = await database.orm.public.Airport.where({ ourAirportsId: airport.ourAirportsId }).first();
    const byCanonical = await database.orm.public.Airport.where({ icao: airport.icaoCode }).first();
    if (byCanonical && bySource && byCanonical.id !== bySource.id) throw new Error(`Airport identity conflict: source id ${airport.ourAirportsId} cannot become ${airport.icaoCode}`);
    const conflictOn = bySource ? { id: bySource.id } : byCanonical?.ourAirportsId === null || byCanonical?.ourAirportsId === undefined ? { icao: airport.icaoCode } : { ourAirportsId: airport.ourAirportsId };
    await database.orm.public.Airport.upsert({ conflictOn, update: values, create: { icao: airport.icaoCode, ...values } });
  }
  console.log(`Airport import completed: upserted ${airports.length} rows; no existing rows were deleted.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
