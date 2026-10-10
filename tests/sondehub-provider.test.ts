import { describe, expect, it, vi } from "vitest";
import { normalizeSondeHubPayload, SondeHubProvider } from "@/lib/server/sondehub";
import { createSondeHubGeoJSON } from "@/lib/sondehub/map";

const NOW = Date.parse("2026-10-10T12:00:00Z");
const observation = { serial: "S1234567", lat: 49.2, lon: 17.6, alt: 13900, vel_v: 4.1, type: "RS41", datetime: "2026-10-10T11:55:00Z" };

describe("SondeHub lazy snapshot", () => {
  it("validates coordinates, altitude and freshness before accepting telemetry", () => {
    const rows = normalizeSondeHubPayload({
      S1234567: observation,
      INVALID: { ...observation, serial: "INVALID", lat: 100 },
      STALE: { ...observation, serial: "STALE", datetime: "2026-10-10T10:00:00Z" },
    }, NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ serial: "S1234567", altitudeM: 13900, ascentMs: 4.1 });
    expect(createSondeHubGeoJSON(rows).features[0]?.geometry.coordinates).toEqual([17.6, 49.2]);
  });

  it("coalesces and caches snapshots without a poller", async () => {
    const fetcher = vi.fn(async () => Response.json({ S1234567: observation }));
    const provider = new SondeHubProvider(fetcher as typeof fetch, () => NOW);
    const [first, second] = await Promise.all([provider.getSnapshot(49.2, 17.6), provider.getSnapshot(49.2, 17.6)]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(first.count).toBe(1);
    await provider.getSnapshot(49.2, 17.6);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("fails softly when upstream data is invalid", async () => {
    const fetcher = vi.fn(async () => new Response("broken", { status: 502 }));
    const provider = new SondeHubProvider(fetcher as typeof fetch, () => NOW);
    const snapshot = await provider.getSnapshot(49.2, 17.6);
    expect(snapshot.available).toBe(false);
    expect(snapshot.observations).toEqual([]);
  });
});
