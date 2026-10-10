import { describe, expect, it } from "vitest";
import { extractLandingPrediction, normalizeLatestSondes, normalizeSondeTrack } from "../lib/server/sondehub-provider";

const now = Date.parse("2026-10-10T19:00:00Z");
const point = { serial: "S123", lat: 49.22, lon: 17.67, alt: 19920, datetime: "2026-10-10T18:45:00Z", type: "RS41", vel_v: -4.8 };

describe("SondeHub guarded normalization", () => {
  it("accepts current positions near requested area and never exposes extra keys", () => {
    const result = normalizeLatestSondes({ S123: { ...point, token: "NEVER_FORWARD" }, BAD: { ...point, serial: "evil/../path" } }, 49.2, 17.7, 200, now);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ serial: "S123", altitudeM: 19920, verticalSpeedMs: -4.8, model: "RS41" });
    expect(JSON.stringify(result)).not.toContain("token");
  });
  it("rejects stale, out-of-area, and invalid telemetry", () => {
    expect(normalizeLatestSondes({ S123: point }, 10, 10, 100, now)).toEqual([]);
    expect(normalizeLatestSondes({ S123: { ...point, datetime: "2026-10-09T14:00:00Z" } }, 49.2, 17.7, 100, now)).toEqual([]);
    expect(normalizeLatestSondes({ S123: { ...point, lat: 999 } }, 49.2, 17.7, 100, now)).toEqual([]);
  });
  it("only accepts a recent Tawhiri descent endpoint with plausible altitude", () => {
    const payload = [{ vehicle: "S123", time: "2026-10-10T18:50:00Z", data: JSON.stringify({ prediction: [
      { stage: "ascent", trajectory: [{ latitude: 49, longitude: 17, altitude: 28000 }] },
      { stage: "descent", trajectory: [{ latitude: 49.1, longitude: 17.5, altitude: 28000 }, { latitude: 49.3, longitude: 17.9, altitude: 300, datetime: "2026-10-10T20:00:00Z" }] },
    ] }) }];
    expect(extractLandingPrediction(payload, "S123", now)).toMatchObject({ lat: 49.3, lon: 17.9, altitudeM: 300 });
    expect(extractLandingPrediction(payload, "DIFFERENT", now)).toBeNull();
  });
  it("orders and bounds historic track, dropping mixed serials", () => {
    expect(normalizeSondeTrack([{ ...point, datetime: "2026-10-10T18:44:00Z" }, point, { ...point, serial: "OTHER" }], "S123", now)).toHaveLength(2);
  });
});
