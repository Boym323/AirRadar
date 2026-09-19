/** Dev-only synthetic benchmark. It does not access PostgreSQL. */
const sizes = (process.argv.slice(2).map(Number).filter(Number.isFinite).length ? process.argv.slice(2).map(Number).filter(Number.isFinite) : [100_000, 500_000, 1_000_000]).filter((n) => n > 0);
const sectors = 3;
for (const count of sizes) {
  const before = process.memoryUsage(); const started = performance.now(); const buckets = new Map<number, Set<number>>();
  for (let i = 0; i < count; i++) {
    const flight = i % 2000; const bucket = Math.floor(i / 60); const sector = (flight + Math.floor(i / 500)) % sectors;
    const set = buckets.get(bucket) ?? new Set<number>(); set.add(flight); buckets.set(bucket, set);
    void sector; void (10000 + ((i * 17) % 25000)); void (180 + ((i * 13) % 180));
  }
  const elapsed = performance.now() - started; const after = process.memoryUsage();
  console.log(JSON.stringify({ positions: count, flights: 2000, sectors, analyticsBuckets: buckets.size, processingTimeMs: Math.round(elapsed * 100) / 100, positionsPerSecond: Math.round(count / (elapsed / 1000)), heapBefore: before.heapUsed, peakHeap: after.heapUsed, heapAfter: after.heapUsed, rssBefore: before.rss, rssAfter: after.rss, note: "Synthetic benchmark – does not include PostgreSQL fetch, Prisma overhead or network/API serialization." }));
}
