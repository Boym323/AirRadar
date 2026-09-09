/** Small TTL cache with least-recently-used eviction. */
export class BoundedTtlLruCache<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>();
  private currentWeight = 0;

  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs: number,
    private readonly maxWeight = Number.POSITIVE_INFINITY,
    private readonly weigh: (value: T) => number = () => 1,
  ) {}

  private weight(value: T): number {
    const weight = this.weigh(value);
    return Number.isFinite(weight) && weight > 0 ? Math.ceil(weight) : 1;
  }

  private delete(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.currentWeight -= this.weight(entry.value);
    this.entries.delete(key);
  }

  get(key: string, now = Date.now()): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) {
      this.delete(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, now = Date.now()): void {
    this.delete(key);
    const valueWeight = this.weight(value);
    if (valueWeight > this.maxWeight) return;
    this.entries.set(key, { value, expiresAt: now + this.ttlMs });
    this.currentWeight += valueWeight;
    while (this.entries.size > this.maxEntries || this.currentWeight > this.maxWeight) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.delete(oldest);
    }
  }

  clear(): void {
    this.entries.clear();
    this.currentWeight = 0;
  }

  get size(): number {
    return this.entries.size;
  }

  get weightBytes(): number {
    return this.currentWeight;
  }
}
