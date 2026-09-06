import type { Aircraft } from "@/lib/aircraft/types";
import { getFlightContinuityGapMs, getHistoryRetentionDays, getHistorySampleIntervalMs } from "@/lib/server/config";
import { getPrisma } from "@/lib/server/db";

export interface HistoryResponse {
  source: "postgres" | "memory";
  flight: {
    id: number | null;
    callsign: string | null;
    registration: string | null;
    aircraftType: string | null;
    airline: string | null;
    origin: string | null;
    destination: string | null;
    startedAt: string | null;
    endedAt: string | null;
    lastSeenAt: string | null;
    maxAltitude: number | null;
    minDistanceKm: number | null;
  } | null;
  positions: Array<{
    recordedAt: string;
    lat: number;
    lon: number;
    altitude: number | null;
    groundSpeed: number | null;
    track: number | null;
  }>;
}

let lastRetentionRunAt = 0;
let lastFlightMaintenanceRunAt = 0;

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let nextIndex = 0;
  let firstError: unknown = null;
  const runWorker = async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex++];
      try {
        await worker(item);
      } catch (error) {
        firstError ??= error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runWorker()));
  if (firstError) throw firstError;
}

async function pruneHistoryIfDue(database: NonNullable<ReturnType<typeof getPrisma>>): Promise<void> {
  const now = Date.now();
  const maintenanceDue = now - lastFlightMaintenanceRunAt >= Math.max(getHistorySampleIntervalMs(), 5 * 60_000);
  const retentionDue = now - lastRetentionRunAt >= 6 * 60 * 60_000;
  if (!maintenanceDue && !retentionDue) return;
  if (maintenanceDue) {
    lastFlightMaintenanceRunAt = now;
    try {
      await closeStaleFlights(database, new Date(now));
    } catch (error) {
      lastFlightMaintenanceRunAt = 0;
      console.error("AirRadar stale flight cleanup failed", error);
    }
  }
  if (!retentionDue) return;
  lastRetentionRunAt = now;
  try {
    const cutoff = new Date(now - getHistoryRetentionDays() * 24 * 60 * 60_000);
    // This also removes old samples belonging to still-open flights. A later
    // migration can partition this table if a larger installation needs it.
    await database.orm.public.FlightPosition.where((position) => position.recordedAt.lt(cutoff)).delete();
  } catch (error) {
    lastRetentionRunAt = 0;
    console.error("AirRadar history retention cleanup failed", error);
  }
}

export function staleFlightEndTime(lastSeenAt: Date, now: Date, continuityGapMs = getFlightContinuityGapMs()): Date | null {
  return now.getTime() - lastSeenAt.getTime() > continuityGapMs ? lastSeenAt : null;
}

/** Closes flights whose aircraft disappeared without a final snapshot. */
export async function closeStaleFlights(
  database: NonNullable<ReturnType<typeof getPrisma>>,
  now = new Date(),
): Promise<void> {
  const cutoff = new Date(now.getTime() - getFlightContinuityGapMs());
  const schema = database.orm.public;
  const staleFlights = await schema.Flight
    .where({ endTime: null })
    .where((flight) => flight.lastSeenAt.lt(cutoff))
    .all();
  await runWithConcurrency(staleFlights, 4, async (flight) => {
    const endTime = staleFlightEndTime(flight.lastSeenAt, now);
    if (!endTime) return;
    await schema.Flight.where({ id: flight.id }).update({ endTime });
  });
}

export async function recordAircraftSnapshot(aircraft: Aircraft[], recordedAt: Date): Promise<void> {
  const database = getPrisma();
  if (!database) return;

  await runWithConcurrency(aircraft, 8, async (item) => {
    if (item.lat === null || item.lon === null) return;
    const latitude = item.lat;
    const longitude = item.lon;
    await database.transaction(async (transaction) => {
      const schema = transaction.orm.public;
      const dbAircraft = await schema.Aircraft.where({ icaoHex: item.icaoHex }).upsert({
        update: {
          registration: item.registration ?? item.enrichment?.metadata?.registration ?? null,
          registrationCountry: item.enrichment?.metadata?.registrationCountry,
          registrationCountryCode: item.enrichment?.metadata?.registrationCountryCode,
          aircraftType: item.aircraftType,
          manufacturer: item.enrichment?.metadata?.manufacturer,
          model: item.enrichment?.metadata?.aircraftDescription,
          operator: item.enrichment?.metadata?.operator,
          updatedAt: recordedAt,
        },
        create: {
          icaoHex: item.icaoHex,
          registration: item.registration ?? item.enrichment?.metadata?.registration ?? null,
          registrationCountry: item.enrichment?.metadata?.registrationCountry,
          registrationCountryCode: item.enrichment?.metadata?.registrationCountryCode,
          aircraftType: item.aircraftType,
          manufacturer: item.enrichment?.metadata?.manufacturer,
          model: item.enrichment?.metadata?.aircraftDescription,
          operator: item.enrichment?.metadata?.operator,
          updatedAt: recordedAt,
        },
      });

      let flight = await schema.Flight
        .where({ aircraftId: dbAircraft.id })
        .where({ endTime: null })
        .orderBy((row) => row.startTime.desc())
        .first();

      const callsignChanged = Boolean(flight?.callsign && item.callsign && flight.callsign !== item.callsign);
      const continuityBroken = Boolean(
        flight && recordedAt.getTime() - flight.lastSeenAt.getTime() > getFlightContinuityGapMs(),
      );

      if (!flight || callsignChanged || continuityBroken) {
        if (flight) {
          await schema.Flight.where({ id: flight.id }).update(
            continuityBroken
              ? { endTime: flight.lastSeenAt }
              : { endTime: recordedAt, lastSeenAt: recordedAt },
          );
        }
        flight = await schema.Flight.create({
          aircraftId: dbAircraft.id,
          instanceKey: `${item.icaoHex}:${recordedAt.getTime()}`,
          callsign: item.callsign,
          registration: item.registration,
          aircraftType: item.enrichment?.metadata?.icaoTypeCode ?? item.aircraftType,
          airline: item.enrichment?.route?.airline ?? null,
          origin: item.enrichment?.route?.origin ?? null,
          destination: item.enrichment?.route?.destination ?? null,
          maxAltitude: item.altitude,
          minDistanceKm: item.distanceKm,
          startTime: recordedAt,
          lastSeenAt: recordedAt,
        });
      } else {
        await schema.Flight.where({ id: flight.id }).update({
          callsign: flight.callsign ?? item.callsign,
          registration: flight.registration ?? item.registration ?? item.enrichment?.metadata?.registration,
          aircraftType: flight.aircraftType ?? item.enrichment?.metadata?.icaoTypeCode ?? item.aircraftType,
          airline: flight.airline ?? item.enrichment?.route?.airline,
          origin: flight.origin ?? item.enrichment?.route?.origin,
          destination: flight.destination ?? item.enrichment?.route?.destination,
          maxAltitude: Math.max(flight.maxAltitude ?? 0, item.altitude ?? 0) || null,
          minDistanceKm: Math.min(flight.minDistanceKm ?? Number.POSITIVE_INFINITY, item.distanceKm ?? Number.POSITIVE_INFINITY) === Number.POSITIVE_INFINITY
            ? null
            : Math.min(flight.minDistanceKm ?? Number.POSITIVE_INFINITY, item.distanceKm ?? Number.POSITIVE_INFINITY),
          lastSeenAt: recordedAt,
        });
      }

      await schema.FlightPosition.create({
        flightId: flight.id,
        recordedAt,
        lat: latitude,
        lon: longitude,
        ...(item.altitude === null ? {} : { altitude: item.altitude }),
        ...(item.groundSpeed === null ? {} : { groundSpeed: item.groundSpeed }),
        ...(item.track === null ? {} : { track: item.track }),
        ...(item.verticalRate === null ? {} : { verticalRate: item.verticalRate }),
      });
    });
  });

  await pruneHistoryIfDue(database);
}

export async function getAircraftHistory(hex: string, fallback: Aircraft | null): Promise<HistoryResponse> {
  const database = getPrisma();
  if (database) {
    try {
      const schema = database.orm.public;
      const aircraft = await schema.Aircraft.where({ icaoHex: hex.toUpperCase() }).first();
      const flight = aircraft
        ? await schema.Flight
            .where({ aircraftId: aircraft.id })
            .orderBy((row) => row.startTime.desc())
            .first()
        : null;
      if (flight) {
        const positions = await schema.FlightPosition
          .where({ flightId: flight.id })
          .orderBy((row) => row.recordedAt.desc())
          .limit(500)
          .all();
        return {
          source: "postgres",
          flight: {
          id: flight.id,
          callsign: flight.callsign,
          registration: flight.registration,
          aircraftType: flight.aircraftType,
          airline: flight.airline,
          origin: flight.origin,
          destination: flight.destination,
          startedAt: flight.startTime.toISOString(),
          endedAt: flight.endTime?.toISOString() ?? null,
          lastSeenAt: flight.lastSeenAt.toISOString(),
          maxAltitude: flight.maxAltitude,
          minDistanceKm: flight.minDistanceKm,
          },
          positions: positions.reverse().map((position) => ({
            recordedAt: position.recordedAt.toISOString(),
            lat: position.lat,
            lon: position.lon,
            altitude: position.altitude,
            groundSpeed: position.groundSpeed,
            track: position.track,
          })),
        };
      }
    } catch {
      // A database outage should not hide the live in-memory trail.
    }
  }

  return {
    source: "memory",
    flight: fallback
      ? {
          id: null,
          callsign: fallback.callsign,
          registration: fallback.registration ?? fallback.enrichment?.metadata?.registration ?? null,
          aircraftType: fallback.enrichment?.metadata?.icaoTypeCode ?? fallback.aircraftType,
          airline: fallback.enrichment?.route?.airline ?? null,
          origin: fallback.enrichment?.route?.origin ?? null,
          destination: fallback.enrichment?.route?.destination ?? null,
          startedAt: fallback.trail[0]?.recordedAt ?? fallback.lastSeen,
          endedAt: null,
          lastSeenAt: fallback.lastSeen,
          maxAltitude: fallback.altitude,
          minDistanceKm: fallback.distanceKm,
        }
      : null,
    positions: fallback?.trail.map((position) => ({
      recordedAt: position.recordedAt,
      lat: position.lat,
      lon: position.lon,
      altitude: fallback.altitude,
      groundSpeed: fallback.groundSpeed,
      track: fallback.track,
    })) ?? [],
  };
}
