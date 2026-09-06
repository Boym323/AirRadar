import type { Aircraft } from "@/lib/aircraft/types";
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

export async function recordAircraftSnapshot(aircraft: Aircraft[], recordedAt: Date): Promise<void> {
  const database = getPrisma();
  if (!database) return;
  const schema = database.orm.public;

  for (const item of aircraft) {
    if (item.lat === null || item.lon === null) continue;
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
    if (!flight) {
      flight = await schema.Flight.create({
        aircraftId: dbAircraft.id,
        callsign: item.callsign,
        startTime: recordedAt,
      });
    } else if (flight.callsign !== item.callsign) {
      await schema.Flight.where({ id: flight.id }).update({ callsign: item.callsign });
    }

    await schema.FlightPosition.create({
      flightId: flight.id,
      recordedAt,
      lat: item.lat,
      lon: item.lon,
      altitude: item.altitude,
      groundSpeed: item.groundSpeed,
      track: item.track,
      verticalRate: item.verticalRate,
    });
  }
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
          .orderBy((row) => row.recordedAt.asc())
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
          positions: positions.map((position) => ({
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
