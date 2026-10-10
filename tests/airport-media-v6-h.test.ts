import { describe, expect, it } from "vitest";
import { addAirportMediaLink, mediaAirportKey, parseAirportMediaLinks, sanitizeAirportMediaLink } from "@/lib/aviation-media-v6-h";
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
});
