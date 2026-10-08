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

export function mySkyPersonalSignal(
  icaoHex: string,
  favorites: MySkyFavorites,
  logbook: SpotterLogbookState,
): MySkyPersonalSignal {
  const hex = normalizeMySkyIcao(icaoHex);
  if (!hex) return { favorite: false, sightings: 0, lastSeenAt: null };
  let sightings = 0;
  let latestMs = Number.NEGATIVE_INFINITY;
  for (const item of logbook.entries) {
    if (item.icaoHex.toUpperCase() !== hex) continue;
    sightings++;
    const ms = Date.parse(item.observedAt);
    if (Number.isFinite(ms) && ms > latestMs) latestMs = ms;
  }
  return {
    favorite: favorites.icaoHexes.includes(hex),
    sightings,
    lastSeenAt: Number.isFinite(latestMs) ? new Date(latestMs).toISOString() : null,
  };
}
