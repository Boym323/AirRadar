import { getHistoryFlight, HistoryDatabaseUnavailableError } from "@/lib/server/history";
import { resolveAirport } from "@/lib/server/airport-resolver";
import { getAirportInfrastructure } from "@/lib/server/airport-infrastructure";
import { replayFlightIntelligence } from "@/lib/intelligence/replay";
import { summarizeFlightIntelligenceReplay } from "@/lib/intelligence/replay-metrics";
import type { Airport } from "@/lib/airports/types";
import type { AirportRunway } from "@/lib/airports/infrastructure";

function flightIds(args: string[]): number[] {
  const ids = args
    .flatMap((value) => value.split(","))
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isSafeInteger(value) && value > 0);
  return [...new Set(ids)];
}

async function replay(flightId: number) {
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

  return replayFlightIntelligence(detail, { airports, runwaysByAirport });
}

async function main() {
  const ids = flightIds(process.argv.slice(2));
  if (!ids.length) throw new Error("Usage: npm run intelligence:quality -- <flightId> [flightId ...]");

  const reports = [];
  for (const id of ids) reports.push(await replay(id));
  process.stdout.write(JSON.stringify({
    generatedAt: new Date().toISOString(),
    flightIds: ids,
    summary: summarizeFlightIntelligenceReplay(reports),
    flights: reports.map((report) => ({
      flightId: report.flightId,
      icaoHex: report.icaoHex,
      positions: report.positions,
      inputQuality: report.inputQuality,
      metrics: report.metrics,
      falsePositives: report.falsePositives,
      falseNegatives: report.falseNegatives,
      matches: report.matches,
    })),
  }, null, 2) + "\n");
}

main().catch((error) => {
  const message = error instanceof HistoryDatabaseUnavailableError
    ? "History database unavailable"
    : error instanceof Error ? error.message : String(error);
  process.stderr.write(`[intelligence-quality] ${message}\n`);
  process.exitCode = 1;
});
