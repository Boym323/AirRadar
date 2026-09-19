import { getSectorTrafficHistory, type SectorHistoryBucket } from "@/lib/server/sector-traffic-context";

export const dynamic = "force-dynamic";
const buckets = new Set<SectorHistoryBucket>(["1m", "5m", "15m", "1h"]);

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params; const query = new URL(request.url).searchParams; const from = new Date(query.get("from") ?? ""); const to = new Date(query.get("to") ?? ""); const bucket = query.get("bucket") as SectorHistoryBucket;
  if (!buckets.has(bucket)) return Response.json({ error: "Invalid bucket" }, { status: 400 });
  try { const value = await getSectorTrafficHistory({ sectorId: id, from, to, bucket }); return value ? Response.json(value) : Response.json({ error: "Sector not found" }, { status: 404 }); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invalid history range" }, { status: 400 }); }
}
