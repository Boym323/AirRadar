/** Dev-only, read-only benchmark. Never run this against an unverified database. */
import "dotenv/config";
import { getSectorTrafficHistoryBatch, type SectorHistoryBucket } from "@/lib/server/sector-traffic-context";

if (process.env.ATC_BENCHMARK_NON_PRODUCTION !== "true") {
  throw new Error("Refusing benchmark: set ATC_BENCHMARK_NON_PRODUCTION=true only for a verified non-production database.");
}

const end = new Date(process.env.ATC_BENCHMARK_TO ?? new Date().toISOString());
const scenarios: Array<{ name: string; ids?: string[]; hours: number; bucket: SectorHistoryBucket }> = [
  { name: "LKAANSL / 24h / 15m", ids: ["LKAANSL"], hours: 24, bucket: "15m" },
  { name: "SOUTH / 24h / 15m", ids: ["LKAATB", "LKAANSL", "LKAAS"], hours: 24, bucket: "15m" },
  { name: "all sectors / 24h / 15m", hours: 24, bucket: "15m" },
  { name: "SOUTH / 7d / 1h", ids: ["LKAATB", "LKAANSL", "LKAAS"], hours: 24 * 7, bucket: "1h" },
];

for (const scenario of scenarios) {
  const from = new Date(end.getTime() - scenario.hours * 3_600_000); const started = performance.now(); const before = process.memoryUsage().rss;
  const result = await getSectorTrafficHistoryBatch({ sectorIds: scenario.ids, from, to: end, bucket: scenario.bucket });
  const after = process.memoryUsage().rss;
  console.log(JSON.stringify({ scenario: scenario.name, from: from.toISOString(), to: end.toISOString(), sectorCount: result.sectors.length, bucket: scenario.bucket, dbQueries: 1, chunks: 1, positionsProcessed: result.coverage.positionsProcessed, complete: result.coverage.complete, truncated: result.coverage.truncated, resultPoints: result.sectors.map((s) => s.points.length), responseBytes: Buffer.byteLength(JSON.stringify(result)), durationMs: Math.round((performance.now() - started) * 100) / 100, memoryRssBefore: before, memoryRssAfter: after }));
}
