import { afterEach, describe, expect, it, vi } from "vitest";
import { recapPeriodBounds, getReceiverRecap } from "@/lib/server/recap";

vi.mock("@/lib/server/db", () => ({ getPrisma: vi.fn(() => null) }));

afterEach(() => vi.unstubAllEnvs());

describe("receiver recap", () => {
  it("uses Europe/Prague local-day boundaries", () => {
    const now = new Date("2026-09-09T00:30:00Z");
    const daily = recapPeriodBounds("daily", now);
    const weekly = recapPeriodBounds("weekly", now);
    expect(daily.fromKey).toBe("2026-09-09");
    expect(daily.toKey).toBe("2026-09-09");
    expect(weekly.fromKey).toBe("2026-09-03");
    expect(weekly.toKey).toBe("2026-09-09");
  });

  it("does not turn missing persistence into fake zero metrics", async () => {
    const result = await getReceiverRecap("daily", { now: new Date("2026-09-09T12:00:00Z") });
    expect(result).toMatchObject({ source: "unavailable", hasData: false, uniqueAircraft: null, observedFlights: null, maxDistanceKm: null, alertCount: null });
  });
});
