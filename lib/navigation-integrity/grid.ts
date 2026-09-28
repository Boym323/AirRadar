export const NAVIGATION_INTEGRITY_GRID_DEGREES = 0.2;

export function cellCoordinate(value: number): number {
  return Math.floor(value / NAVIGATION_INTEGRITY_GRID_DEGREES);
}

export function cellKey(lat: number, lon: number, altitudeBand: number): string {
  return `${cellCoordinate(lat)}:${cellCoordinate(lon)}:${altitudeBand}`;
}

export function altitudeBand(altitudeFt: number | null): number {
  if (altitudeFt === null || !Number.isFinite(altitudeFt)) return -1;
  if (altitudeFt < 10_000) return 0;
  if (altitudeFt < 20_000) return 1;
  if (altitudeFt < 30_000) return 2;
  if (altitudeFt < 40_000) return 3;
  return 4;
}

export function parseCellKey(value: string): { latCell: number; lonCell: number; altitudeBand: number } | null {
  const parts = value.split(":").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) return null;
  return { latCell: parts[0]!, lonCell: parts[1]!, altitudeBand: parts[2]! };
}

export function adjacentCellKeys(key: string): string[] {
  const parsed = parseCellKey(key);
  if (!parsed) return [];
  const result: string[] = [];
  for (let lat = -1; lat <= 1; lat += 1) {
    for (let lon = -1; lon <= 1; lon += 1) {
      if (lat === 0 && lon === 0) continue;
      result.push(`${parsed.latCell + lat}:${parsed.lonCell + lon}:${parsed.altitudeBand}`);
    }
  }
  return result;
}

export function connectedCellGroups(keys: Iterable<string>): string[][] {
  const pending = new Set(keys);
  const groups: string[][] = [];
  while (pending.size) {
    const first = pending.values().next().value as string;
    pending.delete(first);
    const group = [first];
    const queue = [first];
    while (queue.length) {
      const current = queue.shift()!;
      for (const adjacent of adjacentCellKeys(current)) {
        if (!pending.delete(adjacent)) continue;
        group.push(adjacent);
        queue.push(adjacent);
      }
    }
    groups.push(group.sort());
  }
  return groups.sort((a, b) => a[0]!.localeCompare(b[0]!));
}
