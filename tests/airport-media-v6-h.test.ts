import { describe, expect, it } from "vitest";
import { addAirportMediaLink, mediaAirportKey, parseAirportMediaLinks, resolveAirportMediaEmbed, sanitizeAirportMediaLink } from "@/lib/aviation-media-v6-h";
const a = { kind: "camera", title: "Airport camera", url: "https://example.com/camera" };
describe("V6-H browser-only external media links", () => {
  it("validates airport key", () => { expect(mediaAirportKey("lkpr")).toBe("airradar-v6-h-media:LKPR"); expect(mediaAirportKey("bad")).toBeNull(); });
  it("accepts only public HTTPS without credentials or fragments", () => {
    expect(sanitizeAirportMediaLink(a)).toMatchObject(a);
    for(const url of ["javascript:alert(1)", "http://example.com", "https://localhost/test", "https://127.0.0.1/test", "https://192.168.1.1/test", "https://u:p@example.com", "https://example.com/#abc"]) {
      expect(sanitizeAirportMediaLink({ ...a, url })).toBeNull();
    }
  });
  it("bounds saved links, rejects corrupt storage and duplicates", () => {
    expect(parseAirportMediaLinks("not-json")).toEqual([]);
    expect(parseAirportMediaLinks(JSON.stringify([a,a]))).toHaveLength(1);
    let links = parseAirportMediaLinks(null);
    for(let i=0; i<20; i++) links = addAirportMediaLink(links, { ...a, url: `https://example.com/${i}` });
    expect(links).toHaveLength(6);
  });
  it("only embeds canonical YouTube video IDs and never arbitrary websites", () => {
    const expected = "https://www.youtube-nocookie.com/embed/AbCdEf123_9";
    for (const url of [
      "https://www.youtube.com/watch?v=AbCdEf123_9",
      "https://www.youtube.com/live/AbCdEf123_9",
      "https://youtu.be/AbCdEf123_9",
      "https://m.youtube.com/shorts/AbCdEf123_9",
    ]) expect(resolveAirportMediaEmbed({ ...a, url })?.iframeUrl).toBe(expected);
    for (const url of [
      "https://www.youtube.com/channel/example/live",
      "https://www.youtube.com/playlist?list=PL123",
      "https://www.youtube.com.evil.example/watch?v=AbCdEf123_9",
      "https://youtu.be.evil.example/AbCdEf123_9",
      "https://example.com/embed/AbCdEf123_9",
      "https://www.youtube.com/watch?v=%3Cscript%3E",
      "https://www.youtube.com/embed/AbCdEf123_9?autoplay=1",
      "http://www.youtube.com/watch?v=AbCdEf123_9",
    ]) expect(resolveAirportMediaEmbed({ ...a, url })).toBeNull();
    expect(resolveAirportMediaEmbed({ ...a, kind: "audio", url: "https://youtu.be/AbCdEf123_9" })?.provider).toBe("youtube");
  });

});
