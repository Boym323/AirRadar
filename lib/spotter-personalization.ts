import type { SpotterLogbookState } from "@/lib/spotter-logbook";

export const MY_SKY_FAVORITES_STORAGE_KEY = "airradar.my-sky-favorites.v1";
export const MY_SKY_FAVORITES_VERSION = 1;
export const MY_SKY_FAVORITES_MAX = 32;
export const MY_SKY_FAVORITES_CHANGED_EVENT = "airradar:my-sky-favorites-changed";

export interface MySkyFavorites {
  version: 1;
  icaoHexes: string[];
}

export interface MySkyPersonalSignal {
  favorite: boolean;
  sightings: number;
  lastSeenAt: string | null;
}

const empty = (): MySkyFavorites => ({ version: 1, icaoHexes: [] });

export function normalizeMySkyIcao(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return /^[0-9A-F]{6}$/.test(normalized) ? normalized : null;
}

export function parseMySkyFavorites(raw: string | null): MySkyFavorites {
  if (!raw || raw.length > 8_192) return empty();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return empty();
    const value = parsed as { version?: unknown; icaoHexes?: unknown };
    if (value.version !== MY_SKY_FAVORITES_VERSION || !Array.isArray(value.icaoHexes)) return empty();
    const unique = new Set<string>();
    for (const candidate of value.icaoHexes.slice(0, 256)) {
      const hex = normalizeMySkyIcao(candidate);
      if (hex) unique.add(hex);
      if (unique.size >= MY_SKY_FAVORITES_MAX) break;
    }
    return { version: 1, icaoHexes: [...unique] };
  } catch {
    return empty();
  }
}

export function serializeMySkyFavorites(value: MySkyFavorites): string {
  return JSON.stringify(parseMySkyFavorites(JSON.stringify(value)));
}

export function toggleMySkyFavorite(value: MySkyFavorites, icaoHex: string): MySkyFavorites {
  const hex = normalizeMySkyIcao(icaoHex);
  if (!hex) return value;
  const current = parseMySkyFavorites(JSON.stringify(value)).icaoHexes;
  return { version: 1, icaoHexes: current.includes(hex)
    ? current.filter(item => item !== hex)
    : [hex, ...current].slice(0, MY_SKY_FAVORITES_MAX) };
}

// O(entries + favorites) per snapshot; prevents scanning the 500-entry
// personal logbook once for every aircraft in a busy LOCAL stream.
export function indexMySkyPersonalSignals(
  favorites: MySkyFavorites,
  logbook: SpotterLogbookState,
): ReadonlyMap<string, MySkyPersonalSignal> {
  const indexed = new Map<string, MySkyPersonalSignal>();
  for (const candidate of favorites.icaoHexes) {
    const hex = normalizeMySkyIcao(candidate);
    if (hex) indexed.set(hex, { favorite: true, sightings: 0, lastSeenAt: null });
  }
  for (const entry of logbook.entries) {
    const hex = normalizeMySkyIcao(entry.icaoHex);
    if (!hex) continue;
    const existing = indexed.get(hex) ?? { favorite: false, sightings: 0, lastSeenAt: null };
    const at = Date.parse(entry.observedAt);
    indexed.set(hex, {
      favorite: existing.favorite,
      sightings: existing.sightings + 1,
      lastSeenAt: Number.isFinite(at) && (existing.lastSeenAt === null || at > Date.parse(existing.lastSeenAt))
        ? new Date(at).toISOString() : existing.lastSeenAt,
    });
  }
  return indexed;
}

export function mySkyPersonalSignal(
  icaoHex: string,
  favorites: MySkyFavorites,
  logbook: SpotterLogbookState,
): MySkyPersonalSignal {
  const hex = normalizeMySkyIcao(icaoHex);
  return (hex ? indexMySkyPersonalSignals(favorites, logbook).get(hex) : null)
    ?? { favorite: false, sightings: 0, lastSeenAt: null };
}
