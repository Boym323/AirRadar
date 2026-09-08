import "temporal-polyfill/full/global";
import type { AircraftView } from "@/lib/aircraft/types";
import { getPrisma } from "@/lib/server/db";
import { listWatchlistRules } from "@/lib/server/watchlist-store";
import type { AlertRule } from "@/lib/server/alert-config";

export const FLEET_MAX_AIRCRAFT = 100;

export interface FleetRouteCount {
  origin: string;
  destination: string;
  count: number;
}

export interface FleetAirportCount {
  code: string;
  count: number;
}

export interface FleetAircraft {
  icaoHex: string;
  registration: string | null;
  aircraftType: string | null;
  operator: string | null;
  manufacturer: string | null;
  model: string | null;
  live: boolean;
  callsign: string | null;
  lastObservedAt: string | null;
  observations7d: number;
  observations30d: number;
  topRoutes: FleetRouteCount[];
  topAirports: FleetAirportCount[];
  watchlistEnabled: boolean;
}

export interface FleetResponse {
  aircraft: FleetAircraft[];
  ignoredRuleCount: number;
  source: "postgres" | "memory";
}

interface FleetFlightRow {
  aircraftId: number;
  startTime: Temporal.Instant | Date;
  lastSeenAt: Temporal.Instant | Date;
  origin: string | null;
  destination: string | null;
}

interface FleetAircraftRow {
  id: number;
  icaoHex: string;
  registration: string | null;
  aircraftType: string | null;
  operator: string | null;
  manufacturer: string | null;
  model: string | null;
  updatedAt: Temporal.Instant | Date;
}

function asDate(value: Temporal.Instant | Date): Date {
  return value instanceof Date ? value : new Date(value.epochMilliseconds);
}

function iso(value: Date | null): string | null {
  return value && Number.isFinite(value.getTime()) ? value.toISOString() : null;
}

function clean(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

function normalizedHex(value: string): string {
  return value.trim().toUpperCase();
}

export function selectFleetIdentityRules(rules: ReadonlyArray<Pick<AlertRule, "type" | "value" | "enabled">>): {
  identities: string[];
  enabledByHex: Map<string, boolean>;
  ignoredRuleCount: number;
} {
  const identityRules = rules.filter((rule) => rule.type === "icaoHex");
  const identities = [...new Set(identityRules.map((rule) => normalizedHex(rule.value)).filter(Boolean))].slice(0, FLEET_MAX_AIRCRAFT);
  const enabledByHex = new Map<string, boolean>();
  for (const rule of identityRules) {
    const hex = normalizedHex(rule.value);
    if (!identities.includes(hex)) continue;
    enabledByHex.set(hex, (enabledByHex.get(hex) ?? false) || rule.enabled);
  }
  return { identities, enabledByHex, ignoredRuleCount: rules.length - identityRules.length };
}

function addCount(map: Map<string, number>, value: string | null): void {
  const normalized = clean(value)?.toUpperCase();
  if (normalized) map.set(normalized, (map.get(normalized) ?? 0) + 1);
}

function sortedCounts(map: Map<string, number>): Array<{ key: string; count: number }> {
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, 5);
}

function emptyFleetAircraft(icaoHex: string, live: AircraftView | null, watchlistEnabled: boolean): FleetAircraft {
  const metadata = live?.enrichment?.metadata;
  return {
    icaoHex,
    registration: live?.registration ?? metadata?.registration ?? null,
    aircraftType: live?.aircraftType ?? metadata?.icaoTypeCode ?? null,
    operator: metadata?.operator ?? null,
    manufacturer: metadata?.manufacturer ?? null,
    model: live?.aircraftDescription ?? metadata?.aircraftDescription ?? null,
    live: Boolean(live),
    callsign: live?.callsign ?? null,
    lastObservedAt: live?.lastSeen ?? null,
    observations7d: 0,
    observations30d: 0,
    topRoutes: [],
    topAirports: [],
    watchlistEnabled,
  };
}

function latestDate(current: Date | null, candidate: Date | null): Date | null {
  if (!candidate || !Number.isFinite(candidate.getTime())) return current;
  return !current || candidate > current ? candidate : current;
}

/**
 * Builds the concrete-aircraft view from ICAO watchlist rules. Pattern,
 * callsign, type, and airline rules are intentionally excluded: they do not
 * identify one aircraft and must not be presented as Fleet identities.
 *
 * The history read is one time-bounded Flight query for all identities. It is
 * deliberately not a per-aircraft detail loop.
 */
export async function getFleetSnapshot(
  liveAircraft: AircraftView[],
  now = new Date(),
): Promise<FleetResponse> {
  const rules = await listWatchlistRules();
  const { identities, enabledByHex, ignoredRuleCount } = selectFleetIdentityRules(rules);

  const liveByHex = new Map(liveAircraft.map((aircraft) => [normalizedHex(aircraft.icaoHex), aircraft]));
  const fallbackRows = identities.map((hex) => emptyFleetAircraft(hex, liveByHex.get(hex) ?? null, enabledByHex.get(hex) ?? false));
  if (!identities.length) {
    return { aircraft: [], ignoredRuleCount, source: "memory" };
  }

  const database = getPrisma();
  if (!database) {
    return {
      aircraft: fallbackRows,
      ignoredRuleCount,
      source: "memory",
    };
  }

  try {
    const schema = database.orm.public;
    const aircraftRows = await schema.Aircraft
      .where((aircraft) => aircraft.icaoHex.in(identities))
      .all() as FleetAircraftRow[];
    const rowsByHex = new Map(aircraftRows.map((aircraft) => [normalizedHex(aircraft.icaoHex), aircraft]));
    const ids = aircraftRows.map((aircraft) => aircraft.id);
    const from30d = new Date(now.getTime() - 30 * 24 * 60 * 60_000);
    const from7d = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
    const from30Instant = Temporal.Instant.fromEpochMilliseconds(from30d.getTime());
    const toInstant = Temporal.Instant.fromEpochMilliseconds(now.getTime());
    const flights = ids.length === 0 ? [] : await schema.Flight
      .where((flight) => flight.aircraftId.in(ids))
      .where((flight) => flight.startTime.gte(from30Instant))
      .where((flight) => flight.startTime.lt(toInstant))
      .select("aircraftId", "startTime", "lastSeenAt", "origin", "destination")
      .all() as FleetFlightRow[];

    const flightsByAircraft = new Map<number, FleetFlightRow[]>();
    for (const flight of flights) {
      const list = flightsByAircraft.get(flight.aircraftId) ?? [];
      list.push(flight);
      flightsByAircraft.set(flight.aircraftId, list);
    }

    const result = identities.map((hex) => {
      const live = liveByHex.get(hex) ?? null;
      const row = rowsByHex.get(hex);
      const base = emptyFleetAircraft(hex, live, enabledByHex.get(hex) ?? false);
      if (!row) return base;
      const metadata = live?.enrichment?.metadata;
      const rowFlights = flightsByAircraft.get(row.id) ?? [];
      const airports = new Map<string, number>();
      const routes = new Map<string, FleetRouteCount>();
      let lastObserved = latestDate(asDate(row.updatedAt), live?.lastSeen ? new Date(live.lastSeen) : null);
      let observations7d = 0;

      for (const flight of rowFlights) {
        const startTime = asDate(flight.startTime);
        if (startTime >= from7d) observations7d += 1;
        lastObserved = latestDate(lastObserved, asDate(flight.lastSeenAt));
        const origin = clean(flight.origin)?.toUpperCase() ?? null;
        const destination = clean(flight.destination)?.toUpperCase() ?? null;
        addCount(airports, origin);
        addCount(airports, destination);
        if (origin && destination) {
          const key = `${origin}:${destination}`;
          const route = routes.get(key);
          if (route) route.count += 1;
          else routes.set(key, { origin, destination, count: 1 });
        }
      }

      return {
        ...base,
        registration: live?.registration ?? metadata?.registration ?? row.registration,
        aircraftType: live?.aircraftType ?? metadata?.icaoTypeCode ?? row.aircraftType,
        operator: metadata?.operator ?? row.operator,
        manufacturer: metadata?.manufacturer ?? row.manufacturer,
        model: live?.aircraftDescription ?? metadata?.aircraftDescription ?? row.model,
        lastObservedAt: iso(lastObserved),
        observations7d,
        observations30d: rowFlights.length,
        topRoutes: [...routes.values()]
          .sort((a, b) => b.count - a.count || a.origin.localeCompare(b.origin) || a.destination.localeCompare(b.destination))
          .slice(0, 3),
        topAirports: sortedCounts(airports).map(({ key, count }) => ({ code: key, count })),
      } satisfies FleetAircraft;
    });

    return { aircraft: result, ignoredRuleCount, source: "postgres" };
  } catch {
    return { aircraft: fallbackRows, ignoredRuleCount, source: "memory" };
  }
}
