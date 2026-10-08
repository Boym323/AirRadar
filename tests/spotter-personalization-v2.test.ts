import { describe, expect, it } from "vitest";
import {
  MY_SKY_FAVORITES_MAX, MY_SKY_FAVORITES_STORAGE_KEY,
  mySkyPersonalSignal, normalizeMySkyIcao, parseMySkyFavorites, serializeMySkyFavorites, toggleMySkyFavorite,
} from "@/lib/spotter-personalization";
import type { SpotterLogbookState } from "@/lib/spotter-logbook";

const logbook: SpotterLogbookState = {
  version: 2,
  entries: [
    { id: "A1", icaoHex: "AB12CD", observedAt: "2026-10-07T18:00:00Z" },
    { id: "A2", icaoHex: "AB12CD", observedAt: "2026-10-08T12:00:00Z" },
    { id: "B1", icaoHex: "C0FFEE", observedAt: "2026-10-08T10:00:00Z" },
  ] as SpotterLogbookState["entries"],
};

describe("Personal Sky B2 — opt-in favorites and confirmed sighting memory", () => {
  it("sanitizes ICAO identifiers, invalid JSON, wrong versions and oversized payloads", () => {
    expect(normalizeMySkyIcao(" ab12cd ")).toBe("AB12CD");
    expect(normalizeMySkyIcao("bogus!")).toBeNull();
    expect(normalizeMySkyIcao("ABC123<script>")).toBeNull();
    expect(parseMySkyFavorites('{"version":2,"icaoHexes":["AB12CD"]}').icaoHexes).toEqual([]);
    expect(parseMySkyFavorites("{oops").icaoHexes).toEqual([]);
    expect(parseMySkyFavorites("a".repeat(9000)).icaoHexes).toEqual([]);
    expect(parseMySkyFavorites('{"version":1,"icaoHexes":["ab12cd","AB12CD","zzzzzz","C0FFEE"]}').icaoHexes)
      .toEqual(["AB12CD", "C0FFEE"]);
  });

  it("bounds stored favorites, toggles deterministically and never contains coordinates", () => {
    const values = Array.from({ length: 48 }, (_, index) => index.toString(16).padStart(6, "0"));
    const parsed = parseMySkyFavorites(JSON.stringify({ version: 1, icaoHexes: values }));
    expect(parsed.icaoHexes).toHaveLength(MY_SKY_FAVORITES_MAX);
    const added = toggleMySkyFavorite(parsed, "AB12CD");
    expect(added.icaoHexes[0]).toBe("AB12CD");
    expect(added.icaoHexes).toHaveLength(MY_SKY_FAVORITES_MAX);
    expect(toggleMySkyFavorite(added, "AB12CD").icaoHexes).not.toContain("AB12CD");
    expect(toggleMySkyFavorite(added, "bad-data")).toEqual(added);
    const stored = serializeMySkyFavorites(added);
    expect(parseMySkyFavorites(stored)).toEqual(added);
    expect(stored).not.toContain("lat");
    expect(stored).not.toContain("lon");
    expect(MY_SKY_FAVORITES_STORAGE_KEY).toBe("airradar.my-sky-favorites.v1");
  });

  it("uses only manually recorded sightings, not inferred repeated SSE observations", () => {
    const favorites = { version: 1 as const, icaoHexes: ["AB12CD"] };
    expect(mySkyPersonalSignal("ab12cd", favorites, logbook)).toEqual({
      favorite: true, sightings: 2, lastSeenAt: "2026-10-08T12:00:00.000Z",
    });
    expect(mySkyPersonalSignal("C0FFEE", favorites, logbook)).toMatchObject({ favorite: false, sightings: 1 });
    expect(mySkyPersonalSignal("ACDCAC", favorites, logbook)).toEqual({
      favorite: false, sightings: 0, lastSeenAt: null,
    });
  });
});
