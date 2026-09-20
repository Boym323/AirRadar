import { loadCzAtsRoutes } from "@/lib/ats/cz-routes";
import { loadSkAtsRoutes } from "@/lib/ats/sk-routes";
import { loadAtAtsRoutes } from "@/lib/ats/at-routes";
import { createCzAtsGeoJSON } from "@/lib/ats/geojson";

export const dynamic = "force-dynamic";

type AtsDocument = NonNullable<ReturnType<typeof loadCzAtsRoutes>>;
type AtsPayload = {
  available: true;
  source: AtsDocument["source"];
  counts: {
    routes: number;
    points: number;
    segments: number;
    cdrSegments: number;
    discontinuities: number;
  };
  routes: AtsDocument["routes"];
  segments: ReturnType<typeof createCzAtsGeoJSON>["segments"];
  labels: ReturnType<typeof createCzAtsGeoJSON>["labels"];
  points: ReturnType<typeof createCzAtsGeoJSON>["points"];
};

type AtsMapPayload = Omit<AtsPayload, "routes">;

let cachedPayload: { documents: AtsDocument[]; value: AtsPayload } | null = null;

function buildPayload(documents: AtsDocument[]): AtsPayload {
  const prepared = documents.map((document) => ({ document, geojson: createCzAtsGeoJSON(document) }));
  const routes = prepared.flatMap(({ document }) => document.routes);
  const segmentIndex = new Map<string, ReturnType<typeof createCzAtsGeoJSON>["segments"]["features"][number]>();

  for (const { geojson } of prepared) {
    for (const feature of geojson.segments.features) {
      const key = `${feature.properties.routeDesignator}|${feature.properties.fromName}|${feature.properties.toName}|${JSON.stringify(feature.geometry.coordinates)}`;
      const previous = segmentIndex.get(key);
      if (previous) previous.properties.sourceReference = `${previous.properties.sourceReference} | ${feature.properties.sourceReference}`;
      else segmentIndex.set(key, feature);
    }
  }

  const segments = [...segmentIndex.values()];
  const labels = prepared.flatMap(({ geojson }) => geojson.labels.features);
  const points = prepared.flatMap(({ geojson }) => geojson.points.features);
  const source = documents.length === 1
    ? documents[0]!.source
    : {
        ...documents[0]!.source,
        name: documents.map((document) => document.source.name).join(" + "),
        reference: documents.map((document) => document.source.reference).join(" | "),
      };

  return {
    available: true,
    source,
    counts: {
      routes: routes.length,
      points: routes.reduce((count, route) => count + route.points.length, 0),
      segments: segments.length,
      cdrSegments: segments.filter((feature) => feature.properties.availabilityClass !== null).length,
      discontinuities: routes.reduce((count, route) => count + route.discontinuities.length, 0),
    },
    routes,
    segments: { type: "FeatureCollection", features: segments },
    labels: { type: "FeatureCollection", features: labels },
    points: { type: "FeatureCollection", features: points },
  };
}

export async function GET(request?: Request): Promise<Response> {
  const view = request ? new URL(request.url).searchParams.get("view") : null;
  const documents = [loadCzAtsRoutes(), loadSkAtsRoutes(), loadAtAtsRoutes()]
    .filter((value): value is AtsDocument => value !== null);
  if (!documents.length) {
    cachedPayload = null;
    return Response.json(
      view === "map" ? { available: false, status: "unavailable" } : { available: false, status: "unavailable", routes: [] },
      { status: 503, headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } },
    );
  }

  let value: AtsPayload;
  if (cachedPayload
    && cachedPayload.documents.length === documents.length
    && cachedPayload.documents.every((document, index) => document === documents[index])) {
    value = cachedPayload.value;
  } else {
    value = buildPayload(documents);
    cachedPayload = { documents, value };
  }

  const payload: AtsPayload | AtsMapPayload = view === "map"
    ? { available: value.available, source: value.source, counts: value.counts, segments: value.segments, labels: value.labels, points: value.points }
    : value;
  return Response.json(payload, {
    headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
  });
}
