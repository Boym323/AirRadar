import { readFileSync } from "node:fs";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Airport } from "@/lib/airports/types";

let AirportWeatherDisclosure: typeof import("@/components/airport-weather")["AirportWeatherDisclosure"];

const airport: Airport = {
  icaoCode: "LKPR",
  iataCode: "PRG",
  name: "Václav Havel Airport Prague",
  city: "Prague",
  country: "Czechia",
  latitude: 50.1,
  longitude: 14.26,
};

const componentSource = readFileSync(new URL("../components/airport-weather.tsx", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

afterEach(() => {
  vi.restoreAllMocks();
});

beforeAll(async () => {
  vi.stubGlobal("React", React);
  ({ AirportWeatherDisclosure } = await import("@/components/airport-weather"));
});

describe("airport weather disclosure", () => {
  it("starts collapsed and does not fetch weather during ordinary render", () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("weather fetch must be explicit"));
    const markup = renderToStaticMarkup(createElement(AirportWeatherDisclosure, { airport }));

    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('aria-controls="airport-weather-lkpr"');
    expect(markup).toContain("weather-toggle");
    expect(markup).not.toContain("weather-content");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps disclosure, missing-weather, and lazy-load behavior in the component contract", () => {
    expect(componentSource).toContain("aria-expanded={open}");
    expect(componentSource).toContain("aria-controls={panelId}");
    expect(componentSource).toContain("const nextOpen = !open;");
    expect(componentSource).toContain("setOpen(nextOpen);");
    expect(componentSource).toContain("if (nextOpen && !requested) void loadWeather();");
    expect(componentSource).toContain("{!metar && !taf && <div className=\"weather-unavailable\">");
    expect(componentSource).toContain('<details className="weather-raw">');
    expect(componentSource).toContain("<summary>");
  });

  it("batches destination-first route weather and aborts stale selections", () => {
    expect(componentSource).toContain("/api/weather/airport?icao=");
    expect(componentSource).toContain("const controller = new AbortController();");
    expect(componentSource).toContain("controller.abort();");
    expect(componentSource).toContain("[destinationAirport, originAirport]");
  });

  it("keeps raw METAR/TAF text safely wrappable on narrow layouts", () => {
    const rawTextRule = stylesSource.match(/\.weather-raw pre\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(rawTextRule).toContain("white-space: pre-wrap");
    expect(rawTextRule).toContain("overflow-wrap: anywhere");
    expect(rawTextRule).toContain("word-break: break-word");
  });
});
