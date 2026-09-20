import { describe, expect, it } from "vitest";
import { frequencyLabel } from "@/lib/server/sector-traffic-context";

describe("ATC frequency spacing provenance", () => {
  it("preserves an explicitly authoritative 25 kHz spacing", () => {
    expect(frequencyLabel({ frequencyMhz: 118.1, label: "118.100", isPrimary: true, spacing: "KHZ_25" })).toMatchObject({ spacing: "KHZ_25" });
  });

  it("preserves an explicitly authoritative 8.33 kHz channel", () => {
    expect(frequencyLabel({ frequencyMhz: 118.005, label: "118.005", isPrimary: true, spacing: "KHZ_8_33" })).toMatchObject({ channel: "118.005", spacing: "KHZ_8_33" });
  });

  it("does not infer spacing from a frequency when the source is silent", () => {
    expect(frequencyLabel({ frequencyMhz: 118.005, label: null, isPrimary: true })).toMatchObject({ channel: "118.005", spacing: "UNKNOWN" });
  });
});
