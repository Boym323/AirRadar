import { describe, expect, it } from "vitest";
import { isAuthorizedYouTubeFrame } from "../scripts/v6-media-acceptance.mjs";

describe("V6-H trusted iframe browser acceptance", () => {
  const id = "M7lc1UVf-VE";
  const valid = `https://www.youtube-nocookie.com/embed/${id}?controls=1&playsinline=1`;

  it("accepts exactly the approved privacy player and query contract, independent of query order", () => {
    expect(isAuthorizedYouTubeFrame(valid, id)).toBe(true);
    expect(isAuthorizedYouTubeFrame(`https://www.youtube-nocookie.com/embed/${id}?playsinline=1&controls=1`, id)).toBe(true);
  });

  it("fails closed on host, path, ID and parameter substitutions", () => {
    for (const src of [
      null, undefined, "", "javascript:alert(1)", "/embed/" + id,
      `http://www.youtube-nocookie.com/embed/${id}?controls=1&playsinline=1`,
      `https://www.youtube-nocookie.com.attacker.example/embed/${id}?controls=1&playsinline=1`,
      `https://evil.example/?next=${encodeURIComponent(valid)}`,
      `https://www.youtube-nocookie.com/embed/${id}.evil?controls=1&playsinline=1`,
      `https://www.youtube-nocookie.com/embed/AbCdEf123_9?controls=1&playsinline=1`,
      `https://www.youtube-nocookie.com/embed/${id}?controls=1&playsinline=0`,
      `https://www.youtube-nocookie.com/embed/${id}?controls=1&playsinline=1&autoplay=1`,
      `https://www.youtube-nocookie.com/embed/${id}?controls=1&controls=1&playsinline=1`,
      `https://user:secret@www.youtube-nocookie.com/embed/${id}?controls=1&playsinline=1`,
      `https://www.youtube-nocookie.com/embed/${id}?controls=1&playsinline=1#fragment`,
    ]) expect(isAuthorizedYouTubeFrame(src, id)).toBe(false);
    expect(isAuthorizedYouTubeFrame(valid, "bad")).toBe(false);
  });
});
