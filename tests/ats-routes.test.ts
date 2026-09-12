import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/ats/routes/route";
import { clearCzAtsRouteCache, loadCzAtsRoutes } from "@/lib/ats/cz-routes";
import { createCzAtsGeoJSON } from "@/lib/ats/geojson";

const originalPath = process.env.ATS_CZ_ROUTES_PATH;
const originalSkPath = process.env.ATS_SK_ROUTES_PATH;
const originalAtPath = process.env.ATS_AT_ROUTES_PATH;
beforeEach(() => {
  process.env.ATS_SK_ROUTES_PATH = path.join(os.tmpdir(), `airradar-no-such-sk-routes-${process.pid}.json`);
  process.env.ATS_AT_ROUTES_PATH = path.join(os.tmpdir(), `airradar-no-such-at-routes-${process.pid}.json`);
});
afterEach(() => {
  if (originalPath === undefined) delete process.env.ATS_CZ_ROUTES_PATH; else process.env.ATS_CZ_ROUTES_PATH = originalPath;
  if (originalSkPath === undefined) delete process.env.ATS_SK_ROUTES_PATH; else process.env.ATS_SK_ROUTES_PATH = originalSkPath;
  if (originalAtPath === undefined) delete process.env.ATS_AT_ROUTES_PATH; else process.env.ATS_AT_ROUTES_PATH = originalAtPath;
  clearCzAtsRouteCache();
});
const validFixturePath = fileURLToPath(new URL("./fixtures/ats/cz-routes-valid.json", import.meta.url));
function useDataset(file: string): void {
  process.env.ATS_CZ_ROUTES_PATH = file;
  clearCzAtsRouteCache();
}

describe("CZ ATS routes", () => {
  it("loads the published dataset and keeps discontinuities out of geometry", async () => {
    useDataset(validFixturePath);
    const document = loadCzAtsRoutes();
    expect(document?.counts).toMatchObject({ routes: 2, segments: 3, discontinuities: 1 });
    expect(document?.routes.every((route) => route.segments.every((segment) => segment.availabilityStatus === "UNKNOWN"))).toBe(true);
    const geojson = createCzAtsGeoJSON(document!);
    expect(geojson.segments.features).toHaveLength(3);
    expect(geojson.segments.features.every((feature) => feature.geometry.coordinates.length === 2)).toBe(true);
  });

  it("serves route metadata for the map and detail", async () => {
    useDataset(validFixturePath);
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.available).toBe(true);
    expect(body.source).toMatchObject({ effectiveDate: "2026-09-03", aipAmendment: "10/26", airacAmendment: "7/26" });
    expect(body.routes[0].segments[0]).toHaveProperty("availabilityStatus", "UNKNOWN");
  });

  it("fails closed for a missing dataset", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "airradar-ats-"));
    useDataset(path.join(directory, "missing.json"));
    expect(loadCzAtsRoutes()).toBeNull();
  });

  it("fails closed for invalid JSON/schema", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "airradar-ats-"));
    const invalidPath = path.join(directory, "invalid.json");
    fs.writeFileSync(invalidPath, "{\"schemaVersion\":99}");
    useDataset(invalidPath);
    expect(loadCzAtsRoutes()).toBeNull();
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ available: false, status: "unavailable" });
  });

  it("returns cache headers and a controlled unavailable response", async () => {
    useDataset(path.join(os.tmpdir(), `airradar-no-such-routes-${process.pid}.json`));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toContain("stale-while-revalidate");
    expect(await response.json()).toMatchObject({ available: false, status: "unavailable" });
  });
});
