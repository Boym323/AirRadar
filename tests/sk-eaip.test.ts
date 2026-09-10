import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { parseSkEaipEnr21, skEaipEffectiveDateFromUrl, skEaipUrlCandidates, skSectorId } from "@/lib/atc/sk-eaip";
import type { StateBoundaryInput, StateBoundaryProvider, StateBoundaryResolution } from "@/lib/atc/cz-boundary";
import type { Coordinate } from "@/lib/atc/types";

const fixture = readFileSync(new URL("./fixtures/sk-eaip-enr21.html", import.meta.url), "utf8");
const sourceReference = "https://aim.lps.sk/web/eAIP_SR/AIP_SR_EFF_03SEP2026/html/LZ-ENR-2.1-en-SK.html";

function fakeBoundaryProvider(): StateBoundaryProvider {
  return {
    getBoundarySegment: vi.fn(({ start, end }: StateBoundaryInput): StateBoundaryResolution => {
      const middle: Coordinate = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
      return {
        coordinates: [start, middle, end],
        startSnapDistanceKm: 0.05,
        endSnapDistanceKm: 0.06,
        pathLengthKm: 20,
        vertexCount: 3,
        maxSegmentLengthKm: 10,
        featureIds: ["fixture-border"],
        provider: "fixture",
      };
    }),
  };
}

describe("Slovak eAIP ENR 2.1 parser", () => {
  it("imports direct Slovak TMA geometry, vertical limits, callsign and working VHF frequencies", () => {
    const result = parseSkEaipEnr21(fixture, {
      sourceReference,
      effectiveDate: "2026-09-03",
      boundaryProvider: fakeBoundaryProvider(),
      verifiedAt: new Date("2026-09-10T20:00:00Z"),
    });
    const zilina = result.document.sectors.find((sector) => sector.id === "SK-ZILINA-TMA-3");
    expect(zilina).toMatchObject({
      name: "ŽILINA TMA 3",
      country: "SK",
      service: "TWR",
      atcCallsign: "ŽILINA TOWER",
      lowerAltitude: 7500,
      upperAltitude: 9500,
      primaryFrequencyMhz: 124.155,
      validFrom: "2026-09-03",
      validTo: null,
    });
    expect(zilina?.alternateFrequencies).toEqual([
      { frequencyMhz: 118.405 },
    ]);
    expect([
      zilina?.primaryFrequencyMhz,
      ...(zilina?.alternateFrequencies ?? []).map((item) => item.frequencyMhz),
    ]).not.toContain(121.5);
    expect(zilina?.polygons[0][0]).toEqual(zilina?.polygons[0].at(-1));
    expect(result.document.source).toMatchObject({ name: "Slovak eAIP", reference: sourceReference, effectiveDate: "2026-09-03" });
    expect(result.document.transmitters).toEqual([]);
  });

  it("uses an injected authoritative boundary provider for published state-boundary segments", () => {
    const boundaryProvider = fakeBoundaryProvider();
    const result = parseSkEaipEnr21(fixture, {
      sourceReference,
      effectiveDate: "2026-09-03",
      boundaryProvider,
      verifiedAt: new Date("2026-09-10T20:00:00Z"),
    });
    const diagnostic = result.diagnostics.find((item) => item.name === "ŽILINA TMA 2");
    expect(diagnostic).toMatchObject({ status: "accepted", geometry: "state-boundary" });
    expect(diagnostic?.boundaryResolutions).toHaveLength(1);
    expect(boundaryProvider.getBoundarySegment).toHaveBeenCalledTimes(1);
    expect(result.document.sectors.some((sector) => sector.id === "SK-ZILINA-TMA-2")).toBe(true);
  });

  it("fails closed on ambiguous circular-arc geometry instead of drawing a guessed line", () => {
    const result = parseSkEaipEnr21(fixture, {
      sourceReference,
      effectiveDate: "2026-09-03",
      boundaryProvider: fakeBoundaryProvider(),
    });
    expect(result.document.sectors.some((sector) => sector.id === "SK-PIESTANY-TMA-1")).toBe(false);
    expect(result.diagnostics.find((item) => item.name === "PIEŠŤANY TMA 1")).toMatchObject({
      status: "skipped",
      geometry: "unsupported",
      reason: expect.stringContaining("circular arc"),
    });
  });

  it("fails closed on state-boundary rows when no authoritative provider is available", () => {
    const result = parseSkEaipEnr21(fixture, { sourceReference, effectiveDate: "2026-09-03" });
    expect(result.document.sectors.some((sector) => sector.id === "SK-ZILINA-TMA-2")).toBe(false);
    expect(result.diagnostics.find((item) => item.name === "ŽILINA TMA 2")?.reason).toContain("authoritative boundary provider");
  });

  it("creates stable ASCII IDs and derives the effective date only from the official host", () => {
    expect(skSectorId("ŽILINA TMA 3")).toBe("SK-ZILINA-TMA-3");
    expect(skSectorId("KOŠICE TMA 1A")).toBe("SK-KOSICE-TMA-1A");
    expect(skEaipEffectiveDateFromUrl(sourceReference)).toBe("2026-09-03");
    expect(skEaipEffectiveDateFromUrl(sourceReference.replace("aim.lps.sk", "example.com"))).toBeNull();
  });

  it("discovers the current AIRAC publication first and keeps bounded previous-cycle fallbacks", () => {
    const candidates = skEaipUrlCandidates(new Date("2026-09-10T12:00:00Z"));
    expect(candidates[0]).toBe(sourceReference);
    expect(candidates).toHaveLength(8);
    expect(candidates.every((candidate) => candidate.startsWith("https://aim.lps.sk/web/eAIP_SR/"))).toBe(true);
  });
});
