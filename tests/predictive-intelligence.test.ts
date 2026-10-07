import { describe, expect, it } from "vitest";
import { evaluatePredictiveIntelligence } from "@/lib/predictive-intelligence/engine";
import { replayPredictiveIntelligence } from "@/lib/predictive-intelligence/replay";
import { RUNWAY_CHANGE_EVENT_WINDOW_MS, type PredictionRunway, type PredictionSample, type PredictiveFlightState } from "@/lib/predictive-intelligence/types";
import { normalizeAircraft } from "@/lib/aircraft/normalize";
import { buildPredictiveShadowInput, isAirportProximity, predictivePhase } from "@/lib/server/aircraft-state";
import type { AirportRunway } from "@/lib/airports/infrastructure";

const airport = { icao: "LKPR", lat: 50.1008, lon: 14.2632 };
const sample = (at: number, lat: number, lon: number, trackDeg = 90): PredictionSample => ({ observedAt: at, lat, lon, altitudeFt: 20_000, groundSpeedKt: 300, verticalRateFpm: -500, trackDeg });

describe("Predictive Intelligence V1", () => {
  it("returns an explainable ETA from bounded recent progress", () => {
    const now = Date.parse("2026-01-01T12:00:00Z");
    const samples = [sample(now - 180_000, 50.10, 13.50), sample(now - 60_000, 50.10, 13.80)];
    const result = evaluatePredictiveIntelligence({ flightState: { aircraftIcao: "ABC123", timestamp: now, phase: "CRUISE", sample: samples[1]!, destination: "LKPR", destinationStatus: "KNOWN" }, recentSamples: samples, destinationAirport: airport, now });
    expect(result.prediction.modelVersion).toBe("predictive-intelligence-v1");
    expect(result.prediction.eta.estimatedArrivalAt).toBeGreaterThan(now);
    expect(result.prediction.eta.evidence.map((item) => item.key)).toContain("distanceRemainingNm");
  });

  it("never uses future samples during replay", () => {
    const at = Date.parse("2026-01-01T12:00:00Z");
    const base = [sample(at, 50.10, 13.50), sample(at + 60_000, 50.10, 13.80), sample(at + 120_000, 50.10, 14.10)];
    const changedFuture = [...base.slice(0, 1), sample(at + 60_000, 49, 12, 270), sample(at + 120_000, 48, 11, 270)];
    const first = replayPredictiveIntelligence({ samples: base, destinationAirport: airport, destination: "LKPR", destinationStatus: "KNOWN" }).predictions[0];
    const second = replayPredictiveIntelligence({ samples: changedFuture, destinationAirport: airport, destination: "LKPR", destinationStatus: "KNOWN" }).predictions[0];
    expect(second).toEqual(first);
  });

  it("preserves prediction parity for out-of-order recent samples", () => {
    const now = Date.parse("2026-01-01T12:00:00Z");
    const ordered = [
      sample(now - 180_000, 50.10, 13.50),
      sample(now - 120_000, 50.10, 13.65),
      sample(now - 60_000, 50.10, 13.80),
    ];
    const input = {
      flightState: { aircraftIcao: "ABC123", timestamp: now, phase: "CRUISE" as const, sample: ordered.at(-1)!, destination: "LKPR", destinationStatus: "KNOWN" as const },
      destinationAirport: airport,
      now,
    };
    const expected = evaluatePredictiveIntelligence({ ...input, recentSamples: ordered }).prediction;
    const actual = evaluatePredictiveIntelligence({ ...input, recentSamples: [ordered[2]!, ordered[0]!, ordered[1]!] }).prediction;
    expect(actual).toEqual(expected);
  });

  it("degrades safely for unknown destinations and stale samples", () => {
    const now = Date.parse("2026-01-01T12:00:00Z");
    const stale = [sample(now - 600_000, 50, 13), sample(now - 540_000, 50, 13.1)];
    const result = evaluatePredictiveIntelligence({ flightState: { aircraftIcao: "ABC123", timestamp: now, phase: "CRUISE", sample: stale[1]!, destination: null, destinationStatus: "UNKNOWN" }, recentSamples: stale, destinationAirport: null, now });
    expect(result.prediction.eta.confidence).toBe("UNKNOWN");
    expect(result.prediction.runway.runway).toBeNull();
  });

  it("uses aircraft-to-destination geometry, not receiver coverage distance", () => {
    const now = Date.parse("2026-01-01T12:00:00Z");
    const receiver = { lat: 49.226, lon: 17.67, name: "Zlín" };
    const aircraft = normalizeAircraft({ hex: "ABC123", lat: 49.25, lon: 17.70, alt_baro: 8_000, gs: 250, baro_rate: -400, seen: 0, seen_pos: 0 }, receiver, new Date(now));
    if (!aircraft) throw new Error("aircraft could not be normalized");
    const destination = { icaoCode: "LKPR", iataCode: "PRG", name: "Prague", city: null, country: null, latitude: 50.1008, longitude: 14.2632 };
    aircraft.enrichment = { route: { callsign: "TEST", airline: null, airlineIcao: null, airlineIata: null, origin: "LKTB", destination: "LKPR", originAirport: null, destinationAirport: destination } };
    const input = buildPredictiveShadowInput(aircraft, now);
    if (!input) throw new Error("predictive input was not built");
    const result = evaluatePredictiveIntelligence(input);
    const distanceNm = Number(result.prediction.eta.evidence.find((item) => item.key === "distanceRemainingNm")?.value);
    expect(distanceNm).toBeGreaterThan(100);
    expect(predictivePhase(aircraft, destination)).not.toBe("APPROACH");
  });

  it("recognizes approach near the destination even when the receiver is far away", () => {
    const now = Date.parse("2026-01-01T12:00:00Z");
    const receiver = { lat: 49.226, lon: 17.67, name: "Zlín" };
    const aircraft = normalizeAircraft({ hex: "ABC123", lat: 50.09, lon: 14.28, alt_baro: 1_200, gs: 110, baro_rate: -400, seen: 0, seen_pos: 0 }, receiver, new Date(now));
    if (!aircraft) throw new Error("aircraft could not be normalized");
    aircraft.onGround = false;
    const destination = { icaoCode: "LKPR", iataCode: "PRG", name: "Prague", city: null, country: null, latitude: 50.1008, longitude: 14.2632 };
    expect(aircraft.distanceKm).toBeGreaterThan(50);
    expect(predictivePhase(aircraft, destination)).toBe("APPROACH");
    aircraft.enrichment = { route: { callsign: "TEST", airline: null, airlineIcao: null, airlineIata: null, origin: null, destination: "LKPR", originAirport: null, destinationAirport: destination } };
    expect(isAirportProximity(aircraft)).toBe(true);
  });

  it("retains real runway change provenance for the bounded event window", () => {
    const now = Date.parse("2026-01-01T12:00:00Z");
    const runwayGeometry: PredictionRunway = {
      leIdent: "06",
      heIdent: "24",
      leLatitude: 50.10,
      leLongitude: 14.22,
      leHeadingDegT: 60,
      heLatitude: 50.10,
      heLongitude: 14.30,
      heHeadingDegT: 240,
      closed: false,
    };
    const previous: PredictiveFlightState = {
      modelVersion: "predictive-intelligence-v1",
      evaluatedAt: now - 30_000,
      eta: { estimatedArrivalAt: null, confidence: "UNKNOWN", evidence: [] },
      runway: { runway: "06", alternative: "24", changedFrom: null, changedAt: null, confidence: "MEDIUM", changed: false, evidence: [] },
      trajectory: { state: "NORMAL", confidence: "MEDIUM", evidence: [] },
    };
    const currentSample = sample(now, 50.10, 14.18, 240);
    const first = evaluatePredictiveIntelligence({
      flightState: { aircraftIcao: "ABC123", timestamp: now, phase: "APPROACH", sample: currentSample, destination: "LKPR", destinationStatus: "KNOWN" },
      recentSamples: [sample(now - 60_000, 50.10, 14.10, 240), currentSample],
      destinationAirport: airport,
      runways: [runwayGeometry],
      airportOperations: {
        runwayUsage: [
          { designator: "24", arrivals: 10, total: 10 },
          { designator: "06", arrivals: 0, total: 10 },
        ],
      },
      previousPrediction: previous,
      now,
    }).prediction;

    expect(first.runway).toMatchObject({
      runway: "24",
      changed: true,
      changedFrom: "06",
      changedAt: now,
    });

    const carriedAt = now + 30_000;
    const carriedSample = sample(carriedAt, 50.10, 14.20, 240);
    const carried = evaluatePredictiveIntelligence({
      flightState: { aircraftIcao: "ABC123", timestamp: carriedAt, phase: "APPROACH", sample: carriedSample, destination: "LKPR", destinationStatus: "KNOWN" },
      recentSamples: [sample(carriedAt - 60_000, 50.10, 14.12, 240), carriedSample],
      destinationAirport: airport,
      runways: [runwayGeometry],
      airportOperations: {
        runwayUsage: [
          { designator: "24", arrivals: 10, total: 10 },
          { designator: "06", arrivals: 0, total: 10 },
        ],
      },
      previousPrediction: first,
      now: carriedAt,
    }).prediction;

    expect(carried.runway).toMatchObject({
      runway: "24",
      changed: true,
      changedFrom: "06",
      changedAt: now,
    });

    const expiredAt = now + RUNWAY_CHANGE_EVENT_WINDOW_MS + 1;
    const expiredSample = sample(expiredAt, 50.10, 14.21, 240);
    const expired = evaluatePredictiveIntelligence({
      flightState: { aircraftIcao: "ABC123", timestamp: expiredAt, phase: "APPROACH", sample: expiredSample, destination: "LKPR", destinationStatus: "KNOWN" },
      recentSamples: [sample(expiredAt - 60_000, 50.10, 14.13, 240), expiredSample],
      destinationAirport: airport,
      runways: [runwayGeometry],
      airportOperations: {
        runwayUsage: [
          { designator: "24", arrivals: 10, total: 10 },
          { designator: "06", arrivals: 0, total: 10 },
        ],
      },
      previousPrediction: carried,
      now: expiredAt,
    }).prediction;

    expect(expired.runway.changed).toBe(false);
    expect(expired.runway.changedFrom).toBeNull();
    expect(expired.runway.changedAt).toBeNull();
  });

  it("passes cached runway geometry through the live predictive input", () => {
    const now = Date.parse("2026-01-01T12:00:00Z");
    const destination = { icaoCode: "LKPR", iataCode: "PRG", name: "Prague", city: null, country: null, latitude: 50.1008, longitude: 14.2632 };
    const aircraft = normalizeAircraft({ hex: "ABC123", lat: 50.08, lon: 14.3, alt_baro: 2_000, gs: 130, seen: 0, seen_pos: 0 }, { lat: 49.226, lon: 17.67, name: "Zlín" }, new Date(now));
    if (!aircraft) throw new Error("aircraft could not be normalized");
    aircraft.enrichment = { route: { callsign: "TEST", airline: null, airlineIcao: null, airlineIata: null, origin: null, destination: "LKPR", originAirport: null, destinationAirport: destination } };
    const runway = { id: 1, airportId: 1, sourceAirportIdent: "LKPR", lengthFt: 8_000, widthFt: 150, surface: "ASP", lighted: true, closed: false, leIdent: "12", leLatitude: 50.1, leLongitude: 14.23, leElevationFt: null, leHeadingDegT: 120, leDisplacedThresholdFt: null, heIdent: "30", heLatitude: 50.1, heLongitude: 14.30, heElevationFt: null, heHeadingDegT: 300, heDisplacedThresholdFt: null } satisfies AirportRunway;
    const input = buildPredictiveShadowInput(aircraft, now, [runway]);
    if (!input) throw new Error("predictive input was not built");
    expect(input.runways).toEqual([runway]);
    expect(evaluatePredictiveIntelligence(input).prediction.runway.evidence.some((item) => item.key === "reason" && item.value === "no runway geometry")).toBe(false);
  });
});
