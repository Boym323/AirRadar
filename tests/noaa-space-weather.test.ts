import { describe, it, expect, vi } from "vitest";
import { parseNoaaKp, NoaaSpaceWeatherProvider } from "@/lib/server/noaa-space-weather";

const NOW = Date.parse("2026-10-10T21:00:00Z");
const sample = [
  { time_tag: "2026-10-10T12:00:00", Kp: 2.3 },
  { time_tag: "2026-10-10T18:00:00", Kp: 5.3 },
  { time_tag: "2026-10-12T00:00:00", Kp: 9 },
];

describe("NOAA SWPC Kp context", () => {
  it("validates and chooses the latest non-future sample", () => {
    expect(parseNoaaKp(sample, NOW)).toEqual({ observedAt: "2026-10-10T18:00:00.000Z", kp: 5.3 });
    expect(parseNoaaKp([{ time_tag: "broken", Kp: 999 }], NOW)).toBeNull();
  });
  it("shares 10 minute cache and flags geomagnetic storm only as global context", async () => {
    const fetcher = vi.fn(async () => Response.json(sample));
    const provider = new NoaaSpaceWeatherProvider(fetcher as typeof fetch, () => NOW);
    const first = await provider.getContext();
    expect(first.status).toBe("storm");
    expect(first.description).toContain("not evidence");
    expect((await provider.getContext()).kp).toBe(5.3);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("fails soft", async () => {
    const provider = new NoaaSpaceWeatherProvider(vi.fn(async () => new Response("", { status: 502 })) as typeof fetch, () => NOW);
    expect((await provider.getContext()).available).toBe(false);
  });
});
