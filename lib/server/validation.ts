const ICAO_HEX_PATTERN = /^[0-9A-F]{6}$/i;

export function normalizeIcaoHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return ICAO_HEX_PATTERN.test(normalized) ? normalized : null;
}
