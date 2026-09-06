#!/usr/bin/env node
import "dotenv/config";
import "temporal-polyfill/full/global";
import postgres from "@prisma/orm-postgres/runtime";
import type { Contract } from "../generated/prisma8/contract";
import contractJson from "../generated/prisma8/contract.json" with { type: "json" };
import { OURAIRPORTS_DATA_URL, parseOurAirportsCsv } from "../lib/airports/ourairports";

function parseArguments(): { dryRun: boolean; url: string } {
  const argumentsList = process.argv.slice(2);
  const dryRun = argumentsList.includes("--dry-run");
  const extraArguments = argumentsList.filter((argument) => argument !== "--dry-run");
  if (extraArguments.length > 1) throw new Error("Usage: npm run airports:import -- [--dry-run] [CSV URL]");
  return { dryRun, url: extraArguments[0] ?? OURAIRPORTS_DATA_URL };
}

async function main(): Promise<void> {
  const { dryRun, url } = parseArguments();
  const response = await fetch(url);
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
      updatedAt: now,
    };
    await database.orm.public.Airport.upsert({
      conflictOn: { icao: airport.icaoCode },
      update: values,
      create: { icao: airport.icaoCode, ...values },
    });
  }
  console.log(`Airport import completed: upserted ${airports.length} rows; no existing rows were deleted.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
