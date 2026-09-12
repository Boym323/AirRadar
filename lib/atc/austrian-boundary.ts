import fs from "node:fs";
import path from "node:path";
import { InMemoryStateBoundaryProvider, type StateBoundaryFeature, type StateBoundaryInput, type StateBoundaryResolution } from "./cz-boundary";
import type { BoundaryResolver, StateBoundaryReference } from "./boundary-resolver";
import type { Coordinate } from "./types";

export const BEV_AUSTRIAN_BOUNDARY_SOURCE = "© Bundesamt für Eich- und Vermessungswesen (BEV), BEV Open Data – Verwaltungsgrenzen";
export const BEV_AUSTRIAN_BOUNDARY_URL = "https://data.bev.gv.at/geonetwork/srv/metadata/793160c9-426a-43a6-ba6b-9702c5dff89b";
export const AT_BOUNDARY_MAX_SNAP_DISTANCE_KM = 5;
const DEFAULT_ARTIFACT = path.join(process.cwd(), "data/atc/at-state-boundary.json");

export class AustrianBevBoundaryProvider implements BoundaryResolver {
  private graph: InMemoryStateBoundaryProvider | null = null;
  constructor(private readonly artifactPath = process.env.AT_STATE_BOUNDARY_PATH?.trim() || DEFAULT_ARTIFACT) {}
  load(): void {
    const artifact = JSON.parse(fs.readFileSync(this.artifactPath, "utf8")) as { geometry?: { type?: string; coordinates?: unknown } };
    const coordinates = artifact.geometry?.coordinates;
    if (artifact.geometry?.type !== "MultiLineString" || !Array.isArray(coordinates)) throw new Error("BEV Austrian boundary artifact must contain MultiLineString EPSG:4326 geometry");
    const features: StateBoundaryFeature[] = coordinates.map((line, index) => {
      if (!Array.isArray(line) || line.length < 2) throw new Error(`BEV boundary line ${index} is invalid`);
      const points = line.map((item) => {
        if (!Array.isArray(item) || item.length !== 2 || typeof item[0] !== "number" || typeof item[1] !== "number" || !Number.isFinite(item[0]) || !Number.isFinite(item[1])) throw new Error("BEV boundary contains invalid coordinate");
        return [item[0], item[1]] as Coordinate;
      });
      return { id: `bev-at-state:${index}`, classification: "state", coordinates: points };
    });
    this.graph = new InMemoryStateBoundaryProvider(features);
  }
  getBoundarySegment(_reference: StateBoundaryReference, input: StateBoundaryInput): StateBoundaryResolution {
    if (!this.graph) throw new Error("BEV Austrian boundary provider has not been loaded");
    return { ...this.graph.getBoundarySegment({ ...input, maxSnapDistanceKm: input.maxSnapDistanceKm ?? AT_BOUNDARY_MAX_SNAP_DISTANCE_KM }), provider: BEV_AUSTRIAN_BOUNDARY_SOURCE };
  }
}
