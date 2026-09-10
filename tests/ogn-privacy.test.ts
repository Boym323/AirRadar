import { describe, expect, it } from "vitest";
import { parseOgnPosition } from "@/lib/ogn/aprs-parser";
import { applyOgnPrivacy, targetWithPrivacy } from "@/lib/ogn/privacy";
import { toPublicOgnTarget } from "@/lib/ogn/public-serialization";
import { OGN_FIXTURES } from "@/tests/fixtures/ogn-packets";

const position = parseOgnPosition(OGN_FIXTURES.flarm, { now: new Date("2026-09-10T10:10:00.000Z") }).position;
const entry = { deviceType: "F" as const, deviceId: position.id.address, aircraftModel: "ASW 20", registration: "OK-TEST", competitionNumber: "42", tracked: "Y" as const, identified: "Y" as const, aircraftType: 1 };

describe("OGN privacy boundary", () => {
  it("drops no-tracking packets before DDB lookup", () => {
    const value = applyOgnPrivacy({ position: { ...position, id: { ...position.id, noTracking: true } }, ddbAvailable: true, ddbEntry: entry });
    expect(value).toMatchObject({ action: "drop", reason: "no-tracking" });
  });

  it("fails closed while DDB is unavailable and honors tracked=N", () => {
    expect(applyOgnPrivacy({ position, ddbAvailable: false, ddbEntry: entry })).toMatchObject({ action: "drop", reason: "ddb-unavailable" });
    expect(applyOgnPrivacy({ position, ddbAvailable: true, ddbEntry: { ...entry, tracked: "N" } })).toMatchObject({ action: "drop", reason: "ddb-tracked-disabled" });
  });

  it("keeps DDB misses and non-identified/stealth devices anonymous", () => {
    expect(applyOgnPrivacy({ position, ddbAvailable: true, ddbEntry: null })).toMatchObject({ action: "anonymous", reason: "ddb-miss" });
    expect(applyOgnPrivacy({ position, ddbAvailable: true, ddbEntry: { ...entry, identified: "N" } })).toMatchObject({ action: "anonymous", reason: "not-identified" });
    expect(applyOgnPrivacy({ position: { ...position, id: { ...position.id, stealth: true } }, ddbAvailable: true, ddbEntry: entry })).toMatchObject({ action: "anonymous", reason: "stealth" });
  });

  it("serializes identified metadata only for an identified decision", () => {
    const identified = targetWithPrivacy(position, { action: "identified", entry }, undefined, "flarm:8E20F0", "anonymous-1", 12, 90, false);
    const anonymous = targetWithPrivacy(position, { action: "anonymous", entry, reason: "not-identified" }, undefined, "flarm:8E20F0", "anonymous-2", 12, 90, false);
    expect(identified).not.toBeNull();
    expect(anonymous).not.toBeNull();
    expect(toPublicOgnTarget(identified!)).toMatchObject({ id: "flarm:8E20F0", address: "3836BC", registration: "OK-TEST", identityVisible: true });
    const publicAnonymous = toPublicOgnTarget({ ...anonymous!, lastReceiver: "LKXX", receiverSignalDb: 32.5, recentReceivers: ["LKXX", "LKYY"], receiverCount: 2 });
    expect(publicAnonymous).toMatchObject({ id: "anonymous-2", publicId: "anonymous-2", address: null, senderCallsign: null, registration: null, model: null, identityVisible: false, noTracking: false, lastReceiver: null });
    expect(publicAnonymous).not.toHaveProperty("receiverSignalDb");
    expect(publicAnonymous).not.toHaveProperty("recentReceivers");
    expect(publicAnonymous).not.toHaveProperty("receiverCount");
    expect(JSON.stringify(publicAnonymous)).not.toContain("ICA3836BC");
    expect(JSON.stringify(publicAnonymous)).not.toContain("LKXX");
    expect(toPublicOgnTarget({ ...identified!, lastReceiver: "LKXX" }).lastReceiver).toBe("LKXX");
  });
});
