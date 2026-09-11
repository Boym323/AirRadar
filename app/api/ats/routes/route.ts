import { loadCzAtsRoutes } from "@/lib/ats/cz-routes";
import { createCzAtsGeoJSON } from "@/lib/ats/geojson";
export const dynamic = "force-dynamic";
export async function GET(): Promise<Response> {
  const document = loadCzAtsRoutes();
  if (!document) return Response.json({ available: false, status: "unavailable", routes: [] }, { status: 503, headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
  return Response.json({ available: true, source: document.source, counts: document.counts, routes: document.routes, ...createCzAtsGeoJSON(document) }, { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } });
}
