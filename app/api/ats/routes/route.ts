import { loadCzAtsRoutes } from "@/lib/ats/cz-routes";
import { loadSkAtsRoutes } from "@/lib/ats/sk-routes";
import { createCzAtsGeoJSON } from "@/lib/ats/geojson";
export const dynamic = "force-dynamic";
export async function GET(): Promise<Response> {
  const documents = [loadCzAtsRoutes(), loadSkAtsRoutes()].filter((value): value is NonNullable<typeof value> => value !== null);
  if (!documents.length) return Response.json({ available: false, status: "unavailable", routes: [] }, { status: 503, headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
  const routes = documents.flatMap((document) => document.routes);
  const segmentIndex = new Map<string, ReturnType<typeof createCzAtsGeoJSON>["segments"]["features"][number]>();
  for (const document of documents) for (const feature of createCzAtsGeoJSON(document).segments.features) {
    const key = `${feature.properties.routeDesignator}|${feature.properties.fromName}|${feature.properties.toName}|${JSON.stringify(feature.geometry.coordinates)}`;
    const previous = segmentIndex.get(key);
    if (previous) previous.properties.sourceReference = `${previous.properties.sourceReference} | ${feature.properties.sourceReference}`;
    else segmentIndex.set(key, feature);
  }
  const segments = [...segmentIndex.values()];
  const labels = documents.flatMap((document) => createCzAtsGeoJSON(document).labels.features);
  const points = documents.flatMap((document) => createCzAtsGeoJSON(document).points.features);
  const source = documents.length === 1 ? documents[0].source : { ...documents[0].source, name: "CZ + SK eAIP", reference: documents.map((document) => document.source.reference).join(" | ") };
  return Response.json({ available: true, source, counts: { routes: routes.length, points: routes.reduce((n, route) => n + route.points.length, 0), segments: segments.length, cdrSegments: segments.filter((feature) => feature.properties.availabilityClass !== null).length, discontinuities: routes.reduce((n, route) => n + route.discontinuities.length, 0) }, routes, segments: { type: "FeatureCollection", features: segments }, labels: { type: "FeatureCollection", features: labels }, points: { type: "FeatureCollection", features: points } }, { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } });
}
