import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const detailSource = readFileSync(new URL("../components/flight-detail.tsx", import.meta.url), "utf8");
const profileSource = readFileSync(new URL("../components/flight-profile.tsx", import.meta.url), "utf8");

describe("flight profile playback integration", () => {
  it("shares one playback timestamp with all profile charts", () => {
    expect(detailSource).toContain("onPlaybackChange={setPlaybackAt}");
    expect(detailSource).toContain("playbackAt={playbackAt}");
    expect(profileSource).toContain("flightProfilePlaybackX(series, playbackAt)");
    expect(profileSource).toContain("flight-profile-playback-marker");
  });
});
