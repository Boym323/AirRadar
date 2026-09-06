#!/usr/bin/env node
import "dotenv/config";
import "temporal-polyfill/full/global";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "@prisma/orm-postgres/runtime";
import contractJson from "../generated/prisma8/contract.json" with { type: "json" };
import type { Contract } from "../generated/prisma8/contract";
import {
  planAtcImport,
  validateAtcImportDocument,
  type AtcImportPlan,
  type ExistingAtcSectorRecord,
  type ExistingAtcTransmitterRecord,
  type NormalizedAtcImport,
} from "../lib/atc/import-format";

const database = process.env.DATABASE_URL?.trim()
  ? postgres<Contract>({ contractJson, url: process.env.DATABASE_URL })
  : null;

function requireDatabase(): NonNullable<typeof database> {
  if (!database) throw new Error("DATABASE_URL is required for database inspection");
  return database;
}

function parseArguments(): { file: string; dryRun: boolean } {
  const argumentsList = process.argv.slice(2);
  const dryRun = argumentsList.includes("--dry-run");
  const files = argumentsList.filter((argument) => argument !== "--dry-run");
  if (files.length !== 1) throw new Error("Usage: npm run atc:import -- [--dry-run] data/atc/cz-atc.json");
  return { file: resolve(process.cwd(), files[0]), dryRun };
}

function instant(value: string | null): Temporal.Instant | null {
  return value ? Temporal.Instant.from(value) : null;
}

function sectorValues(sector: NormalizedAtcImport["sectors"][number]) {
  return {
    name: sector.name,
    polygonJson: JSON.stringify(sector.polygons),
    lowerAltitudeFt: sector.lowerAltitudeFt,
    upperAltitudeFt: sector.upperAltitudeFt,
    atcCallsign: sector.atcCallsign,
    service: sector.service,
    primaryFrequencyMhz: sector.primaryFrequencyMhz,
    alternateFrequenciesJson: JSON.stringify(sector.alternateFrequencies),
    country: sector.country,
    source: sector.source,
    sourceReference: sector.sourceReference,
    validFrom: instant(sector.validFrom),
    validTo: instant(sector.validTo),
    lastVerifiedAt: instant(sector.lastVerifiedAt)!,
    updatedAt: Temporal.Instant.fromEpochMilliseconds(Date.now()),
  };
}

function transmitterValues(transmitter: NormalizedAtcImport["transmitters"][number]) {
  return {
    name: transmitter.name,
    latitude: transmitter.latitude,
    longitude: transmitter.longitude,
    service: transmitter.service,
    frequencyMhz: transmitter.frequencyMhz,
    notes: transmitter.notes,
    source: transmitter.source,
    sourceReference: transmitter.sourceReference,
    validFrom: instant(transmitter.validFrom),
    validTo: instant(transmitter.validTo),
    lastVerifiedAt: instant(transmitter.lastVerifiedAt)!,
    updatedAt: Temporal.Instant.fromEpochMilliseconds(Date.now()),
  };
}

async function existingRows(): Promise<{ sectors: ExistingAtcSectorRecord[]; transmitters: ExistingAtcTransmitterRecord[] }> {
  const schema = requireDatabase().orm.public;
  const [sectors, transmitters] = await Promise.all([
    schema.AtcSector.limit(10000).all(),
    schema.AtcTransmitter.limit(10000).all(),
  ]);
  return { sectors, transmitters };
}

function printActions(label: string, actions: AtcImportPlan["sectors"]): void {
  console.log(`${label}: added ${actions.added.length}, updated ${actions.updated.length}, unchanged ${actions.unchanged.length}, obsolete ${actions.obsolete.length}`);
  if (actions.obsolete.length) console.log(`  obsolete ${label.toLowerCase()}: ${actions.obsolete.join(", ")}`);
}

function obsoleteEnd(row: { validFrom: unknown }, fallback: Temporal.Instant): Temporal.Instant {
  const validFrom = row.validFrom === null || row.validFrom === undefined ? Number.NaN : Date.parse(String(row.validFrom));
  return Number.isFinite(validFrom) && validFrom > fallback.epochMilliseconds
    ? Temporal.Instant.fromEpochMilliseconds(validFrom - 1)
    : fallback;
}

async function writeImport(dataset: NormalizedAtcImport, plan: AtcImportPlan, existing: { sectors: ExistingAtcSectorRecord[]; transmitters: ExistingAtcTransmitterRecord[] }): Promise<void> {
  const obsoleteAt = Temporal.Instant.fromEpochMilliseconds(Date.parse(dataset.source.effectiveDate) - 1);
  const existingSectors = new Map(existing.sectors.map((row) => [row.id, row]));
  const existingTransmitters = new Map(existing.transmitters.map((row) => [row.id, row]));
  await requireDatabase().transaction(async (transaction) => {
    const schema = transaction.orm.public;
    for (const sector of dataset.sectors) {
      await schema.AtcSector.where({ id: sector.id }).upsert({
        update: sectorValues(sector),
        create: { id: sector.id, ...sectorValues(sector) },
      });
    }
    for (const transmitter of dataset.transmitters) {
      await schema.AtcTransmitter.where({ id: transmitter.id }).upsert({
        update: transmitterValues(transmitter),
        create: { id: transmitter.id, ...transmitterValues(transmitter) },
      });
    }
    for (const id of plan.sectors.obsolete) {
      const row = existingSectors.get(id);
      if (!row || (row.validTo !== null && row.validTo !== undefined && Date.parse(String(row.validTo)) <= obsoleteAt.epochMilliseconds)) continue;
      await schema.AtcSector.where({ id }).update({ validTo: obsoleteEnd(row, obsoleteAt), updatedAt: Temporal.Instant.fromEpochMilliseconds(Date.now()) });
    }
    for (const id of plan.transmitters.obsolete) {
      const row = existingTransmitters.get(id);
      if (!row || (row.validTo !== null && row.validTo !== undefined && Date.parse(String(row.validTo)) <= obsoleteAt.epochMilliseconds)) continue;
      await schema.AtcTransmitter.where({ id }).update({ validTo: obsoleteEnd(row, obsoleteAt), updatedAt: Temporal.Instant.fromEpochMilliseconds(Date.now()) });
    }
  });
}

async function main(): Promise<void> {
  const { file, dryRun } = parseArguments();
  const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
  const dataset = validateAtcImportDocument(raw);
  const configured = Boolean(process.env.DATABASE_URL?.trim());
  if (!configured && !dryRun) throw new Error("DATABASE_URL is required for a non-dry ATC import");
  const existing = configured ? await existingRows() : { sectors: [], transmitters: [] };
  const plan = planAtcImport(dataset, existing);
  console.log(`Validated ATC schema v${dataset.schemaVersion}: ${file}`);
  console.log(`Source: ${dataset.source.name} (${dataset.source.reference}), effective ${dataset.source.effectiveDate}`);
  printActions("Sectors", plan.sectors);
  printActions("Transmitters", plan.transmitters);
  if (dryRun) {
    console.log("Dry-run: no database changes written.");
    return;
  }
  await writeImport(dataset, plan, existing);
  console.log("ATC import committed in one transaction.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
