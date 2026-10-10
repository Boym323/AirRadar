/** Browser-local V6-A selection; never changes aircraft identity, SSE, or server persistence. */
export const MULTI_AIRCRAFT_LIMIT = 10;
export function addMultiAircraft(current: readonly string[], hex: string, limit = MULTI_AIRCRAFT_LIMIT): string[] {
  const normalized = hex.trim().toUpperCase();
  if (!/^[0-9A-F]{6}$/.test(normalized) || current.includes(normalized) || current.length >= limit) return [...current];
  return [...current, normalized];
}
export function removeMultiAircraft(current: readonly string[], hex: string): string[] {
  return current.filter((value) => value !== hex.toUpperCase());
}
