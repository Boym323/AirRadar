import { getSectorTrafficHistoryBatch, type SectorHistoryBucket } from "@/lib/server/sector-traffic-context";

export const dynamic = "force-dynamic";
const buckets = new Set<SectorHistoryBucket>(["1m", "5m", "15m", "1h"]);

export async function GET(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams;
  const bucket = query.get("bucket") as SectorHistoryBucket;
  if (!buckets.has(bucket)) return Response.json({ error: "Invalid bucket" }, { status: 400 });
  const sectorParam = query.get("sectors");
  const sectorIds = sectorParam ? sectorParam.split(",").map((id) => id.trim()).filter(Boolean) : undefined;
  try {
    return Response.json(await getSectorTrafficHistoryBatch({ sectorIds, from: new Date(query.get("from") ?? ""), to: new Date(query.get("to") ?? ""), bucket }));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid history range" }, { status: 400 });
  }
}
