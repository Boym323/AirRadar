import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getTranslations } from "@/lib/i18n";

const page = readFileSync(new URL("../components/system-status-page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

describe("System status V4 visual hierarchy", () => {
  it("keeps all diagnostics under four semantically labelled operational groups", () => {
    const sections = [
      "system-runtime",
      "system-reception",
      "system-data",
      "system-services",
    ] as const;
    expect(page.match(/<SystemSection id="system-/g)).toHaveLength(4);
    for (const section of sections) {
      expect(page).toContain('id="' + section + '"');
      expect(page).toContain('href: "#' + section + '"');
    }
    expect(page).toContain("aria-labelledby={id + \"-heading\"}");
    expect(page).toContain("system-section-grid");
  });

  it("keeps true outages prominent without mislabelling disabled/on-demand services", () => {
    expect(page).toContain('service.status === "degraded" || service.status === "offline"');
    expect(page).toContain("if (!issues.length) return null");
    expect(page).toContain("aria-label={dictionary.system.attentionTitle}");
    expect(page).toContain("<HealthSummary");
    expect(page).toContain("<SystemAttention");
  });

  it("has Czech/English section labels, accessible anchors and 320px-friendly layout", () => {
    for (const locale of ["cs", "en"] as const) {
      const system = getTranslations(locale).system;
      expect(system.sectionRuntime.length).toBeGreaterThan(0);
      expect(system.sectionReception.length).toBeGreaterThan(0);
      expect(system.sectionData.length).toBeGreaterThan(0);
      expect(system.sectionServices.length).toBeGreaterThan(0);
      expect(system.attentionTitle.length).toBeGreaterThan(0);
    }
    expect(css).toContain(".system-section-grid");
    expect(css).toContain("grid-template-columns: 1fr;");
    expect(css).toContain(".system-jump-nav a:focus-visible");
    expect(css).toContain("@media (max-width: 600px)");
  });
});
