import "temporal-polyfill/full/global";
import type {
  AircraftView,
  LogbookInterestingAircraft,
  LogbookInterestingReason,
  LogbookSummaryResponse,
  RadarStats,
  ReceiverReceptionRecordsResponse,
} from "@/lib/aircraft/types";
import { matchesAircraftRule } from "@/lib/aircraft/watchlist";
import { getAppTimezone } from "@/lib/server/config";
import { historyRangeBounds } from "@/lib/server/history";
import { getPrisma } from "@/lib/server/db";
import { classifyAircraftLogbook } from "@/lib/server/logbook";
import type { AlertRule } from "@/lib/server/alert-config";

export interface LogbookSummaryAircraftEvidence {
  icaoHex: string;
  firstObservedAt: string;
  flightCount: number;
  returningGapDays: number | null;
}

interface SummaryFlightRow {
  aircraftId: number;
  startTime: Temporal.Instant | Date;
  lastSeenAt: Temporal.Instant | Date;
}

interface SummaryAircraftRow {
  id: number;
  icaoHex: string;
}

function asDate(value: Temporal.Instant | Date): Date {
  return value instanceof Date ? value : new Date(value.epochMilliseconds);
}

function validDate(value: Date): Date | null {
  return Number.isFinite(value.getTime()) ? value : null;
}

function enabledRules(rules: AlertRule[]): AlertRule[] {
  return rules.filter((rule) => rule.enabled);
}

export function buildLogbookSummary(options: {
  liveAircraft: AircraftView[];
  stats: Pick<RadarStats, "currentAircraft" | "uniqueAircraftToday">;
  rules: AlertRule[];
  evidence: LogbookSummaryAircraftEvidence[];
  reception: ReceiverReceptionRecordsResponse;
  source: LogbookSummaryResponse["source"];
  now?: Date;
}): LogbookSummaryResponse {
  const now = options.now ?? new Date();
  const rules = enabledRules(options.rules);
  const statusByHex = new Map<string, LogbookInterestingAircraft>();
  for (const item of options.evidence) {
    const status = classifyAircraftLogbook(item, now, getAppTimezone());
    if (!status.labels.length) continue;
    statusByHex.set(item.icaoHex, {
      icaoHex: item.icaoHex,
      labels: status.labels,
      reasons: status.labels as LogbookInterestingReason[],
      flightCount: item.flightCount,
      returningGapDays: status.returningGapDays,
      isLive: false,
      callsign: null,
      registration: null,
      aircraftType: null,
      distanceKm: null,
    });
  }
  for (const aircraft of options.liveAircraft) {
    const existing = statusByHex.get(aircraft.icaoHex);
    const reasons = new Set<LogbookInterestingReason>(existing?.reasons ?? []);
    if (rules.some((rule) => matchesAircraftRule(aircraft, rule))) reasons.add("watchlisted");
    if (aircraft.emergency) reasons.add("emergency");
    const record = options.reception.today;
    if (record && aircraft.distanceKm !== null && aircraft.distanceKm >= record.distanceKm * 0.9) reasons.add("record");
    if (!reasons.size) continue;
    const labels = existing?.labels ?? [];
    statusByHex.set(aircraft.icaoHex, {
      icaoHex: aircraft.icaoHex,
      labels,
      reasons: [...reasons],
      flightCount: existing?.flightCount ?? 0,
      returningGapDays: existing?.returningGapDays ?? null,
      isLive: true,
      callsign: aircraft.callsign,
      registration: aircraft.registration ?? aircraft.enrichment?.metadata?.registration ?? null,
      aircraftType: aircraft.enrichment?.metadata?.icaoTypeCode ?? aircraft.aircraftType,
      distanceKm: aircraft.distanceKm,
    });
  }
  const statuses = [...statusByHex.values()];
  for (const item of statuses) {
    const live = options.liveAircraft.find((aircraft) => aircraft.icaoHex === item.icaoHex);
    if (live) {
      item.isLive = true;
      item.callsign = live.callsign;
      item.registration = live.registration ?? live.enrichment?.metadata?.registration ?? null;
      item.aircraftType = live.enrichment?.metadata?.icaoTypeCode ?? live.aircraftType;
      item.distanceKm = live.distanceKm;
    }
  }
  const isInteresting = (item: LogbookInterestingAircraft): boolean => item.reasons.length > 0;
  const score = (item: LogbookInterestingAircraft): number => item.reasons.reduce((total, reason) => total + (reason === "new" ? 10 : reason === "emergency" ? 9 : reason === "watchlisted" ? 6 : reason === "record" ? 5 : reason === "returning" ? 2 : 1), 0);
  const interestingAircraft = statuses
    .filter(isInteresting)
    .sort((a, b) => score(b) - score(a) || Number(b.isLive) - Number(a.isLive) || b.flightCount - a.flightCount || a.icaoHex.localeCompare(b.icaoHex))
    .slice(0, 8);

  return {
    source: options.source,
    generatedAt: now.toISOString(),
    liveAircraft: options.stats.currentAircraft,
    uniqueAircraftToday: options.stats.uniqueAircraftToday,
    newAircraftToday: statuses.filter((item) => item.labels.includes("new")).length,
    rareAircraftToday: statuses.filter((item) => item.labels.includes("rare")).length,
    returningAircraftToday: statuses.filter((item) => item.labels.includes("returning")).length,
    watchlistedLiveAircraft: options.liveAircraft.filter((aircraft) => rules.some((rule) => matchesAircraftRule(aircraft, rule))).length,
    interestingAircraft,
    todayReceptionRecord: options.reception.today,
    lifetimeReceptionRecord: options.reception.lifetime,
  };
}

/**
 * Builds a compact dashboard summary with one bounded current-day query and
 * one batched lifetime query for identities observed today. It is called by
 * a page-scoped fetch, never from the live SSE snapshot path.
 */
export async function getLogbookSummary(
  liveAircraft: AircraftView[],
  stats: Pick<RadarStats, "currentAircraft" | "uniqueAircraftToday">,
  rules: AlertRule[],
  reception: ReceiverReceptionRecordsResponse,
  now = new Date(),
): Promise<LogbookSummaryResponse> {
  const database = getPrisma();
  const memorySource: LogbookSummaryResponse["source"] = database
    ? reception.source === "unavailable" ? "unavailable" : "postgres"
    : "memory";
  if (!database) return buildLogbookSummary({ liveAircraft, stats, rules, evidence: [], reception, source: memorySource, now });

  try {
    const bounds = historyRangeBounds("today", now);
    const from = Temporal.Instant.fromEpochMilliseconds(bounds.from.getTime());
    const to = Temporal.Instant.fromEpochMilliseconds(bounds.to.getTime());
    const todayFlights = await database.orm.public.Flight
      .where((flight) => flight.startTime.gte(from))
      .where((flight) => flight.startTime.lt(to))
      .select("aircraftId", "startTime", "lastSeenAt")
      .all() as SummaryFlightRow[];
    const aircraftIds = [...new Set(todayFlights.map((flight) => flight.aircraftId))];
    if (!aircraftIds.length) return buildLogbookSummary({ liveAircraft, stats, rules, evidence: [], reception, source: memorySource, now });

    const historyFlightsQuery = database.orm.public.Flight
        .where((flight) => flight.aircraftId.in(aircraftIds))
        .select("aircraftId", "startTime", "lastSeenAt")
        .all();
    const aircraftRowsQuery = database.orm.public.Aircraft
        .where((aircraft) => aircraft.id.in(aircraftIds))
        .select("id", "icaoHex")
        .all();
    const [historyFlightsResult, aircraftRowsResult] = await Promise.all([historyFlightsQuery, aircraftRowsQuery]);
    const historyFlights = historyFlightsResult as SummaryFlightRow[];
    const aircraftRows = aircraftRowsResult as SummaryAircraftRow[];
    const hexByAircraftId = new Map(aircraftRows.map((aircraft) => [aircraft.id, aircraft.icaoHex.trim().toUpperCase()]));
    const flightsByAircraft = new Map<number, SummaryFlightRow[]>();
    for (const flight of historyFlights) {
      const list = flightsByAircraft.get(flight.aircraftId) ?? [];
      list.push(flight);
      flightsByAircraft.set(flight.aircraftId, list);
    }

    const evidence: LogbookSummaryAircraftEvidence[] = [];
    for (const [aircraftId, flights] of flightsByAircraft) {
      const icaoHex = hexByAircraftId.get(aircraftId);
      if (!icaoHex) continue;
      const ordered = flights
        .map((flight) => ({ ...flight, start: validDate(asDate(flight.startTime)), lastSeen: validDate(asDate(flight.lastSeenAt)) }))
        .filter((flight): flight is typeof flight & { start: Date; lastSeen: Date } => Boolean(flight.start && flight.lastSeen))
        .sort((a, b) => a.start.getTime() - b.start.getTime());
      const first = ordered[0];
      if (!first) continue;
      const latest = ordered[ordered.length - 1];
      const previous = ordered[ordered.length - 2];
      const gapMs = previous ? latest.start.getTime() - previous.lastSeen.getTime() : -1;
      evidence.push({
        icaoHex,
        firstObservedAt: first.start.toISOString(),
        flightCount: ordered.length,
        returningGapDays: gapMs >= 0 ? Math.floor(gapMs / (24 * 60 * 60 * 1000)) : null,
      });
    }
    return buildLogbookSummary({ liveAircraft, stats, rules, evidence, reception, source: memorySource, now });
  } catch (error) {
    console.error("AirRadar logbook summary load failed", error);
    return buildLogbookSummary({ liveAircraft, stats, rules, evidence: [], reception, source: "unavailable", now });
  }
}
