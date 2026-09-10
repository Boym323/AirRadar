import { describe, expect, it } from "vitest";
import { AprsLineReader, OgnParseError, parseAprsEnvelope, parseOgnPosition } from "@/lib/ogn/aprs-parser";
import { classifyOgnTocall } from "@/lib/ogn/source-classifier";
import { OGN_FIXTURES } from "@/tests/fixtures/ogn-packets";

const now = new Date("2026-09-10T10:50:00.000Z");

function parse(line: string, at = now) {
  return parseOgnPosition(line, { now: at, maxPacketAgeMs: 120_000 });
}

describe("OGN/APRS parser", () => {
  it("keeps APRS CSE/SPD speed in knots for every accepted source", () => {
    const flarm = parse(OGN_FIXTURES.flarm, new Date("2026-09-10T10:10:00.000Z"));
    expect(flarm.classification).toMatchObject({ action: "accept", source: "flarm" });
    expect(flarm.position).toMatchObject({
      senderCallsign: "ICA3836BC",
      latitude: 45 + 33.58 / 60,
      longitude: 5 + 58.45 / 60,
      altitudeFt: 964,
      trackDeg: 0,
      receiverSignalDb: 32.5,
      lastReceiver: "LFLE",
    });
    expect(flarm.position.groundSpeedKt).toBe(54);
    expect(flarm.position.turnRateDegPerSec).toBe(0);

    const realAt = new Date("2026-09-10T07:39:50.000Z");
    const realCases = [
      [OGN_FIXTURES.realFlarm, 96],
      [OGN_FIXTURES.realOgnTracker, 63],
      [OGN_FIXTURES.realSafeSky, 99],
      [OGN_FIXTURES.realAdsL, 0],
    ] as const;
    for (const [packet, expectedSpeed] of realCases) {
      expect(parse(packet, realAt).position.groundSpeedKt).toBe(expectedSpeed);
    }

    expect(parse(OGN_FIXTURES.flarm6, new Date("2026-09-10T14:11:00.000Z")).classification.action).toBe("accept");
    expect(parse(OGN_FIXTURES.ognTracker, new Date("2026-09-10T11:49:00.000Z")).classification.action).toBe("accept");
    expect(parse(OGN_FIXTURES.legacyOgnTracker, new Date("2026-09-10T23:32:00.000Z")).classification.action).toBe("accept");
    expect(parse(OGN_FIXTURES.fanet, new Date("2026-09-10T10:44:00.000Z")).classification.action).toBe("accept");
    expect(parse(OGN_FIXTURES.safeSky, new Date("2026-09-10T07:25:00.000Z")).classification.action).toBe("accept");
    expect(parse(OGN_FIXTURES.pilotAware, new Date("2026-09-10T10:44:00.000Z")).classification.action).toBe("accept");
    expect(parse(OGN_FIXTURES.pilotAwareCurrent, new Date("2026-09-10T10:44:00.000Z")).classification.action).toBe("accept");
    expect(parse(OGN_FIXTURES.adsL, new Date("2026-09-10T10:47:00.000Z")).classification.action).toBe("accept");
    expect(parse(OGN_FIXTURES.fanet, new Date("2026-09-10T10:44:00.000Z")).position.groundSpeedKt).toBe(81);
    expect(parse(OGN_FIXTURES.pilotAware, new Date("2026-09-10T10:44:00.000Z")).position.groundSpeedKt).toBe(81);
    expect(parse(OGN_FIXTURES.pilotAwareCurrent, new Date("2026-09-10T10:44:00.000Z")).position.trackingSource).toBe("pilotaware");
  });

  it("does not double-convert a three-digit APRS speed and preserves zero", () => {
    const realAt = new Date("2026-09-10T07:39:50.000Z");
    expect(parse(OGN_FIXTURES.realFlarm, realAt).position.groundSpeedKt).toBe(96);
    expect(parse(OGN_FIXTURES.realAdsL, realAt).position.groundSpeedKt).toBe(0);
    expect(parse(OGN_FIXTURES.realFlarm.replace("182/096", "182/100"), realAt).position.groundSpeedKt).toBe(100);
  });

  it("decodes identity detail bits and nearest-day timestamps", () => {
    const value = parse(OGN_FIXTURES.ognTracker, new Date("2026-09-10T11:49:00.000Z")).position;
    expect(value.id).toMatchObject({ address: "8E20F0", addressType: "flarm", aircraftType: "glider", stealth: false, noTracking: false });
    expect(value.observedAt).toBe("2026-09-10T11:48:05.000Z");

    const previousDay = parseOgnPosition(OGN_FIXTURES.legacyOgnTracker, { now: new Date("2026-09-11T00:00:30.000Z"), maxPacketAgeMs: 60 * 60_000 });
    expect(previousDay.position.observedAt).toBe("2026-09-10T23:31:06.000Z");
  });

  it("parses the envelope without interpreting payload fields", () => {
    expect(parseAprsEnvelope(OGN_FIXTURES.flarm)).toMatchObject({ from: "ICA3836BC", tocall: "OGFLR", path: ["qAS", "LFLE"] });
  });

  it("fails closed for ADS-B, ground/status, delayed, and unknown TOCALLs", () => {
    expect(classifyOgnTocall("OGADSB")).toMatchObject({ action: "drop", reason: "adsb" });
    expect(classifyOgnTocall("OGNSDR")).toMatchObject({ action: "drop", reason: "ground" });
    expect(classifyOgnTocall("OGNDVS")).toMatchObject({ action: "drop", reason: "ground" });
    expect(classifyOgnTocall("OGNDELAY")).toMatchObject({ action: "drop", reason: "delayed" });
    expect(classifyOgnTocall("OGMSHT")).toMatchObject({ action: "drop", reason: "status" });
    expect(classifyOgnTocall("OGNMTK")).toMatchObject({ action: "drop", reason: "unknown" });
    expect(() => parse(OGN_FIXTURES.adsb)).toThrowError(OgnParseError);
    expect(() => parse(OGN_FIXTURES.ground)).toThrowError(OgnParseError);
    expect(() => parse(OGN_FIXTURES.weather)).toThrowError(OgnParseError);
    expect(() => parse(OGN_FIXTURES.delayed)).toThrowError(OgnParseError);
    expect(() => parse(OGN_FIXTURES.meshtastic)).toThrowError(OgnParseError);
  });

  it("rejects delayed/future and malformed positions", () => {
    expect(() => parseOgnPosition(OGN_FIXTURES.flarm, { now: new Date("2026-09-10T10:54:00.000Z"), maxPacketAgeMs: 120_000 })).toThrowError(/delayed/);
    expect(() => parseOgnPosition(OGN_FIXTURES.flarm, { now: new Date("2026-09-10T10:09:00.000Z"), futureToleranceMs: 1_000 })).toThrowError(/future/);
    expect(() => parse("ICA3836BC>OGFLR,qAS,LFLE:/100956h9999.99N/00558.45E'000/054/A=000964 id053836BC")).toThrowError(/coordinate/i);
    expect(() => parse("ICA3836BC>OGFLR,qAS,LFLE:/100956h4533.58N/00558.45E'000/054/A=000964 idINVALID")).toThrowError(/id/i);
    expect(() => parse(OGN_FIXTURES.realFlarm.replace("182/096", "182/ABC"), new Date("2026-09-10T07:39:50.000Z"))).toThrowError(OgnParseError);
  });

  it("keeps TCP line framing bounded across chunks", () => {
    const reader = new AprsLineReader();
    const line = `${OGN_FIXTURES.flarm}\r\n`;
    const first = reader.push(Buffer.from(line.slice(0, 17)));
    expect(first.lines).toEqual([]);
    const second = reader.push(Buffer.from(line.slice(17)));
    expect(second.lines).toEqual([OGN_FIXTURES.flarm]);

    const oversized = `${"x".repeat(512)}\r\nOK\r\n`;
    const result = reader.push(Buffer.from(oversized));
    expect(result.oversized).toBe(1);
    expect(result.lines).toEqual(["OK"]);

    const maxBody = `${"x".repeat(510)}\r\n`;
    expect(reader.push(Buffer.from(maxBody)).oversized).toBe(0);
  });
});
