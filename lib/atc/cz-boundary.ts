import type { Coordinate } from "./types";

export const CZ_CUZK_DATA50_QUERY_URL = "https://ags.cuzk.gov.cz/arcgis/rest/services/DATA50/MapServer/0/query";
export const CZ_CUZK_DATA50_METADATA_URL = "https://geoportal.gov.cz/php/micka/record/basic/CZ-CUZK-DATA50-V?dlang=eng";
export const CZ_CUZK_DATA50_ATTRIBUTION = "ČÚZK Data50 (CC BY 4.0)";

const CUZK_HOST = "ags.cuzk.gov.cz";
const MAX_SOURCE_BYTES = 32 * 1024 * 1024;
// Production policy: an eAIP endpoint may only be snapped to authoritative
// Data50 geometry when the displacement is at most 0.5 km. There is no
// untested 0.5–1.0 km exception and no larger fallback tolerance.
export const ATC_BOUNDARY_MAX_SNAP_DISTANCE_KM = 0.5;
/** @deprecated Use ATC_BOUNDARY_MAX_SNAP_DISTANCE_KM. */
export const CZ_PRODUCTION_MAX_SNAP_DISTANCE_KM = ATC_BOUNDARY_MAX_SNAP_DISTANCE_KM;
const MAX_BOUNDARY_EDGE_LENGTH_KM = 25;
const NODE_PRECISION = 7;

export type BoundaryClassification = "state" | "tripoint";

export interface StateBoundaryFeature {
  id: string;
  classification: BoundaryClassification;
  coordinates: Coordinate[];
}

export interface StateBoundaryInput {
  start: Coordinate;
  end: Coordinate;
  hint?: string;
  maxSnapDistanceKm?: number;
}

export interface StateBoundaryResolution {
  coordinates: Coordinate[];
  startSnapDistanceKm: number;
  endSnapDistanceKm: number;
  pathLengthKm: number;
  vertexCount: number;
  maxSegmentLengthKm: number;
  featureIds: string[];
  provider?: string;
  semantic?: string;
}

export interface StateBoundaryProvider {
  getBoundarySegment(input: StateBoundaryInput): StateBoundaryResolution;
}

export class CuzkBoundaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CuzkBoundaryError";
  }
}

interface GeoJsonFeature {
  type: "Feature";
  properties?: Record<string, unknown>;
  geometry?: {
    type: "LineString" | "MultiLineString";
    coordinates: unknown;
  } | null;
}

interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  features?: GeoJsonFeature[];
}

interface GraphNode {
  id: string;
  coordinate: Coordinate;
}

interface GraphEdge {
  id: string;
  from: string;
  to: string;
  lengthKm: number;
  classification: BoundaryClassification;
  featureId: string;
}

interface SnapCandidate {
  point: Coordinate;
  distanceKm: number;
  edge: GraphEdge;
  fraction: number;
}

interface QueueItem {
  id: string;
  distance: number;
}

interface LocalBoundaryEdge {
  to: string;
  distanceKm: number;
  featureId: string;
  geometryKey: string;
}

function normalizedText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function nodeKey(coordinate: Coordinate): string {
  return `${coordinate[0].toFixed(NODE_PRECISION)}:${coordinate[1].toFixed(NODE_PRECISION)}`;
}

function radians(value: number): number {
  return value * Math.PI / 180;
}

function haversineKm(a: Coordinate, b: Coordinate): number {
  const latitudeDelta = radians(b[1] - a[1]);
  const longitudeDelta = radians(b[0] - a[0]);
  const latitudeA = radians(a[1]);
  const latitudeB = radians(b[1]);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.sqrt(Math.min(1, value)));
}

function projectOnSegment(point: Coordinate, start: Coordinate, end: Coordinate): { point: Coordinate; fraction: number; distanceKm: number } {
  const scale = Math.cos(radians(point[1]));
  const startX = (start[0] - point[0]) * scale;
  const startY = start[1] - point[1];
  const endX = (end[0] - point[0]) * scale;
  const endY = end[1] - point[1];
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const denominator = deltaX * deltaX + deltaY * deltaY;
  const rawFraction = denominator === 0 ? 0 : -(startX * deltaX + startY * deltaY) / denominator;
  const fraction = Math.max(0, Math.min(1, rawFraction));
  const candidate: Coordinate = [start[0] + (end[0] - start[0]) * fraction, start[1] + (end[1] - start[1]) * fraction];
  return { point: candidate, fraction, distanceKm: haversineKm(point, candidate) };
}

function appendUnique(target: Coordinate[], coordinates: Coordinate[]): void {
  for (const coordinate of coordinates) {
    const previous = target.at(-1);
    if (!previous || previous[0] !== coordinate[0] || previous[1] !== coordinate[1]) target.push(coordinate);
  }
}

function boundaryFeaturesFromGeoJson(value: unknown): StateBoundaryFeature[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as GeoJsonFeatureCollection).features)) {
    throw new CuzkBoundaryError("ČÚZK Data50 response is not a GeoJSON FeatureCollection");
  }
  const features: StateBoundaryFeature[] = [];
  for (const feature of (value as GeoJsonFeatureCollection).features ?? []) {
    const properties = feature.properties ?? {};
    const label = typeof properties.DATA50_P === "string" ? normalizedText(properties.DATA50_P).toLocaleLowerCase("cs-CZ") : "";
    let classification: BoundaryClassification | null = null;
    if (label.includes("trojmez")) classification = "tripoint";
    else if (label.startsWith("st") && label.includes("hranice")) classification = "state";
    if (!classification || !feature.geometry) continue;
    const rawParts = feature.geometry.type === "LineString"
      ? [feature.geometry.coordinates]
      : feature.geometry.type === "MultiLineString"
        ? feature.geometry.coordinates
        : [];
    if (!Array.isArray(rawParts)) throw new CuzkBoundaryError("ČÚZK Data50 returned an invalid boundary geometry collection");
    for (const [partIndex, rawPart] of rawParts.entries()) {
      if (!Array.isArray(rawPart) || rawPart.length < 2) throw new CuzkBoundaryError("ČÚZK Data50 returned a boundary line with fewer than two vertices");
      const coordinates = rawPart.map((value) => {
        if (!Array.isArray(value) || value.length < 2 || typeof value[0] !== "number" || typeof value[1] !== "number" || !Number.isFinite(value[0]) || !Number.isFinite(value[1])) {
          throw new CuzkBoundaryError("ČÚZK Data50 returned an invalid WGS84 boundary coordinate");
        }
        return [value[0], value[1]] as Coordinate;
      });
      const objectId = properties.OBJECTID === undefined ? "unknown" : String(properties.OBJECTID);
      features.push({ id: `${objectId}:${partIndex}`, classification, coordinates });
    }
  }
  if (!features.length) throw new CuzkBoundaryError("ČÚZK Data50 did not return any state-boundary features");
  return features;
}

class MinQueue {
  private readonly items: QueueItem[] = [];

  push(item: QueueItem): void {
    this.items.push(item);
    this.up(this.items.length - 1);
  }

  pop(): QueueItem | undefined {
    if (!this.items.length) return undefined;
    const result = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length) {
      this.items[0] = last;
      this.down(0);
    }
    return result;
  }

  private up(index: number): void {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.items[parent].distance <= this.items[index].distance) break;
      [this.items[parent], this.items[index]] = [this.items[index], this.items[parent]];
      index = parent;
    }
  }

  private down(index: number): void {
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < this.items.length && this.items[left].distance < this.items[smallest].distance) smallest = left;
      if (right < this.items.length && this.items[right].distance < this.items[smallest].distance) smallest = right;
      if (smallest === index) break;
      [this.items[smallest], this.items[index]] = [this.items[index], this.items[smallest]];
      index = smallest;
    }
  }
}

export class InMemoryStateBoundaryProvider implements StateBoundaryProvider {
  private readonly nodes = new Map<string, GraphNode>();
  private readonly edges: GraphEdge[] = [];
  private readonly edgeKeys = new Set<string>();
  private readonly adjacency = new Map<string, GraphEdge[]>();

  constructor(features: StateBoundaryFeature[], private readonly maxBoundaryEdgeLengthKm = MAX_BOUNDARY_EDGE_LENGTH_KM) {
    for (const feature of features) {
      const coordinates = feature.coordinates.filter((coordinate, index) => index === 0 || coordinate[0] !== feature.coordinates[index - 1][0] || coordinate[1] !== feature.coordinates[index - 1][1]);
      for (let index = 1; index < coordinates.length; index += 1) {
        const from = this.ensureNode(coordinates[index - 1]);
        const to = this.ensureNode(coordinates[index]);
        if (from === to) continue;
        const lengthKm = haversineKm(coordinates[index - 1], coordinates[index]);
        if (lengthKm > this.maxBoundaryEdgeLengthKm) throw new CuzkBoundaryError(`State-boundary edge ${feature.id} is implausibly long (${lengthKm.toFixed(3)} km)`);
        const edgeKey = from < to ? `${from}|${to}` : `${to}|${from}`;
        if (this.edgeKeys.has(edgeKey)) continue;
        this.edgeKeys.add(edgeKey);
        const edge: GraphEdge = { id: `${feature.id}:${index}`, from, to, lengthKm, classification: feature.classification, featureId: feature.id };
        this.edges.push(edge);
        this.adjacency.set(from, [...(this.adjacency.get(from) ?? []), edge]);
        this.adjacency.set(to, [...(this.adjacency.get(to) ?? []), edge]);
      }
    }
    if (!this.edges.length) throw new CuzkBoundaryError("State-boundary graph contains no usable edges");
  }

  getBoundarySegment(input: StateBoundaryInput): StateBoundaryResolution {
    const allowed = new Set<BoundaryClassification>(["state", "tripoint"]);
    const maxSnapDistanceKm = input.maxSnapDistanceKm ?? ATC_BOUNDARY_MAX_SNAP_DISTANCE_KM;
    if (!Number.isFinite(maxSnapDistanceKm) || maxSnapDistanceKm <= 0) throw new CuzkBoundaryError("State-boundary snap tolerance must be positive");
    const start = this.findSnap(input.start, allowed, maxSnapDistanceKm);
    const end = this.findSnap(input.end, allowed, maxSnapDistanceKm);
    const path = this.findPath(start, end, allowed);
    const coordinates: Coordinate[] = [];
    appendUnique(coordinates, path.coordinates);
    if (coordinates.length < 1) throw new CuzkBoundaryError("State-boundary resolver produced an empty path");
    const maxSegmentLengthKm = coordinates.slice(1).reduce((maximum, coordinate, index) => Math.max(maximum, haversineKm(coordinates[index], coordinate)), 0);
    if (maxSegmentLengthKm > this.maxBoundaryEdgeLengthKm) throw new CuzkBoundaryError(`Resolved state-boundary path contains an implausible jump (${maxSegmentLengthKm.toFixed(3)} km)`);
    return {
      coordinates,
      startSnapDistanceKm: start.distanceKm,
      endSnapDistanceKm: end.distanceKm,
      pathLengthKm: path.distanceKm,
      vertexCount: coordinates.length,
      maxSegmentLengthKm,
      featureIds: [...path.featureIds].sort(),
    };
  }

  private ensureNode(coordinate: Coordinate): string {
    const id = nodeKey(coordinate);
    if (!this.nodes.has(id)) this.nodes.set(id, { id, coordinate });
    return id;
  }

  private findSnap(point: Coordinate, allowed: Set<BoundaryClassification>, maxSnapDistanceKm: number): SnapCandidate {
    const candidates: SnapCandidate[] = [];
    for (const edge of this.edges) {
      if (!allowed.has(edge.classification)) continue;
      const from = this.nodes.get(edge.from)!.coordinate;
      const to = this.nodes.get(edge.to)!.coordinate;
      const projection = projectOnSegment(point, from, to);
      candidates.push({ point: projection.point, distanceKm: projection.distanceKm, edge, fraction: projection.fraction });
    }
    candidates.sort((left, right) => left.distanceKm - right.distanceKm || left.edge.id.localeCompare(right.edge.id));
    const result = candidates[0];
    if (!result || result.distanceKm > maxSnapDistanceKm) {
      throw new CuzkBoundaryError(`AIP endpoint is ${result?.distanceKm.toFixed(3) ?? "unknown"} km from the authoritative ${[...allowed].join("/")} boundary (maximum ${maxSnapDistanceKm} km)`);
    }
    return result;
  }

  private findPath(start: SnapCandidate, end: SnapCandidate, allowed: Set<BoundaryClassification>): { coordinates: Coordinate[]; distanceKm: number; featureIds: Set<string> } {
    const startId = "@start";
    const endId = "@end";
    const coordinates = new Map<string, Coordinate>([...this.nodes.values()].map((node) => [node.id, node.coordinate]));
    coordinates.set(startId, start.point);
    coordinates.set(endId, end.point);
    const adjacency = new Map<string, LocalBoundaryEdge[]>();
    const geometryKey = (from: string, to: string, distanceKm: number): string => {
      const first = coordinates.get(from);
      const second = coordinates.get(to);
      if (!first || !second) return `${from}|${to}|${distanceKm}`;
      const firstKey = nodeKey(first);
      const secondKey = nodeKey(second);
      return firstKey < secondKey
        ? `${firstKey}|${secondKey}|${distanceKm.toFixed(12)}`
        : `${secondKey}|${firstKey}|${distanceKm.toFixed(12)}`;
    };
    const addEdge = (from: string, to: string, distanceKm: number, featureId: string): void => {
      const edgeGeometryKey = geometryKey(from, to, distanceKm);
      adjacency.set(from, [...(adjacency.get(from) ?? []), { to, distanceKm, featureId, geometryKey: edgeGeometryKey }]);
      adjacency.set(to, [...(adjacency.get(to) ?? []), { to: from, distanceKm, featureId, geometryKey: edgeGeometryKey }]);
    };
    for (const edge of this.edges) {
      if (allowed.has(edge.classification)) addEdge(edge.from, edge.to, edge.lengthKm, edge.featureId);
    }
    const connectSnap = (id: string, snap: SnapCandidate): void => {
      addEdge(id, snap.edge.from, snap.edge.lengthKm * snap.fraction, snap.edge.featureId);
      addEdge(id, snap.edge.to, snap.edge.lengthKm * (1 - snap.fraction), snap.edge.featureId);
    };
    connectSnap(startId, start);
    connectSnap(endId, end);
    if (start.edge.id === end.edge.id) addEdge(startId, endId, Math.abs(start.fraction - end.fraction) * start.edge.lengthKm, start.edge.featureId);

    const distances = new Map<string, number>([[startId, 0]]);
    const previous = new Map<string, { from: string; featureId: string }>();
    const queue = new MinQueue();
    queue.push({ id: startId, distance: 0 });
    while (true) {
      const item = queue.pop();
      if (!item) break;
      if (item.distance > (distances.get(item.id) ?? Number.POSITIVE_INFINITY) + 1e-9) continue;
      for (const edge of adjacency.get(item.id) ?? []) {
        const nextDistance = item.distance + edge.distanceKm;
        const knownDistance = distances.get(edge.to);
        if (knownDistance === undefined || nextDistance < knownDistance - 1e-9) {
          distances.set(edge.to, nextDistance);
          previous.set(edge.to, { from: item.id, featureId: edge.featureId });
          queue.push({ id: edge.to, distance: nextDistance });
        }
      }
    }
    const distance = distances.get(endId);
    if (distance === undefined) throw new CuzkBoundaryError("No connected authoritative state-boundary path exists between AIP endpoints");
    const reverseDistances = new Map<string, number>([[endId, 0]]);
    const reverseQueue = new MinQueue();
    reverseQueue.push({ id: endId, distance: 0 });
    while (true) {
      const item = reverseQueue.pop();
      if (!item) break;
      if (item.distance > (reverseDistances.get(item.id) ?? Number.POSITIVE_INFINITY) + 1e-9) continue;
      for (const edge of adjacency.get(item.id) ?? []) {
        const nextDistance = item.distance + edge.distanceKm;
        if (nextDistance < (reverseDistances.get(edge.to) ?? Number.POSITIVE_INFINITY) - 1e-9) {
          reverseDistances.set(edge.to, nextDistance);
          reverseQueue.push({ id: edge.to, distance: nextDistance });
        }
      }
    }
    const shortestPathCount = this.countShortestPaths(adjacency, distances, reverseDistances, startId, endId, distance, coordinates);
    if (shortestPathCount > 1) throw new CuzkBoundaryError("More than one equally short authoritative state-boundary path exists between AIP endpoints");
    const reversed: Coordinate[] = [];
    const featureIds = new Set<string>();
    let current = endId;
    while (true) {
      reversed.push(coordinates.get(current)!);
      if (current === startId) break;
      const link = previous.get(current);
      if (!link) throw new CuzkBoundaryError("State-boundary path reconstruction failed");
      featureIds.add(link.featureId);
      current = link.from;
    }
    reversed.reverse();
    return { coordinates: reversed, distanceKm: distance, featureIds };
  }

  /**
   * Count shortest paths without enumerating them. The shortest-path corridor
   * is reduced to a DAG after contracting zero-length connections. This keeps
   * node snaps and duplicate topology finite while preserving genuine
   * equal-length geographic alternatives as ambiguity.
   */
  private countShortestPaths(
    adjacency: Map<string, LocalBoundaryEdge[]>,
    distances: Map<string, number>,
    reverseDistances: Map<string, number>,
    startId: string,
    endId: string,
    shortestDistance: number,
    coordinates: Map<string, Coordinate>,
  ): number {
    const ids = [...coordinates.keys()];
    const parent = new Map<string, string>(ids.map((id) => [id, id]));
    const find = (id: string): string => {
      let root = id;
      while (parent.get(root) !== root) root = parent.get(root)!;
      let current = id;
      while (parent.get(current) !== current) {
        const next = parent.get(current)!;
        parent.set(current, root);
        current = next;
      }
      return root;
    };
    const union = (left: string, right: string): void => {
      const leftRoot = find(left);
      const rightRoot = find(right);
      if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
    };
    const onShortestCorridor = (from: string, edge: LocalBoundaryEdge): boolean => {
      const fromDistance = distances.get(from);
      const toDistance = reverseDistances.get(edge.to);
      return fromDistance !== undefined
        && toDistance !== undefined
        && Math.abs(fromDistance + edge.distanceKm + toDistance - shortestDistance) <= 1e-8;
    };

    // A zero-length edge can connect a snap point to an existing node, or two
    // identical topology copies. Contract only zero edges that participate in
    // the shortest corridor; unrelated zero components must not affect count.
    for (const [from, edges] of adjacency) {
      for (const edge of edges) {
        if (edge.distanceKm <= 1e-12 && onShortestCorridor(from, edge)) union(from, edge.to);
      }
    }

    const componentDistance = new Map<string, number>();
    for (const [id, distanceFromStart] of distances) {
      const component = find(id);
      componentDistance.set(component, Math.min(componentDistance.get(component) ?? Number.POSITIVE_INFINITY, distanceFromStart));
    }
    const startComponent = find(startId);
    const endComponent = find(endId);
    const outgoing = new Map<string, Map<string, Set<string>>>();
    for (const [from, edges] of adjacency) {
      for (const edge of edges) {
        if (!onShortestCorridor(from, edge)) continue;
        const fromComponent = find(from);
        const toComponent = find(edge.to);
        if (fromComponent === toComponent) continue;
        const fromDistance = componentDistance.get(fromComponent);
        const toDistance = componentDistance.get(toComponent);
        if (fromDistance === undefined || toDistance === undefined || toDistance <= fromDistance + 1e-9) continue;
        const destinations = outgoing.get(fromComponent) ?? new Map<string, Set<string>>();
        const geometries = destinations.get(toComponent) ?? new Set<string>();
        geometries.add(edge.geometryKey);
        destinations.set(toComponent, geometries);
        outgoing.set(fromComponent, destinations);
      }
    }

    const orderedComponents = [...componentDistance.entries()]
      .sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]))
      .map(([component]) => component);
    const ways = new Map<string, number>([[startComponent, 1]]);
    for (const component of orderedComponents) {
      const currentWays = ways.get(component) ?? 0;
      if (!currentWays) continue;
      for (const [destination, geometries] of outgoing.get(component) ?? []) {
        const multiplicity = Math.min(2, geometries.size);
        ways.set(destination, Math.min(2, (ways.get(destination) ?? 0) + currentWays * multiplicity));
      }
    }
    return ways.get(endComponent) ?? 0;
  }
}

export async function fetchCuzkData50BoundaryFeatures(): Promise<StateBoundaryFeature[]> {
  const url = new URL(CZ_CUZK_DATA50_QUERY_URL);
  if (url.protocol !== "https:" || url.hostname !== CUZK_HOST) throw new CuzkBoundaryError("Refusing non-authoritative ČÚZK Data50 URL");
  url.searchParams.set("where", "DATA50_P LIKE 'státní hranice%'");
  url.searchParams.set("outFields", "OBJECTID,DATA50_K,DATA50_P");
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("outSR", "4326");
  url.searchParams.set("f", "geojson");
  const response = await fetch(url, {
    signal: AbortSignal.timeout(60_000),
    headers: { Accept: "application/geo+json,application/json", "User-Agent": "AirRadar Czech state-boundary sync/1.0" },
  });
  if (!response.ok) throw new CuzkBoundaryError(`ČÚZK Data50 request failed with HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_SOURCE_BYTES) throw new CuzkBoundaryError("ČÚZK Data50 response exceeds the safety size limit");
  try {
    return boundaryFeaturesFromGeoJson(JSON.parse(new TextDecoder().decode(bytes)) as unknown);
  } catch (error) {
    if (error instanceof CuzkBoundaryError) throw error;
    throw new CuzkBoundaryError(`ČÚZK Data50 response could not be parsed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export class CuzkStateBoundaryProvider implements StateBoundaryProvider {
  private graph: InMemoryStateBoundaryProvider | null = null;

  async load(): Promise<void> {
    this.graph = new InMemoryStateBoundaryProvider(await fetchCuzkData50BoundaryFeatures());
  }

  getBoundarySegment(input: StateBoundaryInput): StateBoundaryResolution {
    if (!this.graph) throw new CuzkBoundaryError("ČÚZK Data50 boundary provider has not been loaded");
    return { ...this.graph.getBoundarySegment(input), provider: "ČÚZK Data50" };
  }
}
