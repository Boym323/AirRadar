import { describe, expect, it } from "vitest";
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
    expect(aircraftCount(1)).toBe("1 letadlo");
    expect(aircraftCount(2)).toBe("2 letadla");
    expect(aircraftCount(5)).toBe("5 letadel");
  });

  it("formats numbers and invalid dates for the UI locale", () => {
    expect(formatNumber(1234.5, 1)).toBe("1 234,5");
    expect(formatDateTime("not-a-date")).toBe("—");
  });
});
