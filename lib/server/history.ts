import type { Aircraft } from "@/lib/aircraft/types";
import { getFlightContinuityGapMs, getHistoryRetentionDays } from "@/lib/server/config";
import { getPrisma } from "@/lib/server/db";

export interface HistoryResponse {
  source: "postgres" | "memory";
  flight: {
    id: number | null;
    callsign: string | null;
    startedAt: string | null;
    endedAt: string | null;
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
  if (now - lastRetentionRunAt < 6 * 60 * 60_000) return;
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
          registration: item.registration,
          aircraftType: item.aircraftType,
          updatedAt: recordedAt,
        },
        create: {
          icaoHex: item.icaoHex,
          registration: item.registration,
          aircraftType: item.aircraftType,
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
          await schema.Flight.where({ id: flight.id }).update({ endTime: recordedAt, lastSeenAt: recordedAt });
        }
        flight = await schema.Flight.create({
          aircraftId: dbAircraft.id,
          instanceKey: `${item.icaoHex}:${recordedAt.getTime()}`,
          callsign: item.callsign,
          startTime: recordedAt,
          lastSeenAt: recordedAt,
        });
      } else {
        await schema.Flight.where({ id: flight.id }).update({
          callsign: flight.callsign ?? item.callsign,
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
            startedAt: flight.startTime.toISOString(),
            endedAt: flight.endTime?.toISOString() ?? null,
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
      ? { id: null, callsign: fallback.callsign, startedAt: fallback.lastSeen, endedAt: null }
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
