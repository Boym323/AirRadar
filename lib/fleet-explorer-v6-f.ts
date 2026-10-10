import type { FleetAircraft } from "@/lib/server/fleet";
export type FleetFilterMode = "all" | "live" | "offline";
export type FleetSort = "lastObserved" | "observations30d" | "registration";
export interface FleetSearchOptions { query: string; filter: FleetFilterMode; sort: FleetSort; }

export function buildFleetSummary(items: readonly FleetAircraft[]) {
  const live = items.reduce((count, item) => count + Number(item.live), 0);
  const observations30d = items.reduce((count, item) => count + (Number.isFinite(item.observations30d) ? Math.max(0, item.observations30d) : 0), 0);
  return { total: items.length, live, offline: items.length - live, observations30d };
}

/** Derived only from the existing bounded fleet response; never queries the server. */
export function filterFleetAircraft(items: readonly FleetAircraft[], options: FleetSearchOptions): FleetAircraft[] {
  const query = options.query.trim().toLocaleUpperCase().slice(0, 100);
  const filtered = items.filter((item) => {
    if (options.filter === "live" && !item.live) return false;
    if (options.filter === "offline" && item.live) return false;
    if (!query) return true;
    return [item.icaoHex, item.registration, item.callsign, item.operator, item.aircraftType, item.model]
      .some((value) => value?.toLocaleUpperCase().includes(query));
  });
  return filtered.sort((a, b) => {
    if (options.sort === "registration") return (a.registration ?? a.icaoHex).localeCompare(b.registration ?? b.icaoHex) || a.icaoHex.localeCompare(b.icaoHex);
    if (options.sort === "observations30d") return b.observations30d - a.observations30d || a.icaoHex.localeCompare(b.icaoHex);
    const dateA = a.lastObservedAt ? Date.parse(a.lastObservedAt) : -Infinity;
    const dateB = b.lastObservedAt ? Date.parse(b.lastObservedAt) : -Infinity;
    return (Number.isFinite(dateB) ? dateB : -Infinity) - (Number.isFinite(dateA) ? dateA : -Infinity) || a.icaoHex.localeCompare(b.icaoHex);
  });
}
