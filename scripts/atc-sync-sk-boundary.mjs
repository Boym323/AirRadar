#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import proj4 from "proj4";

const SOURCE_URL = "https://opendata.skgeodesy.sk/static/ZBGIS/usj/ah_gpkg_0_sjtsk03.zip";
const DATASET_DATE = "2026-06-30";
const SOURCE_CRS = "+proj=krovak +lat_0=49.5 +lon_0=24.8333333333333 +alpha=30.2881397527778 +k=0.9999 +x_0=0 +y_0=0 +ellps=bessel +towgs84=485.021,169.465,483.839,-7.786342,-4.397554,-4.102655,0 +units=m +no_defs +type=crs";
const TARGET_CRS = "EPSG:4326";
const input = process.argv[2];
const output = process.argv[3] ?? "data/atc/sk-state-boundary.json";
if (!input) throw new Error("Usage: node scripts/atc-sync-sk-boundary.mjs <USJ_hranice_0.gpkg> [output.json]");

function readWkb(buffer, offset = 0) {
  const little = buffer[offset] === 1;
  const read32 = (at) => little ? buffer.readUInt32LE(at) : buffer.readUInt32BE(at);
  const read64 = (at) => little ? buffer.readDoubleLE(at) : buffer.readDoubleBE(at);
  const rawType = read32(offset + 1);
  const flaggedType = rawType & 0x0fffffff;
  const type = flaggedType >= 1000 ? flaggedType - 1000 : flaggedType;
  const hasZ = Boolean(rawType & 0x80000000) || (flaggedType >= 1000 && flaggedType < 2000);
  let cursor = offset + 5;
  if (type !== 6) throw new Error(`Expected MULTIPOLYGON WKB, got type ${rawType}`);
  const polygons = [];
  const polygonCount = read32(cursor); cursor += 4;
  for (let polygonIndex = 0; polygonIndex < polygonCount; polygonIndex += 1) {
    if (buffer[cursor] !== 1) throw new Error("Mixed-endian WKB is not supported");
    const polygonType = buffer.readUInt32LE(cursor + 1); cursor += 5;
    const polygonBaseType = polygonType & 0x0fffffff;
    if (polygonBaseType !== 3 && polygonBaseType !== 1003) throw new Error(`Expected POLYGON WKB, got type ${polygonType}`);
    const rings = [];
    const ringCount = buffer.readUInt32LE(cursor); cursor += 4;
    for (let ringIndex = 0; ringIndex < ringCount; ringIndex += 1) {
      const pointCount = buffer.readUInt32LE(cursor); cursor += 4;
      const ring = [];
      for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
        const x = read64(cursor); const y = read64(cursor + 8); cursor += hasZ ? 24 : 16;
        ring.push([x, y]);
      }
      rings.push(ring);
    }
    polygons.push(rings);
  }
  return polygons;
}

function transform(polygons) {
  return polygons.map((rings) => rings.map((ring) => ring.map(([x, y]) => {
    const [longitude, latitude] = proj4(SOURCE_CRS, TARGET_CRS, [x, y]);
    if (![longitude, latitude].every(Number.isFinite) || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) throw new Error("ZBGIS reprojection produced invalid WGS84 coordinates");
    return [Number(longitude.toFixed(7)), Number(latitude.toFixed(7))];
  })));
}

function distanceKm(a, b) {
  const radians = (value) => value * Math.PI / 180;
  const dLat = radians(b[1] - a[1]); const dLon = radians(b[0] - a[0]);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a[1])) * Math.cos(radians(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.sqrt(Math.min(1, value)));
}

function validate(polygons) {
  for (const [index, polygon] of polygons.entries()) {
    for (const ring of polygon) {
      if (ring.length < 4 || JSON.stringify(ring[0]) !== JSON.stringify(ring.at(-1))) throw new Error(`ZBGIS polygon ${index} has an open ring`);
      if (ring.slice(1).some((coordinate, pointIndex) => distanceKm(ring[pointIndex], coordinate) > 25)) throw new Error(`ZBGIS polygon ${index} contains a giant segment`);
    }
    const signedArea = polygon[0].slice(1).reduce((sum, coordinate, pointIndex) => sum + (polygon[0][pointIndex][0] * coordinate[1] - coordinate[0] * polygon[0][pointIndex][1]), 0);
    if (!Number.isFinite(signedArea) || signedArea === 0) throw new Error(`ZBGIS polygon ${index} has zero-area geometry`);
  }
}

const sourceBytes = await import("node:fs/promises").then(({ readFile }) => readFile(input));
const sourceChecksum = createHash("sha256").update(sourceBytes).digest("hex");
const db = new DatabaseSync(input, { readOnly: true });
const row = db.prepare("SELECT SHAPE, DOW, NM1, VYMERA FROM sr_0 WHERE NM1 = 'Slovenská republika' LIMIT 1").get();
if (!row?.SHAPE) throw new Error("ZBGIS sr_0 national polygon was not found");
const polygons = transform(readWkb(Buffer.from(row.SHAPE), 8));
validate(polygons);
const coordinates = polygons.flat(2);
const longitudes = coordinates.map(([x]) => x); const latitudes = coordinates.map(([, y]) => y);
const bbox = [Math.min(...longitudes), Math.min(...latitudes), Math.max(...longitudes), Math.max(...latitudes)];
if (bbox[0] < 15 || bbox[2] > 23 || bbox[1] < 47 || bbox[3] > 50) throw new Error(`ZBGIS national polygon has implausible Slovakia bbox ${bbox.join(",")}`);
const payload = { schemaVersion: 1, source: { provider: "GKÚ Bratislava / ZBGIS", dataset: "ZBGIS - Administratívne hranice, základná úroveň", datasetDate: DATASET_DATE, sourceUrl: SOURCE_URL, sourceCrs: "EPSG:8353", targetCrs: TARGET_CRS, license: "CC BY 4.0", sourceChecksum, downloadedAt: new Date().toISOString() }, geometry: { type: polygons.length === 1 ? "Polygon" : "MultiPolygon", coordinates: polygons.length === 1 ? polygons[0] : polygons }, bbox, areaM2: row.VYMERA, name: row.NM1, sourceDow: row.DOW };
await writeFile(output, `${JSON.stringify(payload)}\n`, "utf8");
console.log(`Wrote ${output}: ${payload.geometry.type}, ${coordinates.length} vertices, bbox ${bbox.join(",")}, source CRS EPSG:8353, target CRS EPSG:4326`);
