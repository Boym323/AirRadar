import "temporal-polyfill/full/global";
import type { OurAirportsAirport, OurAirportsFrequency, OurAirportsNavaid, OurAirportsRunway } from "./ourairports";

export const AIRPORTS_SYNC_BATCH_SIZE = 1_000;
export const AIRPORTS_SYNC_MIN_COUNTS = { airports: 100, runways: 100, frequencies: 100, navaids: 1_000 } as const;

export interface AirportSyncPlan {
  airports: OurAirportsAirport[];
  runways: OurAirportsRunway[];
  frequencies: OurAirportsFrequency[];
  navaids: OurAirportsNavaid[];
  skipped: { airports: number; runways: number; frequencies: number; navaids: number };
  relationships: { runwaysUnknownAirport: number; frequenciesUnknownAirport: number; navaidsAssociated: number; navaidsStandalone: number };
  bytes: { airports: number; runways: number; frequencies: number; navaids: number };
}

export type AirportSyncDatabase = { transaction(callback: (transaction: AirportSyncTransaction) => Promise<void>): Promise<unknown> };
export type AirportSyncTransaction = {
  orm: { public: {
    Airport: { where(filter: { id?: number; icao?: string; ourAirportsId?: number }): { first(): Promise<{ id: number; icao: string; ourAirportsId: number | null } | null> }; upsert(input: { conflictOn: { id?: number; icao?: string; ourAirportsId?: number }; update: Record<string, unknown>; create: Record<string, unknown> }): Promise<unknown> };
  } };
  execute(plan: unknown): Promise<unknown>;
  sql: { public: {
    airportRunway: { delete(): { build(): unknown }; insert(rows: Record<string, unknown>[]): { build(): unknown } };
    airportFrequency: { delete(): { build(): unknown }; insert(rows: Record<string, unknown>[]): { build(): unknown } };
    navaid: { delete(): { build(): unknown }; insert(rows: Record<string, unknown>[]): { build(): unknown } };
  } };
};

export function makeAirportSyncPlan(input: Omit<AirportSyncPlan, "relationships"> & { relationships?: Partial<AirportSyncPlan["relationships"]> }): AirportSyncPlan {
  const airportIdents = new Set(input.airports.map((airport) => airport.ourAirportsIdent));
  const runwaysUnknownAirport = input.runways.filter((row) => !airportIdents.has(row.airportIdent)).length;
  const frequenciesUnknownAirport = input.frequencies.filter((row) => !airportIdents.has(row.airportIdent)).length;
  const navaidsAssociated = input.navaids.filter((row) => row.associatedAirportIdent && airportIdents.has(row.associatedAirportIdent)).length;
  return { ...input, relationships: { runwaysUnknownAirport, frequenciesUnknownAirport, navaidsAssociated, navaidsStandalone: input.navaids.length - navaidsAssociated, ...input.relationships } };
}

export function assertAirportSyncSanity(plan: AirportSyncPlan, skipSanity = false): void {
  if (skipSanity) return;
  const counts = { airports: plan.airports.length, runways: plan.runways.length - plan.relationships.runwaysUnknownAirport, frequencies: plan.frequencies.length - plan.relationships.frequenciesUnknownAirport, navaids: plan.navaids.length };
  for (const [dataset, minimum] of Object.entries(AIRPORTS_SYNC_MIN_COUNTS)) if (counts[dataset as keyof typeof counts] < minimum) throw new Error(`OurAirports ${dataset} sanity check failed: expected at least ${minimum} valid selected rows`);
}

async function insertBatches(transaction: AirportSyncTransaction, table: { insert(rows: Record<string, unknown>[]): { build(): unknown } }, rows: Record<string, unknown>[]): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += AIRPORTS_SYNC_BATCH_SIZE) await transaction.execute(table.insert(rows.slice(offset, offset + AIRPORTS_SYNC_BATCH_SIZE)).build());
}

/** Writes a complete validated plan in one transaction; child tables are pruned only after validation. */
export async function writeAirportSyncPlan(database: unknown, plan: AirportSyncPlan, now: Temporal.Instant): Promise<void> {
  const databaseApi = database as AirportSyncDatabase;
  await databaseApi.transaction(async (transaction) => {
    const airportIds = new Map<string, number>();
    for (const airport of plan.airports) {
      const values = { iata: airport.iataCode, name: airport.name, city: airport.city, country: airport.country, latitude: airport.latitude, longitude: airport.longitude, ourAirportsId: airport.ourAirportsId, ourAirportsIdent: airport.ourAirportsIdent, type: airport.type ?? null, elevationFt: airport.elevationFt ?? null, scheduledService: airport.scheduledService ?? null, region: airport.region ?? null, localCode: airport.localCode ?? null, updatedAt: now };
      const bySource = await transaction.orm.public.Airport.where({ ourAirportsId: airport.ourAirportsId }).first();
      const byCanonical = await transaction.orm.public.Airport.where({ icao: airport.icaoCode }).first();
      if (byCanonical && bySource && byCanonical.id !== bySource.id) throw new Error(`Airport identity conflict for source id ${airport.ourAirportsId} and canonical ${airport.icaoCode}`);
      if (byCanonical && !bySource && byCanonical.ourAirportsId != null && byCanonical.ourAirportsId !== airport.ourAirportsId) throw new Error(`Airport canonical ICAO conflict for ${airport.icaoCode}`);
      const update = values;
      const conflictOn = bySource ? { id: bySource.id } : { icao: airport.icaoCode };
      await transaction.orm.public.Airport.upsert({ conflictOn, update, create: { icao: airport.icaoCode, ...values } });
      const persisted = bySource ?? await transaction.orm.public.Airport.where({ ourAirportsId: airport.ourAirportsId }).first();
      if (!persisted) throw new Error(`Airport source id ${airport.ourAirportsId} was not persisted`);
      airportIds.set(airport.ourAirportsIdent, persisted.id);
    }
    await transaction.execute(transaction.sql.public.airportRunway.delete().build());
    await transaction.execute(transaction.sql.public.airportFrequency.delete().build());
    await transaction.execute(transaction.sql.public.navaid.delete().build());
    const runways = plan.runways.flatMap((row) => { const airportId = airportIds.get(row.airportIdent); return airportId === undefined ? [] : [{ id: row.id, airportId, sourceAirportIdent: row.airportIdent, lengthFt: row.lengthFt, widthFt: row.widthFt, surface: row.surface, lighted: row.lighted, closed: row.closed, leIdent: row.leIdent, leLatitude: row.leLatitude, leLongitude: row.leLongitude, leElevationFt: row.leElevationFt, leHeadingDegT: row.leHeadingDegT, leDisplacedThresholdFt: row.leDisplacedThresholdFt, heIdent: row.heIdent, heLatitude: row.heLatitude, heLongitude: row.heLongitude, heElevationFt: row.heElevationFt, heHeadingDegT: row.heHeadingDegT, heDisplacedThresholdFt: row.heDisplacedThresholdFt }]; });
    const frequencies = plan.frequencies.flatMap((row) => { const airportId = airportIds.get(row.airportIdent); return airportId === undefined ? [] : [{ id: row.id, airportId, sourceAirportIdent: row.airportIdent, type: row.type, description: row.description, frequencyMhz: row.frequencyMhz }]; });
    const navaids = plan.navaids.map((row) => ({ id: row.id, filename: row.filename, ident: row.ident, name: row.name, type: row.type, frequencyKhz: row.frequencyKhz, latitude: row.latitude, longitude: row.longitude, elevationFt: row.elevationFt, country: row.country, dmeFrequencyKhz: row.dmeFrequencyKhz, dmeChannel: row.dmeChannel, dmeLatitude: row.dmeLatitude, dmeLongitude: row.dmeLongitude, dmeElevationFt: row.dmeElevationFt, slavedVariationDeg: row.slavedVariationDeg, magneticVariationDeg: row.magneticVariationDeg, usageType: row.usageType, power: row.power, associatedAirportId: row.associatedAirportIdent ? airportIds.get(row.associatedAirportIdent) ?? null : null, associatedAirportIdent: row.associatedAirportIdent }));
    await insertBatches(transaction, transaction.sql.public.airportRunway, runways);
    await insertBatches(transaction, transaction.sql.public.airportFrequency, frequencies);
    await insertBatches(transaction, transaction.sql.public.navaid, navaids);
  });
}
