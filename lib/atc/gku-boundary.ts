import fs from "node:fs";
import { InMemoryStateBoundaryProvider, type StateBoundaryFeature, type StateBoundaryInput, type StateBoundaryResolution } from "./cz-boundary";
import type { Coordinate } from "./types";

export const GKU_ZBGIS_BOUNDARY_SOURCE = "GKÚ Bratislava / ZBGIS – Administratívne hranice, základná úroveň";
export const GKU_ZBGIS_BOUNDARY_URL = "https://opendata.skgeodesy.sk/static/ZBGIS/usj/ah_gpkg_0_sjtsk03.zip";
export const GKU_ZBGIS_BOUNDARY_DATASET_DATE = "2026-06-30";
const ARTIFACT_PATH = "data/atc/sk-state-boundary.json";

type Artifact = { geometry?: { type?: string; coordinates?: unknown }; source?: Record<string, unknown> };

function loadArtifact(): Artifact {
  try {
    return JSON.parse(fs.readFileSync(ARTIFACT_PATH, "utf8")) as Artifact;
  } catch (error) {
    throw new Error(`Official ZBGIS boundary artifact is unavailable at ${ARTIFACT_PATH}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function ringsFromArtifact(artifact: Artifact): Coordinate[][][] {
  const coordinates = artifact.geometry?.coordinates;
  const polygons = artifact.geometry?.type === "Polygon" ? [coordinates] : coordinates;
  if (!Array.isArray(polygons) || !polygons.length) throw new Error("Official ZBGIS artifact has no polygon geometry");
  return polygons.map((polygon) => {
    if (!Array.isArray(polygon) || !Array.isArray(polygon[0]) || polygon[0].length < 4) throw new Error("Official ZBGIS artifact contains an invalid exterior ring");
    return polygon as Coordinate[][];
  });
}

export class SlovakiaGkuBoundaryProvider {
  private graph: InMemoryStateBoundaryProvider | null = null;
  private polygon: Coordinate[] | null = null;
  readonly source = GKU_ZBGIS_BOUNDARY_SOURCE;

  load(): void {
    const artifact = loadArtifact();
    const polygons = ringsFromArtifact(artifact);
    this.polygon = polygons[0][0];
    const features: StateBoundaryFeature[] = polygons.map((polygon, index) => ({ id: `gku-zbgis:sk:${index}`, classification: "state", coordinates: polygon[0] }));
    this.graph = new InMemoryStateBoundaryProvider(features);
  }

  getNationalPolygon(): Coordinate[] {
    if (!this.polygon) throw new Error("Official ZBGIS boundary provider has not been loaded");
    return this.polygon;
  }

  getBoundarySegment(input: StateBoundaryInput): StateBoundaryResolution {
    if (!this.graph) throw new Error("Official ZBGIS boundary provider has not been loaded");
    return { ...this.graph.getBoundarySegment({ ...input, maxSnapDistanceKm: input.maxSnapDistanceKm ?? 1 }), provider: this.source };
  }
}
