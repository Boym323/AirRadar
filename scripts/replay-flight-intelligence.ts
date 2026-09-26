import { getHistoryFlight, HistoryDatabaseUnavailableError } from "@/lib/server/history";
import { resolveAirport } from "@/lib/server/airport-resolver";
import { getAirportInfrastructure } from "@/lib/server/airport-infrastructure";
import { replayFlightIntelligence } from "@/lib/intelligence/replay";
import type { Airport } from "@/lib/airports/types";
import type { AirportRunway } from "@/lib/airports/infrastructure";

async function main() {
  const rawId = process.argv[2];
  const flightId = Number(rawId);
  if (!Number.isSafeInteger(flightId) || flightId <= 0) {
    throw new Error("Usage: npm run intelligence:replay -- <flightId>");
  }

  const detail = await getHistoryFlight(flightId);
  if (!detail) throw new Error(`Flight ${flightId} was not found`);

  const codes = [...new Set([detail.flight.origin, detail.flight.destination].filter((value): value is string => Boolean(value)))];
  const airports: Airport[] = [];
  for (const code of codes) {
    const airport = await resolveAirport({ icaoCode: code, iataCode: code });
    if (airport && !airports.some((item) => item.icaoCode === airport.icaoCode)) airports.push(airport);
  }

  const runwaysByAirport = new Map<string, readonly AirportRunway[]>();
  for (const airport of airports) {
    const infrastructure = await getAirportInfrastructure(airport);
    runwaysByAirport.set(airport.icaoCode, infrastructure.runways);
  }

  const report = replayFlightIntelligence(detail, { airports, runwaysByAirport });
  process.stdout.write(JSON.stringify({
    ...report,
    history: {
      truncated: detail.truncated,
      originalPositionCount: detail.positionSampling.originalPositionCount,
      returnedPositionCount: detail.positionSampling.returnedPositionCount,
    },
  }, null, 2) + "\n");
}

main().catch((error) => {
  const message = error instanceof HistoryDatabaseUnavailableError
    ? "History database unavailable"
    : error instanceof Error ? error.message : String(error);
  process.stderr.write(`[intelligence-replay] ${message}\n`);
  process.exitCode = 1;
});
