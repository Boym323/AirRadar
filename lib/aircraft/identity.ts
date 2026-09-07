const AIRCRAFT_IDENTIFIER_PATTERN = /^~?[0-9A-F]{6}$/i;

/**
 * readsb uses a leading `~` for non-ICAO addresses while keeping the six
 * hexadecimal address digits. Keep that identifier stable across live state,
 * history URLs and persistence, but reject arbitrary provider strings.
 */
export function normalizeAircraftIdentifier(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return AIRCRAFT_IDENTIFIER_PATTERN.test(normalized) ? normalized : null;
}
