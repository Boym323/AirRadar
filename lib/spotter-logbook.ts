import type { AircraftView } from "@/lib/aircraft/types";
import type { SpotterSkyStory } from "@/lib/spotter-story";

export const SPOTTER_LOGBOOK_STORAGE_KEY = "airradar.spotter-logbook.v1";
export const SPOTTER_LOGBOOK_MAX_ENTRIES = 500;

export interface SpotterLogbookEntry {
  id: string;
  observedAt: string;
  icaoHex: string;
  callsign: string | null;
  registration: string | null;
  aircraftType: string | null;
  operator: string | null;
  origin: string | null;
  destination: string | null;
  closestDistanceKm: number | null;
  altitudeFt: number | null;
  interestScore: number;
}

export interface SpotterLogbookState {
  version: 1;
  entries: SpotterLogbookEntry[];
}

export interface SpotterLogbookStats {
  sightings: number;
  uniqueAircraft: number;
  uniqueTypes: number;
  uniqueOperators: number;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function cleanString(value: unknown, max = 64): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function normalizeEntry(value: unknown): SpotterLogbookEntry | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = cleanString(row.id, 120);
  const observedAt = cleanString(row.observedAt, 40);
  const icaoHex = cleanString(row.icaoHex, 16)?.toUpperCase() ?? null;
  if (!id || !observedAt || !icaoHex || !Number.isFinite(Date.parse(observedAt))) return null;
  return {
    id,
    observedAt: new Date(observedAt).toISOString(),
    icaoHex,
    callsign: cleanString(row.callsign),
    registration: cleanString(row.registration),
    aircraftType: cleanString(row.aircraftType),
    operator: cleanString(row.operator, 100),
    origin: cleanString(row.origin, 8),
    destination: cleanString(row.destination, 8),
    closestDistanceKm: finiteOrNull(row.closestDistanceKm),
    altitudeFt: finiteOrNull(row.altitudeFt),
    interestScore: typeof row.interestScore === "number" && Number.isFinite(row.interestScore)
      ? Math.max(0, Math.min(100, Math.round(row.interestScore)))
      : 0,
  };
}

export function parseSpotterLogbook(raw: string | null): SpotterLogbookState {
  if (!raw) return { version: 1, entries: [] };
  try {
    const parsed = JSON.parse(raw) as { version?: unknown; entries?: unknown };
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) return { version: 1, entries: [] };
    const entries = parsed.entries
      .map(normalizeEntry)
      .filter((entry): entry is SpotterLogbookEntry => entry !== null)
      .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))
      .slice(0, SPOTTER_LOGBOOK_MAX_ENTRIES);
    return { version: 1, entries };
  } catch {
    return { version: 1, entries: [] };
  }
}

export function serializeSpotterLogbook(state: SpotterLogbookState): string {
  return JSON.stringify({
    version: 1,
    entries: state.entries.slice(0, SPOTTER_LOGBOOK_MAX_ENTRIES),
  });
}

export function createSpotterLogbookEntry(
  aircraft: AircraftView,
  story: SpotterSkyStory,
  observedAt = new Date().toISOString(),
): SpotterLogbookEntry {
  const minuteBucket = Math.floor(Date.parse(observedAt) / 60_000);
  return {
    id: `${aircraft.icaoHex.toUpperCase()}:${minuteBucket}`,
    observedAt: new Date(observedAt).toISOString(),
    icaoHex: aircraft.icaoHex.toUpperCase(),
    callsign: aircraft.callsign ?? null,
    registration: story.registration,
    aircraftType: story.aircraftType,
    operator: story.operator,
    origin: story.origin,
    destination: story.destination,
    closestDistanceKm: story.closestApproachKm,
    altitudeFt: story.altitudeFt,
    interestScore: story.interest.score,
  };
}

export function addSpotterLogbookEntry(
  state: SpotterLogbookState,
  entry: SpotterLogbookEntry,
): SpotterLogbookState {
  const entries = [entry, ...state.entries.filter((item) => item.id !== entry.id)]
    .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))
    .slice(0, SPOTTER_LOGBOOK_MAX_ENTRIES);
  return { version: 1, entries };
}

export function spotterLogbookStats(state: SpotterLogbookState): SpotterLogbookStats {
  const unique = <T>(values: T[]) => new Set(values).size;
  return {
    sightings: state.entries.length,
    uniqueAircraft: unique(state.entries.map((entry) => entry.icaoHex)),
    uniqueTypes: unique(state.entries.map((entry) => entry.aircraftType).filter((value): value is string => Boolean(value))),
    uniqueOperators: unique(state.entries.map((entry) => entry.operator).filter((value): value is string => Boolean(value))),
  };
}
