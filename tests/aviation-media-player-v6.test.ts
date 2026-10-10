import { describe, expect, it } from "vitest";
import { resolveAuthorizedPlayer } from "@/lib/aviation-media-player-v6";

describe("V6 licensed media player", () => {
  it("uses the official YouTube embed only for well-formed video IDs", () => {
    expect(resolveAuthorizedPlayer("https://www.youtube.com/watch?v=M7lc1UVf-VE","camera")).toEqual({
      type: "youtube", src: "https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?controls=1&playsinline=1",
    });
    expect(resolveAuthorizedPlayer("https://youtu.be/M7lc1UVf-VE","camera")?.type).toBe("youtube");
    expect(resolveAuthorizedPlayer("https://youtube.com/live/M7lc1UVf-VE","camera")?.type).toBe("youtube");
    expect(resolveAuthorizedPlayer("https://www.youtube.com/watch?v=M7lc1UVf-VE","audio")).toBeNull();
    expect(resolveAuthorizedPlayer("https://www.youtube.com/watch?v=invalid","camera")).toBeNull();
  });
  it("permits only direct public media resources, not arbitrary pages or suspicious protocols", () => {
    expect(resolveAuthorizedPlayer("https://cams.example.org/stream.mp4","camera")?.type).toBe("video");
    expect(resolveAuthorizedPlayer("https://licensed.example.org/radio.mp3","audio")?.type).toBe("audio");
    expect(resolveAuthorizedPlayer("https://licensed.example.org/hls.m3u8","camera")?.type).toBe("hls");
    for(const url of ["http://example.org/radio.mp3","https://localhost/a.mp3","https://127.0.0.1/a.mp3","https://liveatc.net/some-feed.mp3","https://sub.liveatc.net/a.mp3","https://user:pw@example.org/a.mp3","https://example.org/a.mp3#f","https://example.org/any-page"]) {
      expect(resolveAuthorizedPlayer(url,"audio")).toBeNull();
    }
  });
});
