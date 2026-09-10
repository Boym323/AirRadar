import { readFileSync } from "node:fs";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Airport } from "@/lib/airports/types";
import { resolveAirportDetail } from "@/lib/server/airport-detail";
import type { AirportInfrastructure } from "@/lib/airports/infrastructure";

const pageSource = readFileSync(new URL("../app/airports/[icao]/page.tsx", import.meta.url), "utf8");
const detailSource = readFileSync(new URL("../components/airport-detail.tsx", import.meta.url), "utf8");
const weatherSource = readFileSync(new URL("../components/airport-weather.tsx", import.meta.url), "utf8");
const radarSource = readFileSync(new URL("../components/airradar-app.tsx", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

const prague: Airport = {
  icaoCode: "LKPR",
  iataCode: "PRG",
  name: "Václav Havel Airport Prague",
  city: "Prague",
  country: "Czechia",
  latitude: 50.1008,
  longitude: 14.26,
};

describe("airport detail V1", () => {
  beforeAll(() => { vi.stubGlobal("React", React); });

  it("resolves the LKPR detail through the central resolver", async () => {
    const resolve = vi.fn().mockResolvedValue(prague);
    await expect(resolveAirportDetail("lkpr", { resolve })).resolves.toEqual(prague);
    expect(resolve).toHaveBeenCalledWith({ icaoCode: "LKPR" });
  });

  it("renders an airport without IATA and keeps only public airport fields", async () => {
    const airport: Airport = { ...prague, icaoCode: "EDXX", iataCode: null };
    const markup = renderToStaticMarkup(createElement((await import("@/components/airport-detail")).AirportDetail, { airport }));
    expect(markup).toContain("EDXX");
    expect(markup).toContain("—");
    expect(markup).not.toContain("createdAt");
    expect(markup).not.toContain("DATABASE_URL");
  });

  it("returns null for unknown or non-ICAO detail params so the page can call notFound", async () => {
    const resolve = vi.fn().mockResolvedValue(null);
    await expect(resolveAirportDetail("ZZZZ", { resolve })).resolves.toBeNull();
    await expect(resolveAirportDetail("PRG", { resolve })).resolves.toBeNull();
    expect(pageSource).toContain("if (!airport) notFound();");
  });

  it("uses the existing weather API/cache path and tolerates every weather product state", () => {
    expect(weatherSource).toContain("/api/weather/airport/${encodeURIComponent(airport.icaoCode)}");
    expect(weatherSource).toContain("{!metar && !taf && <div className=\"weather-unavailable\">");
    expect(weatherSource).toContain("<div className=\"weather-report-heading\">{t.weather.metar}</div>");
    expect(weatherSource).toContain("<div className=\"weather-report-heading\">{t.weather.taf}</div>");
    expect(weatherSource).toContain("{metar?.rawText && <details className=\"weather-raw\">");
    expect(weatherSource).toContain("{taf.rawText && <details className=\"weather-raw\">");
    expect(detailSource).toContain("<AirportWeatherPanel airport={airport} />");
  });

  it("keeps flight-detail airport navigation, map navigation, and raw weather mobile-safe", () => {
    expect(radarSource).toContain("/airports/${encodeURIComponent(airport.icaoCode)}");
    expect(radarSource).toContain("router.push(`/airports/${encodeURIComponent(icao)}`)");
    expect(stylesSource).toContain(".airport-map { height: 360px");
    expect(stylesSource).toContain(".airport-map { height: 260px");
    expect(stylesSource).toContain("white-space: pre-wrap");
    expect(stylesSource).toContain("overflow-wrap: anywhere");
  });

  it("renders infrastructure sections and safe empty states", async () => {
    const infrastructure: AirportInfrastructure = {
      runways: [{ id: 1, airportId: 1, sourceAirportIdent: "LKPR", lengthFt: 12188, widthFt: 148, surface: "UNKNOWN", lighted: true, closed: false, leIdent: "06", leLatitude: 50.1, leLongitude: 14.2, leElevationFt: 1200, leHeadingDegT: 60, leDisplacedThresholdFt: null, heIdent: "24", heLatitude: 50.11, heLongitude: 14.21, heElevationFt: 1200, heHeadingDegT: 240, heDisplacedThresholdFt: null }],
      frequencies: [{ id: 2, airportId: 1, sourceAirportIdent: "LKPR", type: "TWR", description: "Tower", frequencyMhz: 118.705 }],
      navaids: [{ id: 3, filename: "Prague_VOR", ident: "PRG", name: "Prague", type: "VOR-DME", frequencyKhz: 115300, latitude: 50.1, longitude: 14.2, elevationFt: 1200, country: "CZ", dmeFrequencyKhz: 115300, dmeChannel: "100X", dmeLatitude: 50.1, dmeLongitude: 14.2, dmeElevationFt: 1200, slavedVariationDeg: null, magneticVariationDeg: null, usageType: "BOTH", power: "HIGH", associatedAirportId: 1, associatedAirportIdent: "LKPR" }],
    };
    const markup = renderToStaticMarkup(createElement((await import("@/components/airport-detail")).AirportDetail, { airport: prague, infrastructure }));
    expect(markup).toContain("airport-runways-title");
    expect(markup).toContain("airport-frequencies-title");
    expect(markup).toContain("airport-navaids-title");
    expect(markup).toContain("118.705 MHz");
    expect(markup).toContain("115.300 MHz");
    expect(markup).toContain("OurAirports");

    const emptyMarkup = renderToStaticMarkup(createElement((await import("@/components/airport-detail")).AirportDetail, { airport: prague }));
    expect(emptyMarkup).toContain("Nejsou k dispozici údaje o drahách");
    expect(emptyMarkup).toContain("Nejsou k dispozici údaje o frekvencích");
    expect(emptyMarkup).toContain("Nejsou k dispozici údaje o navigačních bodech");
  });
});
