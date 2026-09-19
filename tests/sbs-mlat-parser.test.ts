import { describe, expect, it } from "vitest";
import { parseSbsMlatLine, SbsLineBuffer } from "@/lib/server/sbs-mlat-parser";

const receiver = { lat: 49.22, lon: 17.67, name: "test" };
const line = "MSG,3,111,ABC123,ABC123,TEST123 ,2026/09/19,12:00:00.000,2026/09/19,12:00:00.000,12000,12000,420,180,49.3,17.8,640,7700,0,0,0,0";

describe("SBS MLAT parser", () => {
  it("handles fragmented and CRLF-delimited lines", () => {
    const buffer = new SbsLineBuffer();
    expect(buffer.push(line.slice(0, 25))).toEqual([]);
    expect(buffer.push(`${line.slice(25)}\r\n`)).toHaveLength(1);
    expect(parseSbsMlatLine(line, receiver).aircraft).toMatchObject({ icaoHex: "ABC123", source: "MLAT", origin: "adsblol", lat: 49.3, lon: 17.8, altitude: 12000, track: 180, squawk: "7700" });
  });
  it("rejects malformed identity and coordinates without throwing", () => {
    expect(parseSbsMlatLine(line.replace(",ABC123,TEST123", ",bad,TEST123"), receiver).error).toBe("invalid_icao");
    expect(parseSbsMlatLine(line.replace("49.3", "95"), receiver).error).toBe("invalid_position");
  });
  it("bounds an unterminated line", () => {
    const buffer = new SbsLineBuffer(32);
    buffer.push("x".repeat(100));
    expect(buffer.bufferedBytes).toBe(0);
  });
});
