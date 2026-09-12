#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import * as shapefile from "shapefile";
import proj4 from "proj4";

const DATASET_DATE = "2025-10-01";
const DATASET_IDENTIFIER = "https://doi.org/10.48677/793160c9-426a-43a6-ba6b-9702c5dff89b";
const METADATA_URL = "https://data.bev.gv.at/geonetwork/srv/metadata/793160c9-426a-43a6-ba6b-9702c5dff89b";
const DOWNLOAD_URL = "https://data.bev.gv.at/download/Verwaltungsgrenzen/shp/20251001/AT_INSPIRE_AB_AdministrativeBoundaries_SHP_CSV_20251001.zip";
const LICENSE_URL = "https://creativecommons.org/licenses/by/4.0";
const OUTPUT = path.resolve(process.env.AT_STATE_BOUNDARY_OUTPUT?.trim() || "data/atc/at-state-boundary.json");
const SIMPLIFICATION_TOLERANCE_DEG = 0.00002;

function usage() { throw new Error("Usage: npm run generate:boundary:at -- /path/to/AdministrativeBoundary.shp /path/to/AB_nationalLevel.csv /path/to/AdministrativeBoundary.prj"); }
function canonicalJson(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function simplifyLine(line) {
  const squaredTolerance = SIMPLIFICATION_TOLERANCE_DEG ** 2;
  const keep = new Uint8Array(line.length);
  keep[0] = 1; keep[line.length - 1] = 1;
  const stack = [[0, line.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop();
    let furthest = -1; let maximum = squaredTolerance;
    const [ax, ay] = line[start]; const [bx, by] = line[end];
    const dx = bx - ax; const dy = by - ay; const denominator = dx * dx + dy * dy;
    for (let index = start + 1; index < end; index += 1) {
      const [px, py] = line[index];
      const fraction = denominator ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / denominator)) : 0;
      const distance = (px - (ax + fraction * dx)) ** 2 + (py - (ay + fraction * dy)) ** 2;
      if (distance > maximum) { maximum = distance; furthest = index; }
    }
    if (furthest >= 0) { keep[furthest] = 1; stack.push([start, furthest], [furthest, end]); }
  }
  return line.filter((_point, index) => keep[index]);
}

async function main() {
  const [shpPath, nationalLevelPath, prjPath] = process.argv.slice(2);
  if (!shpPath || !nationalLevelPath || !prjPath) usage();
  const nationalLevel = new Set((await fs.readFile(nationalLevelPath, "utf8")).split(/\r?\n/).slice(1).flatMap((line) => {
    const [id, level] = line.split(";");
    return level?.includes("1stOrder") && id ? [id.replaceAll('"', "")] : [];
  }));
  if (!nationalLevel.size) throw new Error("BEV national-level CSV contains no 1stOrder boundary IDs");
  const sourceCrs = (await fs.readFile(prjPath, "utf8")).trim();
  const transform = proj4(sourceCrs, "EPSG:4326");
  const source = await shapefile.open(shpPath, shpPath.replace(/\.shp$/i, ".dbf"));
  const lines = [];
  while (true) {
    const item = await source.read();
    if (item.done) break;
    const id = String(item.value.properties?.inspireId ?? "");
    if (!nationalLevel.has(id)) continue;
    if (item.value.geometry?.type !== "LineString" || !Array.isArray(item.value.geometry.coordinates)) throw new Error(`BEV feature ${id} is not a LineString`);
    const line = item.value.geometry.coordinates.map((coordinate) => {
      if (!Array.isArray(coordinate) || coordinate.length !== 2 || !Number.isFinite(coordinate[0]) || !Number.isFinite(coordinate[1])) throw new Error(`BEV feature ${id} contains invalid coordinates`);
      const transformed = transform.forward(coordinate);
      return [Number(transformed[0].toFixed(8)), Number(transformed[1].toFixed(8))];
    });
    if (line.length < 2) throw new Error(`BEV feature ${id} has fewer than two vertices`);
    lines.push({ id, line: simplifyLine(line) });
  }
  lines.sort((left, right) => left.id.localeCompare(right.id));
  if (lines.length < 100) throw new Error(`Only ${lines.length} BEV national boundary segments found; refusing artifact generation`);
  const coordinates = lines.map(({ line }) => line);
  const flat = coordinates.flat();
  const bbox = flat.reduce((result, [lon, lat]) => [Math.min(result[0], lon), Math.min(result[1], lat), Math.max(result[2], lon), Math.max(result[3], lat)], [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY]);
  const artifact = { schemaVersion: 1, countryCode: "AT", source: { publisher: "Bundesamt für Eich- und Vermessungswesen (BEV)", dataset: "Verwaltungsgrenzen (VGD) INSPIRE Stichtag 01.10.2025", datasetIdentifier: DATASET_IDENTIFIER, datasetDate: DATASET_DATE, metadataUrl: METADATA_URL, downloadUrl: DOWNLOAD_URL, license: "CC BY 4.0", licenseUrl: LICENSE_URL, attribution: "© Bundesamt für Eich- und Vermessungswesen (BEV), BEV Open Data – Verwaltungsgrenzen", sourceCrs: "EPSG:3416", targetCrs: "EPSG:4326" }, transformation: { targetCrs: "EPSG:4326", tool: "proj4", derived: true, filter: "AB_nationalLevel = 1stOrder", simplificationToleranceDegrees: SIMPLIFICATION_TOLERANCE_DEG, changed: "Reprojected source coordinates, normalized line precision to 8 decimal places and simplified with endpoint-preserving Douglas-Peucker." }, geometry: { type: "MultiLineString", coordinates }, bbox, featureCount: lines.length, vertexCount: flat.length };
  const content = canonicalJson(artifact);
  const checksum = createHash("sha256").update(content).digest("hex");
  artifact.source.checksum = checksum;
  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, canonicalJson(artifact), "utf8");
  console.log(`Wrote ${OUTPUT}`);
  console.log(`Segments: ${lines.length}; vertices: ${flat.length}; bbox: ${bbox.join(",")}`);
  console.log(`Checksum: ${checksum}`);
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
