import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../components/flight-detail.tsx", import.meta.url), "utf8");

describe("Flight Story V2 UI boundary", () => {
  it("reuses the existing playback clock and avoids a second live-aircraft path", () => {
    expect(source).toContain("buildFlightStoryV2Summary(detail)");
    expect(source).toContain("buildFlightStoryNarrative(detail)");
    expect(source).toContain('data-testid="flight-story-v2-summary"');
    expect(source).toContain('data-testid="flight-story-v2-narrative"');
    expect(source.match(/new MapTimeController\(\)/g)).toHaveLength(1);
    expect(source).not.toContain("useAircraftStream");
    expect(source).not.toContain("new EventSource");
    expect(source).not.toContain("/api/stream");
  });

  it("keeps narrative clicks synchronized with the existing playback seek", () => {
    expect(source).toContain("onSeek(Date.parse(item.occurredAt))");
    expect(source).toContain("onPlaybackChange(next)");
    expect(source).toContain("playbackSampleAt(positions, playbackAt)");
    expect(source).toContain("FlightProfile positions={detail.positions} playbackAt={playbackAt}");
  });

  it("labels airport route context and inferred intelligence explicitly", () => {
    expect(source).toContain("t.history.routeContext");
    expect(source).toContain("t.history.storyEvidenceDisclaimer");
    expect(source).toContain('item.provenance === "observed" ? t.history.storyObserved : t.history.storyInferred');
  });
});
