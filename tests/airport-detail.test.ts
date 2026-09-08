import { readFileSync } from "node:fs";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Airport } from "@/lib/airports/types";
import { resolveAirportDetail } from "@/lib/server/airport-detail";

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
    expect(radarSource).toContain("window.location.assign(`/airports/${encodeURIComponent(icao)}`)");
    expect(stylesSource).toContain(".airport-map { height: 360px");
    expect(stylesSource).toContain(".airport-map { height: 260px");
    expect(stylesSource).toContain("white-space: pre-wrap");
    expect(stylesSource).toContain("overflow-wrap: anywhere");
  });
});
