import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getTranslations } from "@/lib/i18n";
import { RouteEnrichmentPanel } from "@/components/route-enrichment-panel";
import { RouteEnrichmentTelemetry } from "@/lib/server/route-enrichment-telemetry";

describe("Route Enrichment system dashboard", () => {
  it("renders localized real counters and exactly 24 time buckets", () => {
    const at = Date.parse("2026-10-10T14:10:00Z");
    const telemetry = new RouteEnrichmentTelemetry(null, () => at);
    telemetry.record("ramHit", 4);
    telemetry.record("dbHit", 2);
    telemetry.record("dbMiss", 1);
    telemetry.record("adsbdbLookup");
    telemetry.record("adsblolBatch");
    telemetry.record("adsblolLookup", 3);
    telemetry.setValidEntries(14);
    const status = telemetry.getSnapshot();
    const cs = renderToStaticMarkup(<RouteEnrichmentPanel metrics={status} dictionary={getTranslations("cs")} />);
    expect(cs).toContain("Route Enrichment");
    expect(cs).toContain("PostgreSQL");
    expect(cs).toContain("Platné trasy");
    expect(cs).toContain("Vynechané lookupy");
    expect(cs).toContain("6");
    expect((cs.match(/role="img"/g) ?? [])).toHaveLength(24);
    const en = renderToStaticMarkup(<RouteEnrichmentPanel metrics={status} dictionary={getTranslations("en")} />);
    expect(en).toContain("Avoided lookups");
    expect(en).toContain("DB hit rate");
  });
});
