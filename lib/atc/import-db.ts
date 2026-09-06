import "temporal-polyfill/full/global";
import postgres from "@prisma/orm-postgres/runtime";
import contractJson from "../../generated/prisma8/contract.json" with { type: "json" };
import type { Contract } from "../../generated/prisma8/contract";
import {
  planAtcImport,
  type AtcImportPlan,
  type ExistingAtcSectorRecord,
  type ExistingAtcTransmitterRecord,
  type NormalizedAtcImport,
} from "./import-format";

export type AtcDatabase = ReturnType<typeof postgres<Contract>>;

export function createAtcDatabase(url = process.env.DATABASE_URL?.trim()): AtcDatabase | null {
  return url ? postgres<Contract>({ contractJson, url }) : null;
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
    lowerAltitudeReference: sector.lowerAltitudeReference,
    upperAltitudeReference: sector.upperAltitudeReference,
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

export async function existingAtcRows(database: AtcDatabase): Promise<{ sectors: ExistingAtcSectorRecord[]; transmitters: ExistingAtcTransmitterRecord[] }> {
  const schema = database.orm.public;
  const [sectors, transmitters] = await Promise.all([
    schema.AtcSector.limit(10000).all(),
    schema.AtcTransmitter.limit(10000).all(),
  ]);
  return { sectors, transmitters };
}

export function printAtcImportPlan(plan: AtcImportPlan): void {
  const print = (label: string, actions: AtcImportPlan["sectors"]): void => {
    console.log(`${label}: added ${actions.added.length}, updated ${actions.updated.length}, unchanged ${actions.unchanged.length}, obsolete ${actions.obsolete.length}`);
    if (actions.obsolete.length) console.log(`  obsolete ${label.toLowerCase()}: ${actions.obsolete.join(", ")}`);
  };
  print("Sectors", plan.sectors);
  print("Transmitters", plan.transmitters);
}

function obsoleteEnd(row: { validFrom: unknown }, fallback: Temporal.Instant): Temporal.Instant {
  const validFrom = row.validFrom === null || row.validFrom === undefined ? Number.NaN : Date.parse(String(row.validFrom));
  return Number.isFinite(validFrom) && validFrom > fallback.epochMilliseconds
    ? Temporal.Instant.fromEpochMilliseconds(validFrom - 1)
    : fallback;
}

export async function writeAtcImport(
  database: AtcDatabase,
  dataset: NormalizedAtcImport,
  plan: AtcImportPlan,
  existing: { sectors: ExistingAtcSectorRecord[]; transmitters: ExistingAtcTransmitterRecord[] },
): Promise<void> {
  const obsoleteAt = Temporal.Instant.fromEpochMilliseconds(Date.parse(dataset.source.effectiveDate) - 1);
  const existingSectors = new Map(existing.sectors.map((row) => [row.id, row]));
  const existingTransmitters = new Map(existing.transmitters.map((row) => [row.id, row]));
  await database.transaction(async (transaction) => {
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

export async function runAtcImport(dataset: NormalizedAtcImport, options: { dryRun: boolean; database?: AtcDatabase | null }): Promise<AtcImportPlan> {
  const database = options.database === undefined ? createAtcDatabase() : options.database;
  if (!database && !options.dryRun) throw new Error("DATABASE_URL is required for a non-dry ATC import");
  const existing = database ? await existingAtcRows(database) : { sectors: [], transmitters: [] };
  const plan = planAtcImport(dataset, existing);
  printAtcImportPlan(plan);
  if (!options.dryRun) {
    await writeAtcImport(database!, dataset, plan, existing);
    console.log("ATC import committed in one transaction.");
  } else {
    console.log("Dry-run: no database changes written.");
  }
  return plan;
}
