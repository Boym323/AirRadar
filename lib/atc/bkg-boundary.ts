import {
  ATC_BOUNDARY_MAX_SNAP_DISTANCE_KM,
  CuzkBoundaryError,
  InMemoryStateBoundaryProvider,
  type StateBoundaryFeature,
  type StateBoundaryInput,
  type StateBoundaryResolution,
} from "./cz-boundary";
import type { Coordinate } from "./types";

export const BKG_VG25_WFS_URL = "https://sgx.geodatenzentrum.de/wfs_vg25";
export const BKG_VG25_FEATURE_TYPE = "vg25:vg25_li";
export const BKG_VG25_ATTRIBUTION = "© Bundesamt für Kartographie und Geodäsie (BKG), VG25, CC BY 4.0";

const BKG_HOST = "sgx.geodatenzentrum.de";
const MAX_SOURCE_BYTES = 32 * 1024 * 1024;
const MAX_BKG_SOURCE_EDGE_LENGTH_KM = 100;

interface GeoJsonFeature {
  id?: string;
  properties?: Record<string, unknown>;
  geometry?: { type: "LineString" | "MultiLineString"; coordinates: unknown } | null;
}

interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  features?: GeoJsonFeature[];
}

function bkgFeaturesFromGeoJson(value: unknown): StateBoundaryFeature[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as GeoJsonFeatureCollection).features)) {
    throw new CuzkBoundaryError("BKG VG25 response is not a GeoJSON FeatureCollection");
  }
  const features: StateBoundaryFeature[] = [];
  for (const feature of (value as GeoJsonFeatureCollection).features ?? []) {
    // VG25 agz=1 is the Staat (national) administrative boundary. Internal
    // Länder/Kreis boundaries are deliberately excluded before graph building.
    if (feature.properties?.agz !== 1 || !feature.geometry) continue;
    const parts = feature.geometry.type === "LineString" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    if (!Array.isArray(parts)) throw new CuzkBoundaryError("BKG VG25 returned an invalid boundary geometry collection");
    for (const [partIndex, part] of parts.entries()) {
      if (!Array.isArray(part) || part.length < 2) throw new CuzkBoundaryError("BKG VG25 returned a boundary line with fewer than two vertices");
      const coordinates = part.map((coordinate) => {
        if (!Array.isArray(coordinate) || coordinate.length < 2 || typeof coordinate[0] !== "number" || typeof coordinate[1] !== "number" || !Number.isFinite(coordinate[0]) || !Number.isFinite(coordinate[1])) {
          throw new CuzkBoundaryError("BKG VG25 returned an invalid WGS84 boundary coordinate");
        }
        return [coordinate[0], coordinate[1]] as Coordinate;
      });
      features.push({ id: `${feature.id ?? "unknown"}:${partIndex}`, classification: "state", coordinates });
    }
  }
  if (!features.length) throw new CuzkBoundaryError("BKG VG25 did not return national-boundary features");
  return features;
}

export async function fetchBkgVg25NationalBoundaryFeatures(): Promise<StateBoundaryFeature[]> {
  const url = new URL(BKG_VG25_WFS_URL);
  if (url.protocol !== "https:" || url.hostname !== BKG_HOST) throw new CuzkBoundaryError("Refusing non-authoritative BKG VG25 URL");
  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", "2.0.0");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("typeNames", BKG_VG25_FEATURE_TYPE);
  url.searchParams.set("CQL_FILTER", "agz=1");
  url.searchParams.set("srsName", "EPSG:4326");
  url.searchParams.set("outputFormat", "application/json");
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000), headers: { Accept: "application/geo+json,application/json", "User-Agent": "AirRadar BKG VG25 boundary sync/1.0" } });
  if (!response.ok) throw new CuzkBoundaryError(`BKG VG25 request failed with HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_SOURCE_BYTES) throw new CuzkBoundaryError("BKG VG25 response exceeds the safety size limit");
  try {
    return bkgFeaturesFromGeoJson(JSON.parse(new TextDecoder().decode(bytes)) as unknown);
  } catch (error) {
    if (error instanceof CuzkBoundaryError) throw error;
    throw new CuzkBoundaryError(`BKG VG25 response could not be parsed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export class BkgGermanyPolandBoundaryProvider {
  private graph: InMemoryStateBoundaryProvider | null = null;

  async load(): Promise<void> {
    // VG25 national-boundary parts may contain long, valid segments far from
    // the requested DE–PL path. Resolved paths still report their own maximum
    // segment and are rejected if implausible by downstream geometry checks.
    this.graph = new InMemoryStateBoundaryProvider(await fetchBkgVg25NationalBoundaryFeatures(), MAX_BKG_SOURCE_EDGE_LENGTH_KM);
  }

  getBoundarySegment(input: StateBoundaryInput): StateBoundaryResolution {
    if (!this.graph) throw new CuzkBoundaryError("BKG VG25 boundary provider has not been loaded");
    return { ...this.graph.getBoundarySegment({ ...input, maxSnapDistanceKm: input.maxSnapDistanceKm ?? ATC_BOUNDARY_MAX_SNAP_DISTANCE_KM }), provider: "BKG VG25" };
  }
}
