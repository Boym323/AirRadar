import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { discoverAustroControlPublications, parseAustrianAltitude, parseAustrianEnr21 } from "@/lib/atc/austro-control";
import { AustrianBevBoundaryProvider, BEV_AUSTRIAN_BOUNDARY_SOURCE } from "@/lib/atc/austrian-boundary";
import { parseAustrianEnr31Or33 } from "@/lib/ats/at-eaip-routes";

const publicationMenu = `
<table><tr class="current"><td>04 SEP 2026</td><td>30 SEP 2026</td><td><a href="./lo/260904/index.htm">current</a></td></tr>
<tr class="future"><td>01 OCT 2026</td><td>UFN</td><td><a href="./lo/261001/index.htm">future</a></td></tr></table>`;

describe("Austro Control publication discovery", () => {
  it("selects the September publication before the AIRAC rollover", () => {
    const result = discoverAustroControlPublications(publicationMenu, new Date("2026-09-12T12:00:00Z"));
    expect(result.current?.effectiveFrom).toBe("2026-09-04");
    expect(result.current?.effectiveUntil).toBe("2026-10-01");
    expect(result.future?.effectiveFrom).toBe("2026-10-01");
  });

  it("selects the October publication at the rollover", () => {
    const result = discoverAustroControlPublications(publicationMenu, new Date("2026-10-01T00:00:00Z"));
    expect(result.current?.effectiveFrom).toBe("2026-10-01");
    expect(result.future).toBeNull();
  });
});

describe("Austrian AIP semantics", () => {
  it("preserves NIL as a healthy zero-route dataset", () => {
    expect(parseAustrianEnr31Or33("ENR 3.1 Conventional navigation routes NIL", "ENR 3.1").diagnostic.status).toBe("healthy-zero");
    expect(parseAustrianEnr31Or33("ENR 3.3 Other specifically designated routes NIL FRA", "ENR 3.3").routes).toHaveLength(0);
  });

  it("keeps conditional vertical limits in source remarks", () => {
    expect(parseAustrianAltitude("FL245")).toBe("FL245");
    expect(parseAustrianAltitude("1000 FT AGL")).toBe("1000 AGL");
    const result = parseAustrianEnr21("TMA LOWG 1 47 09 16.0000N 015 20 34.0000E - 47 09 53.0000N 015 25 42.0000E - 47 08 50.0000N 015 29 25.0000E - 47 09 16.0000N 015 20 34.0000E FL245 / 2500 FT AMSL but at least 1000 FT AGL [C]: FL245 / FL195 [D]: FL195 / 2500 FT AMSL", { effectiveDate: "2026-09-04", sourceReference: "https://eaip.austrocontrol.at/lo/260904/PART_2/LO_ENR_2_1_en.pdf" });
    expect(result.diagnostics[0]?.status).toBe("accepted");
    expect(result.document.sectors[0]?.remarks).toContain("Vertical limits");
  });
});

describe("BEV Austrian boundary artifact", () => {
  it("contains explicit provenance and resolves an AIP boundary endpoint", () => {
    const artifact = JSON.parse(fs.readFileSync("data/atc/at-state-boundary.json", "utf8")) as { source: Record<string, unknown>; geometry: { type: string; coordinates: unknown[] }; bbox: number[] };
    expect(artifact.source.publisher).toContain("Bundesamt für Eich- und Vermessungswesen");
    expect(artifact.source.license).toBe("CC BY 4.0");
    expect(artifact.source.sourceCrs).toBe("EPSG:3416");
    expect(artifact.source.targetCrs).toBe("EPSG:4326");
    expect(artifact.geometry.type).toBe("MultiLineString");
    expect(artifact.geometry.coordinates.length).toBeGreaterThan(100);
    expect(artifact.bbox).toEqual([9.53074891, 46.37230954, 17.1607732, 49.02052551]);
    const provider = new AustrianBevBoundaryProvider();
    provider.load();
    const resolution = provider.getBoundarySegment({ kind: "austrian-border", neighbour: "DE" }, { start: [13.839565, 48.77162], end: [13.839565, 48.77162], hint: "FIR WIEN" });
    expect(resolution.provider).toBe(BEV_AUSTRIAN_BOUNDARY_SOURCE);
    expect(resolution.startSnapDistanceKm).toBeLessThan(5);
  });
});
