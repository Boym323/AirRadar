import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { playbackSampleAt, playbackTimeRange, type PlaybackPosition } from "@/lib/history/playback";

const source = readFileSync(new URL("../components/flight-detail.tsx", import.meta.url), "utf8");

const positions: PlaybackPosition[] = [
  { recordedAt: "2026-09-08T10:00:00Z", lat: 50, lon: 14, altitude: 8_000, groundSpeed: 200, track: 90 },
  { recordedAt: "2026-09-08T10:01:00Z", lat: 51, lon: 15, altitude: 10_000, groundSpeed: 220, track: 100 },
];

describe("history playback v2", () => {
  it("keeps a bounded synchronized current point across the full timeline", () => {
    const range = playbackTimeRange(positions);
    expect(range).toEqual({ start: Date.parse(positions[0].recordedAt), end: Date.parse(positions[1].recordedAt) });
    expect(playbackSampleAt(positions, range!.start)?.index).toBe(0);
    expect(playbackSampleAt(positions, range!.end)?.index).toBe(1);
  });

  it("exposes explicit timeline, speed, observed-path, and route-context UI", () => {
    expect(source).toContain("[0.5, 1, 2, 4, 10]");
    expect(source).toContain("observedPathDescription");
    expect(source).toContain("routeContextDescription");
    expect(source).toContain("sample.index + 1");
  });
});
