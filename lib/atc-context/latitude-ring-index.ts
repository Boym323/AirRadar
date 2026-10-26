/**
 * CPU-only scanline accelerator for immutable ATC polygon rings.
 *
 * Every segment appears in each quarter-degree latitude band intersecting its
 * y-span, expanded by the exact boundary epsilon used by geometry.ts.
 * Mutable or invalid rings are never indexed (no stale/misleading geometry).
 * Weak keys permit prepared datasets to be reclaimed on ATC data refresh.
 */
import type { LonLat } from "./geometry";

const MIN_RING_POINTS = 2048;
const BAND_SCALE = 4; // 0.25 degree bands
const BOUNDARY_EPSILON = 1e-9;
const MAX_BAND_REFERENCES = 600_000;
const MAX_EDGE_BANDS = 256;
const CHUNK_SIZE = 1024;

type RingScanIndex = ReadonlyMap<number, Uint32Array>;
const cached = new WeakMap<LonLat[], RingScanIndex | null>();
const EMPTY_EDGES = new Uint32Array(0);

class IndexBuilder {
  readonly buckets = new Map<number, number[]>();
  private references = 0;
  constructor(private readonly ring: LonLat[]) {}

  append(start: number, stop: number): boolean {
    const count = this.ring.length;
    for (let i = start; i < stop; i++) {
      const a = this.ring[(i + count - 1) % count];
      const b = this.ring[i];
      if (!a || !b || !Object.isFrozen(a) || !Object.isFrozen(b)
        || !Number.isFinite(a[0]) || !Number.isFinite(a[1])
        || !Number.isFinite(b[0]) || !Number.isFinite(b[1])) return false;
      const low = Math.floor((Math.min(a[1], b[1]) - BOUNDARY_EPSILON) * BAND_SCALE);
      const high = Math.floor((Math.max(a[1], b[1]) + BOUNDARY_EPSILON) * BAND_SCALE);
      if (high - low + 1 > MAX_EDGE_BANDS || this.references + high - low + 1 > MAX_BAND_REFERENCES) return false;
      for (let band = low; band <= high; band++) {
        const indices = this.buckets.get(band);
        if (indices) indices.push(i);
        else this.buckets.set(band, [i]);
      }
      this.references += high - low + 1;
    }
    return true;
  }

  finish(): RingScanIndex {
    const result = new Map<number, Uint32Array>();
    for (const [band, indices] of this.buckets) result.set(band, Uint32Array.from(indices));
    return result;
  }
}

function eligible(ring: LonLat[]): boolean {
  return ring.length >= MIN_RING_POINTS && Object.isFrozen(ring);
}

/** Lazy index for the synchronous prepared-ATC API. The first call pays setup cost. */
export function indexedEdgesForPoint(ring: LonLat[], latitude: number): Uint32Array | null {
  if (!eligible(ring) || !Number.isFinite(latitude)) return null;
  let index = cached.get(ring);
  if (index === undefined) {
    const builder = new IndexBuilder(ring);
    let ok = true;
    for (let offset = 0; offset < ring.length; offset += CHUNK_SIZE) {
      if (!builder.append(offset, Math.min(offset + CHUNK_SIZE, ring.length))) { ok = false; break; }
    }
    index = ok ? builder.finish() : null;
    cached.set(ring, index);
  }
  // An empty band is a definitive outside result, represented as 0 edges.
  return index?.get(Math.floor(latitude * BAND_SCALE)) ?? (index ? EMPTY_EDGES : null);
}

/**
 * Nonblocking index construction for the live async dataset-preparation lane.
 * Runs only after ownership cloning and deep-freeze; never mutates source rings.
 */
export async function prewarmFrozenAtcRing(ring: LonLat[]): Promise<boolean> {
  if (!eligible(ring)) return false;
  const previous = cached.get(ring);
  if (previous !== undefined) return previous !== null;
  const builder = new IndexBuilder(ring);
  for (let offset = 0; offset < ring.length; offset += CHUNK_SIZE) {
    if (!builder.append(offset, Math.min(offset + CHUNK_SIZE, ring.length))) {
      cached.set(ring, null);
      return false;
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  cached.set(ring, builder.finish());
  return true;
}
