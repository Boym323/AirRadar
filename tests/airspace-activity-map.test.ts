import { describe, expect, it } from "vitest";
import {
  buildAirspacePlanMapIndex,
  canonicalAirspaceDesignator,
  matchAirspacePlanForSector,
} from "@/lib/airspace-activity/map";
import type { AirspaceActivityResponse, PlannedAirspaceWindow } from "@/lib/airspace-activity/types";

function window(overrides: Partial<PlannedAirspaceWindow> = {}): PlannedAirspaceWindow {
  return {
    sequence: 1,
    designator: "TRA36",
    canonicalDesignator: "LKTRA36",
    lowerLimit: "FL125",
    upperLimit: "FL155",
    startsAt: "2026-09-11T09:00:00.000Z",
    endsAt: "2026-09-11T11:00:00.000Z",
    responsibleUnit: "LKCV",
    activity: "OAT",
    plannedNow: false,
    source: "AUP",
    sourceReference: "https://aup.rlp.cz/aup.htm",
    ...overrides,
  };
}

function activity(
  windows: PlannedAirspaceWindow[],
  status: AirspaceActivityResponse["planned"]["status"] = "ok",
): AirspaceActivityResponse {
  return {
    fetchedAt: "2026-09-11T08:30:00.000Z",
    planned: {
      status,
      validityStart: "2026-09-11T06:00:00.000Z",
      validityEnd: "2026-09-12T06:00:00.000Z",
      issuedAt: "2026-09-11T07:30:00.000Z",
      aupReference: "https://aup.rlp.cz/aup.htm",
      latestUupReference: null,
      uupCount: 0,
      fetchedAt: "2026-09-11T08:30:00.000Z",
      windows,
    },
    historicalActual: {
      status: "unavailable",
      delayed: true,
      periodStart: null,
      periodEnd: null,
      sourceReference: null,
      fetchedAt: "2026-09-11T08:30:00.000Z",
      records: [],
    },
    disclaimer: "Planned allocation is not confirmed operational activation.",
  };
}

describe("airspace activity map matching", () => {
  it("canonicalizes Czech TRA/TSA identifiers embedded in ATC names and ids", () => {
    expect(canonicalAirspaceDesignator("TRA 36")).toBe("LKTRA36");
    expect(canonicalAirspaceDesignator("cz-eaip-LKTRA36-sector")).toBe("LKTRA36");
    expect(canonicalAirspaceDesignator("LKTSA4A")).toBe("LKTSA4A");
    expect(canonicalAirspaceDesignator("LZTRA01")).toBeNull();
    expect(canonicalAirspaceDesignator("Praha TMA")).toBeNull();
  });

  it("marks a currently valid UUP allocation as planned-now", () => {
    const index = buildAirspacePlanMapIndex(
      activity([window({ sequence: 2, source: "UUP", sourceReference: "https://aup.rlp.cz/uup.htm" })]),
      new Date("2026-09-11T09:30:00.000Z"),
    );
    expect(index.get("LKTRA36")).toMatchObject({
      state: "planned-now",
      source: "UUP",
      sequence: 2,
      stale: false,
    });
  });

  it("keeps only the nearest future allocation when none is current", () => {
    const index = buildAirspacePlanMapIndex(
      activity([
        window({ startsAt: "2026-09-11T13:00:00.000Z", endsAt: "2026-09-11T14:00:00.000Z" }),
        window({ sequence: 2, startsAt: "2026-09-11T11:00:00.000Z", endsAt: "2026-09-11T12:00:00.000Z", source: "UUP" }),
      ]),
      new Date("2026-09-11T10:00:00.000Z"),
    );
    expect(index.get("LKTRA36")).toMatchObject({
      state: "upcoming",
      startsAt: "2026-09-11T11:00:00.000Z",
      source: "UUP",
    });
  });

  it("prefers a current allocation over an upcoming one and preserves stale provenance", () => {
    const index = buildAirspacePlanMapIndex(
      activity([
        window({ sequence: 4, startsAt: "2026-09-11T12:00:00.000Z", endsAt: "2026-09-11T13:00:00.000Z", source: "UUP" }),
        window({ sequence: 3, startsAt: "2026-09-11T09:00:00.000Z", endsAt: "2026-09-11T11:00:00.000Z", source: "UUP" }),
      ], "stale"),
      new Date("2026-09-11T10:00:00.000Z"),
    );
    expect(index.get("LKTRA36")).toMatchObject({ state: "planned-now", sequence: 3, stale: true });
  });

  it("drops expired, invalid and unavailable planned data", () => {
    const expired = buildAirspacePlanMapIndex(
      activity([window({ endsAt: "2026-09-11T08:00:00.000Z" })]),
      new Date("2026-09-11T10:00:00.000Z"),
    );
    expect(expired.size).toBe(0);

    const invalid = buildAirspacePlanMapIndex(
      activity([window({ startsAt: "invalid" })]),
      new Date("2026-09-11T10:00:00.000Z"),
    );
    expect(invalid.size).toBe(0);

    const unavailable = buildAirspacePlanMapIndex(
      activity([window()], "unavailable"),
      new Date("2026-09-11T10:00:00.000Z"),
    );
    expect(unavailable.size).toBe(0);
  });

  it("joins a planned window to an existing ATC sector without changing ATC activation semantics", () => {
    const index = buildAirspacePlanMapIndex(activity([window()]), new Date("2026-09-11T09:30:00.000Z"));
    expect(matchAirspacePlanForSector({ id: "cz-eaip-lktra36", name: "TRA 36 HOLICE" }, index)).toMatchObject({
      canonicalDesignator: "LKTRA36",
      state: "planned-now",
    });
    expect(matchAirspacePlanForSector({ id: "lkpra-tma", name: "Praha TMA" }, index)).toBeNull();
  });
});
