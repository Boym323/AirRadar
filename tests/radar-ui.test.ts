import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getTranslations } from "@/lib/i18n";
import {
  AIRPORT_VISIBILITY_ZOOM,
  airportVisibilityFilter,
  airportVisibilityTier,
  airportVisibleAtZoom,
  DEFAULT_AIRPORT_LAYER_VISIBILITY,
} from "@/lib/airport-visibility";
import { aircraftMarkerClassNames } from "@/lib/radar-ui";

const appSource = readFileSync(new URL("../components/airradar-app.tsx", import.meta.url), "utf8");
const atcSource = readFileSync(new URL("../components/relevant-atc-panel.tsx", import.meta.url), "utf8");

describe("radar UI polish helpers", () => {
  it("changes airport visibility deterministically by zoom", () => {
    expect(airportVisibleAtZoom("significant", 3)).toBe(true);
    expect(airportVisibleAtZoom("small", AIRPORT_VISIBILITY_ZOOM.small - 0.1)).toBe(false);
    expect(airportVisibleAtZoom("small", AIRPORT_VISIBILITY_ZOOM.small)).toBe(true);
    expect(airportVisibleAtZoom("heliport", AIRPORT_VISIBILITY_ZOOM.heliport - 0.1)).toBe(false);
    expect(airportVisibleAtZoom("heliport", AIRPORT_VISIBILITY_ZOOM.heliport)).toBe(false);
    expect(airportVisibleAtZoom("heliport", AIRPORT_VISIBILITY_ZOOM.heliport, { ...DEFAULT_AIRPORT_LAYER_VISIBILITY, showHeliports: true })).toBe(true);
    expect(airportVisibilityFilter(7.4)).toEqual(airportVisibilityFilter(7.4));
  });

  it("uses only safe DTO signals for airport prominence", () => {
    expect(airportVisibilityTier({ iataCode: "PRG", name: "Prague" })).toBe("significant");
    expect(airportVisibilityTier({ iataCode: null, name: "Small strip" })).toBe("small");
    expect(airportVisibilityTier({ iataCode: null, name: "City Helipad" })).toBe("heliport");
  });

  it("keeps selected, watchlisted and emergency aircraft visually distinct", () => {
    expect(aircraftMarkerClassNames({ selected: true, watchlisted: true, emergency: true })).toEqual([
      "aircraft-marker",
      "selected",
      "watchlisted",
      "emergency",
    ]);
  });

  it("keeps ATC collapsed/expanded state accessible and mobile-collapsed by default", () => {
    expect(atcSource).toContain("aria-expanded={expanded}");
    expect(appSource).toContain("expanded={!mobileCompact}");
    expect(appSource).toContain("const [mobileCompact, setMobileCompact] = useState(true)");
  });

  it("exposes the layer state and does not add a UI network request", () => {
    expect(appSource).toContain("checked={showAircraft}");
    expect(appSource).toContain("checked={showAirports}");
    expect(appSource).toContain("checked={showAtc}");
    expect(appSource.match(/\bfetch\(/g)).toHaveLength(3);
  });

  it("keeps CZ and EN layer labels in the existing i18n dictionaries", () => {
    expect(getTranslations("cs").layers).toMatchObject({ aircraft: "Letadla", airports: "Letiště", atc: "ATC", heliports: "Heliporty" });
    expect(getTranslations("en").layers).toMatchObject({ aircraft: "Aircraft", airports: "Airports", atc: "ATC", heliports: "Heliports" });
  });
});
