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
  const prisma = getPrisma();
  if (!prisma) return;

  for (const item of aircraft) {
    if (item.lat === null || item.lon === null) continue;
    const dbAircraft = await prisma.aircraft.upsert({
      where: { icaoHex: item.icaoHex },
      update: {
        registration: item.registration,
        aircraftType: item.aircraftType,
        updatedAt: recordedAt,
      },
      create: {
        icaoHex: item.icaoHex,
        registration: item.registration,
        aircraftType: item.aircraftType,
      },
    });

    let flight = await prisma.flight.findFirst({
      where: { aircraftId: dbAircraft.id, endTime: null },
      orderBy: { startTime: "desc" },
    });
    if (!flight) {
      flight = await prisma.flight.create({
        data: {
          aircraftId: dbAircraft.id,
          callsign: item.callsign,
          startTime: recordedAt,
        },
      });
    } else if (flight.callsign !== item.callsign) {
      flight = await prisma.flight.update({ where: { id: flight.id }, data: { callsign: item.callsign } });
    }

    await prisma.flightPosition.create({
      data: {
        flightId: flight.id,
        recordedAt,
        lat: item.lat,
        lon: item.lon,
        altitude: item.altitude,
        groundSpeed: item.groundSpeed,
        track: item.track,
        verticalRate: item.verticalRate,
      },
    });
  }
}

export async function getAircraftHistory(hex: string, fallback: Aircraft | null): Promise<HistoryResponse> {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const aircraft = await prisma.aircraft.findUnique({
        where: { icaoHex: hex.toUpperCase() },
        include: {
          flights: {
            orderBy: { startTime: "desc" },
            take: 1,
            include: { positions: { orderBy: { recordedAt: "asc" }, take: 500 } },
          },
        },
      });
      const flight = aircraft?.flights[0];
      if (flight) {
        return {
          source: "postgres",
          flight: {
            id: flight.id,
            callsign: flight.callsign,
            startedAt: flight.startTime.toISOString(),
            endedAt: flight.endTime?.toISOString() ?? null,
          },
          positions: flight.positions.map((position) => ({
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
