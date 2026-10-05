import type { FeatureCollection, Point } from "geojson";
import type { AviationNavPoint } from "@/lib/navigation-data/types";

export interface AviationNavMapProperties {
  id: string;
  kind: AviationNavPoint["kind"];
  type: string;
  label: string;
  name: string;
  frequencyMhz: number | null;
  elevationFt: number | null;
  magneticDeclination: string;
  country: string;
  source: AviationNavPoint["source"];
  routeMatched: boolean;
}

export function createAviationNavGeoJSON(points: readonly AviationNavPoint[], routePointIds: ReadonlySet<string> = new Set()): FeatureCollection<Point, AviationNavMapProperties> {
  return {
    type: "FeatureCollection",
    features: points.map((point) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [point.longitude, point.latitude],
      },
      properties: {
        id: point.id,
        kind: point.kind,
        type: point.type ?? "",
        label: point.id,
        name: point.name ?? "",
        frequencyMhz: point.frequencyMhz,
        elevationFt: point.elevationFt,
        magneticDeclination: point.magneticDeclination ?? "",
        country: point.country ?? "",
        source: point.source,
        routeMatched: routePointIds.has(point.id.trim().toUpperCase()),
      },
    })),
  };
}
