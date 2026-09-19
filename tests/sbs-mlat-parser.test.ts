import { describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import type net from "node:net";
import { AdsbHubProvider } from "@/lib/server/adsbhub-provider";
import { parseSbsLine, parseSbsMlatLine, SbsLineBuffer } from "@/lib/server/sbs-mlat-parser";

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
    expect(parseSbsMlatLine(line.replace("MSG,3,111,ABC123,ABC123,", "MSG,3,111,ABC123,badx,"), receiver).error).toBe("invalid_icao");
    expect(parseSbsMlatLine(line.replace("49.3", "95"), receiver).error).toBe("invalid_position");
  });
  it.each(["1234", "8A6D", "96C6", "9893", "9E21", "AD57", "C451"])('pads valid short SBS identifiers %s', (hex) => {
    const parsed = parseSbsLine(line.replace("ABC123,ABC123", `ABC123,${hex}`), receiver, Date.now(), { origin: "adsbhub" });
    expect(parsed.aircraft?.icaoHex).toBe(hex.padStart(6, "0"));
    expect(parsed.aircraft?.origin).toBe("adsbhub");
    expect(parsed.aircraft?.source).not.toBe("MLAT");
  });
  it.each(["", "G123", "1234567"])('rejects invalid SBS identifiers %j', (hex) => {
    expect(parseSbsLine(line.replace("ABC123,ABC123", `ABC123,${hex}`), receiver, Date.now(), { origin: "adsbhub" }).error).toBe("invalid_icao");
  });
  it("keeps generic SBS semantics separate from ADSB.lol MLAT semantics", () => {
    const parsed = parseSbsLine(line, receiver, Date.now(), { origin: "adsbhub" });
    expect(parsed.aircraft).toMatchObject({ source: "UNKNOWN", sourceType: "sbs_30003", origin: "adsbhub" });
  });
  it("bounds an unterminated line", () => {
    const buffer = new SbsLineBuffer(32);
    buffer.push("x".repeat(100));
    expect(buffer.bufferedBytes).toBe(0);
  });
  it("merges MSG1/MSG3/MSG4 by field and publishes only the configured radius", async () => {
    const socket = new EventEmitter() as EventEmitter & Partial<net.Socket>;
    socket.setNoDelay = () => socket as never;
    socket.setTimeout = () => socket as never;
    socket.destroy = () => socket as never;
    const provider = new AdsbHubProvider(receiver, { host: "test", port: 5002, radiusNm: 500, socketFactory: () => socket as net.Socket });
    provider.start();
    socket.emit("connect");
    const sbs = (type: number, values: Record<number, string>) => { const fields = Array.from({ length: 22 }, () => ""); fields[0] = "MSG"; fields[1] = String(type); fields[4] = "1234"; for (const [index, value] of Object.entries(values)) fields[Number(index)] = value; return fields.join(","); };
    const callsign = sbs(1, { 10: "TEST123" });
    const position = sbs(3, { 11: "12000", 14: "49.3", 15: "17.8" });
    const motion = sbs(4, { 12: "420", 13: "180", 16: "640" });
    socket.emit("data", `${callsign.slice(0, 18)}`);
    socket.emit("data", `${callsign.slice(18)}\n${position}\r\n${motion}\n`);
    const snapshot = await provider.getSnapshot();
    expect(snapshot.aircraft).toHaveLength(1);
    expect(snapshot.aircraft[0]).toMatchObject({ icaoHex: "001234", callsign: "TEST123", lat: 49.3, lon: 17.8, altitude: 12000, groundSpeed: 420, track: 180, verticalRate: 640, origin: "adsbhub" });
    expect(provider.getDiagnostics()).toMatchObject({ connected: true, linesReceived: 3, linesParsed: 3, activeInternalTracks: 1 });
    await provider.stop();
  });
});
