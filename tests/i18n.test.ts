import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_LOCALE,
  aircraftCount,
  formatDateTime,
  formatNumber,
  getTranslations,
} from "@/lib/i18n";

describe("localization", () => {
  it("uses Czech as the default locale", () => {
    expect(DEFAULT_LOCALE).toBe("cs");
    expect(getTranslations().radar.aircraftNearby).toBe("Letadla v okolí");
    expect(getTranslations("en").radar.aircraftNearby).toBe("Aircraft nearby");
    expect(getTranslations("de").radar.aircraftNearby).toBe("Letadla v okolí");
  });

  it("uses Czech aircraft plural forms", () => {
    expect(aircraftCount(0)).toBe("0 letadel");
    expect(aircraftCount(1)).toBe("1 letadlo");
    expect(aircraftCount(2)).toBe("2 letadla");
    expect(aircraftCount(4)).toBe("4 letadla");
    expect(aircraftCount(5)).toBe("5 letadel");
    expect(aircraftCount(21)).toBe("21 letadel");
    expect(aircraftCount(22)).toBe("22 letadel");
  });

  it("uses invariant English aircraft wording", () => {
    const english = getTranslations("en");
    expect(aircraftCount(0, english)).toBe("0 aircraft");
    expect(aircraftCount(1, english)).toBe("1 aircraft");
    expect(aircraftCount(2, english)).toBe("2 aircraft");
  });

  it("uses the shared aircraft formatter in the ATC panel", () => {
    const source = readFileSync(fileURLToPath(new URL("../components/atc-sector-traffic-panels.tsx", import.meta.url)), "utf8");
    expect(source).toContain("aircraftCount(item.traffic.aircraftCount)");
    expect(source).not.toContain("t.atc.aircraft.toLowerCase()");
  });

  it("formats numbers and invalid dates for the UI locale", () => {
    expect(formatNumber(1234.5, 1)).toBe("1 234,5");
    expect(formatDateTime("not-a-date")).toBe("—");
  });

  it("labels ATC matches as probable and disclaims the tuned frequency", () => {
    expect(getTranslations().atc.probableRelevant).toContain("Pravděpodobně relevantní");
    expect(getTranslations().atc.probableFrequency).toContain("naladěnou");
    expect(getTranslations().atc.relevantDisclaimer).toContain("ADS-B nehlásí");
    expect(getTranslations("en").atc.probableFrequency).toContain("tuned ATC frequency");
    expect(getTranslations("en").atc.relevantDisclaimer).toContain("actually tuned");
  });

  it("labels all dynamic route phases in Czech and English", () => {
    expect(getTranslations().routeIntelligence).toMatchObject({
      departure: "Odlet",
      enRoute: "Na trati",
      arrival: "Přílet",
    });
    expect(getTranslations("en").routeIntelligence).toMatchObject({
      departure: "Departure",
      enRoute: "En route",
      arrival: "Arrival",
    });
  });

  it("provides aircraft detail v2 copy in Czech and English", () => {
    expect(getTranslations().history.recentFlights).toBe("Poslední lety");
    expect(getTranslations().history.aircraftHistory).toBe("Historie letadla");
    expect(getTranslations().aircraft.notCurrentlyInRange).toBe("Nyní není v dosahu");
    expect(getTranslations("en").history.recentFlights).toBe("Recent flights");
    expect(getTranslations("en").history.aircraftHistory).toBe("Aircraft history");
    expect(getTranslations("en").aircraft.notCurrentlyInRange).toBe("Not currently in range");
  });
});
