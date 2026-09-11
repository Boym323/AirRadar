import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/ats/routes/route";
import { clearCzAtsRouteCache, loadCzAtsRoutes } from "@/lib/ats/cz-routes";
import { createCzAtsGeoJSON } from "@/lib/ats/geojson";

const originalPath = process.env.ATS_CZ_ROUTES_PATH;
afterEach(() => { if (originalPath === undefined) delete process.env.ATS_CZ_ROUTES_PATH; else process.env.ATS_CZ_ROUTES_PATH = originalPath; clearCzAtsRouteCache(); });

describe("CZ ATS routes", () => {
  it("loads the published dataset and keeps discontinuities out of geometry", async () => {
    delete process.env.ATS_CZ_ROUTES_PATH;
    const document = loadCzAtsRoutes();
    expect(document?.counts).toMatchObject({ routes: 33, segments: 73, discontinuities: 4 });
    expect(document?.routes.every((route) => route.segments.every((segment) => segment.availabilityStatus === "UNKNOWN"))).toBe(true);
    const geojson = createCzAtsGeoJSON(document!);
    expect(geojson.segments.features).toHaveLength(73);
    expect(geojson.segments.features.every((feature) => feature.geometry.coordinates.length === 2)).toBe(true);
  });

  it("serves route metadata for the map and detail", async () => {
    delete process.env.ATS_CZ_ROUTES_PATH;
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.available).toBe(true);
    expect(body.source).toMatchObject({ effectiveDate: "2026-09-03", aipAmendment: "10/26", airacAmendment: "7/26" });
    expect(body.routes[0].segments[0]).toHaveProperty("availabilityStatus", "UNKNOWN");
  });

  it("fails closed for missing and invalid datasets", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "airradar-ats-"));
    process.env.ATS_CZ_ROUTES_PATH = path.join(directory, "missing.json");
    expect(loadCzAtsRoutes()).toBeNull();
    fs.writeFileSync(process.env.ATS_CZ_ROUTES_PATH, JSON.stringify({ schemaVersion: 99 }));
    clearCzAtsRouteCache();
    expect(loadCzAtsRoutes()).toBeNull();
  });

  it("returns cache headers and a controlled unavailable response", async () => {
    process.env.ATS_CZ_ROUTES_PATH = path.join(os.tmpdir(), "airradar-no-such-routes.json");
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toContain("stale-while-revalidate");
    expect(await response.json()).toMatchObject({ available: false, status: "unavailable" });
  });
});
