import { describe, expect, it } from "vitest";
import type { Aircraft } from "@/lib/aircraft/types";
import { destination } from "@/lib/atc-context/geometry";
import {
  TrackFusionOutcomeValidator,
  TrackFusionShadow,
  evaluateTrackFusionOutcomeDecision,
  type TrackFusionOutcomeSlice,
} from "@/lib/track-fusion";

const receiver = { lat: 49.2, lon: 17.7, name: "TEST" };
const baseNow = Date.parse("2026-10-05T10:00:00.000Z");

function aircraft(input: {
  hex?: string;
  origin: "local" | "adsblol";
  source: Aircraft["source"];
  lat: number | null;
  lon: number | null;
  lastSeenMs: number;
  groundSpeed?: number | null;
  track?: number | null;
  altitude?: number | null;
  verticalRate?: number | null;
}): Aircraft {
  return {
    icaoHex: input.hex ?? "ABC123",
    callsign: "TEST123",
    registration: null,
    aircraftType: null,
    aircraftDescription: null,
    lat: input.lat,
    lon: input.lon,
    altitude: input.altitude ?? 10_000,
    baroAltitude: input.altitude ?? 10_000,
    geomAltitude: null,
    groundSpeed: input.groundSpeed === undefined ? 360 : input.groundSpeed,
    track: input.track === undefined ? 90 : input.track,
    verticalRate: input.verticalRate === undefined ? 0 : input.verticalRate,
    baroRate: input.verticalRate === undefined ? 0 : input.verticalRate,
    geomRate: null,
    squawk: null,
    category: null,
    emergency: null,
    rssi: input.origin === "local" ? -12 : null,
    messages: input.origin === "local" ? 100 : null,
    seenSeconds: 0,
    seenPosSeconds: input.lat !== null && input.lon !== null ? 0 : null,
    lastSeen: new Date(input.lastSeenMs).toISOString(),
    source: input.source,
    origin: input.origin,
    provenance: {
      seenLocal: input.origin === "local",
      seenNetwork: input.origin !== "local",
      lastLocalSeen: input.origin === "local" ? new Date(input.lastSeenMs).toISOString() : null,
      lastNetworkSeen: input.origin !== "local" ? new Date(input.lastSeenMs).toISOString() : null,
      positionOrigin: input.lat !== null && input.lon !== null ? input.origin : null,
      positionSource: input.source,
    },
    sourceType: null,
    onGround: false,
    distanceKm: null,
    bearing: null,
    trail: [],
    targetState: null,
    operationalStatus: null,
    adsbTelemetry: null,
  };
}

function maps(local: Aircraft | null, network: Aircraft | null) {
  return {
    local: new Map(local ? [[local.icaoHex, local]] : []),
    network: new Map(network ? [[network.icaoHex, network]] : []),
  };
}

function truthFrom(
  origin: { lat: number; lon: number },
  seconds: number,
  observedAt: number,
): Aircraft {
  const distanceNm = 360 * seconds / 3600;
  const [lon, lat] = destination([origin.lon, origin.lat], distanceNm, 90);
  return aircraft({
    origin: "local",
    source: "ADS-B",
    lat,
    lon,
    lastSeenMs: observedAt,
    groundSpeed: 360,
    track: 90,
  });
}

function slice(input: Partial<TrackFusionOutcomeSlice> = {}): TrackFusionOutcomeSlice {
  return {
    samples: 600,
    fusedBetter: 330,
    canonicalBetter: 270,
    ties: 0,
    decisiveSamples: 600,
    netWinMargin: 0.1,
    canonicalMeanErrorNm: 0.5,
    fusedMeanErrorNm: 0.4,
    meanErrorRatio: 0.8,
    meanImprovementNm: 0.1,
    altitudeSamples: 500,
    canonicalMeanAltitudeErrorFt: 100,
    fusedMeanAltitudeErrorFt: 90,
    ...input,
  };
}

describe("Track Fusion Outcome Validation V1", () => {
  it("prospectively shows fused position beating local-first canonical against future LOCAL truth", () => {
    const local = aircraft({
      origin: "local",
      source: "MLAT",
      lat: 49.2,
      lon: 17.70,
      lastSeenMs: baseNow,
    });
    const network = aircraft({
      origin: "adsblol",
      source: "ADS-B",
      lat: 49.2,
      lon: 17.73,
      lastSeenMs: baseNow,
    });
    const shadow = new TrackFusionShadow();
    const evaluated = shadow.observe({
      ...maps(local, network),
      receiver,
      localStaleAfterMs: 15_000,
      networkStaleAfterMs: 15_000,
      now: baseNow,
    });
    expect(evaluated[0]?.position?.sourceClass).toBe("NETWORK");

    const validator = new TrackFusionOutcomeValidator();
    validator.observe({
      ...maps(local, network),
      evaluatedTracks: evaluated,
      receiver,
      localStaleAfterMs: 15_000,
      networkStaleAfterMs: 15_000,
      now: baseNow,
    });

    for (const seconds of [5, 15, 30]) {
      const truth = truthFrom({ lat: 49.2, lon: 17.73 }, seconds, baseNow + seconds * 1_000);
      validator.observe({
        ...maps(truth, network),
        evaluatedTracks: [],
        receiver,
        localStaleAfterMs: 15_000,
        networkStaleAfterMs: 15_000,
        now: baseNow + seconds * 1_000 + 500,
      });
    }

    const report = validator.report(new Date(baseNow + 31_000));
    expect(report.completed).toBe(3);
    expect(report.overall.fusedBetter).toBe(3);
    expect(report.overall.canonicalBetter).toBe(0);
    expect(report.overall.fusedMeanErrorNm).toBeLessThan(report.overall.canonicalMeanErrorNm!);
    expect(report.horizons["5"]?.samples).toBe(1);
    expect(report.decision).toBe("WAIT");
  });

  it("captures source handover outcome even inside the ordinary baseline throttle", () => {
    const shadow = new TrackFusionShadow();
    const validator = new TrackFusionOutcomeValidator();
    const local = aircraft({
      origin: "local",
      source: "ADS-B",
      lat: 49.2,
      lon: 17.7,
      lastSeenMs: baseNow,
    });
    const first = shadow.observe({
      ...maps(local, null),
      receiver,
      localStaleAfterMs: 15_000,
      networkStaleAfterMs: 15_000,
      now: baseNow,
    });
    validator.observe({
      ...maps(local, null),
      evaluatedTracks: first,
      receiver,
      localStaleAfterMs: 15_000,
      networkStaleAfterMs: 15_000,
      now: baseNow,
    });

    const [networkLon, networkLat] = destination([17.7, 49.2], 0.1, 90);
    const network = aircraft({
      origin: "adsblol",
      source: "ADS-B",
      lat: networkLat,
      lon: networkLon,
      lastSeenMs: baseNow + 1_000,
    });
    const handover = shadow.observe({
      ...maps(null, network),
      receiver,
      localStaleAfterMs: 15_000,
      networkStaleAfterMs: 15_000,
      now: baseNow + 1_000,
    });
    expect(handover[0]?.position?.sourceClass).toBe("NETWORK");
    validator.observe({
      ...maps(null, network),
      evaluatedTracks: handover,
      receiver,
      localStaleAfterMs: 15_000,
      networkStaleAfterMs: 15_000,
      now: baseNow + 1_000,
    });

    const truth = truthFrom({ lat: networkLat, lon: networkLon }, 5, baseNow + 6_000);
    validator.observe({
      ...maps(truth, network),
      evaluatedTracks: [],
      receiver,
      localStaleAfterMs: 15_000,
      networkStaleAfterMs: 15_000,
      now: baseNow + 6_500,
    });

    const report = validator.report(new Date(baseNow + 7_000));
    expect(report.scenarios.HANDOVER_LOCAL_TO_NETWORK.samples).toBe(1);
  });

  it("keeps decision WAIT until evidence gates are complete", () => {
    const result = evaluateTrackFusionOutcomeDecision({
      spanMinutes: 30,
      overall: slice({ samples: 120 }),
      horizons: [slice({ samples: 40 }), slice({ samples: 40 }), slice({ samples: 40 })],
      handover: slice({ samples: 4 }),
      expiredTruthRate: 0.1,
    });
    expect(result.decision).toBe("WAIT");
    expect(result.reasons).toEqual(expect.arrayContaining([
      "process_window_insufficient",
      "samples_insufficient",
      "horizon_samples_insufficient",
      "handover_samples_insufficient",
    ]));
  });

  it("fails complete evidence when fused state has no net benefit", () => {
    const result = evaluateTrackFusionOutcomeDecision({
      spanMinutes: 180,
      overall: slice({ netWinMargin: -0.08, meanErrorRatio: 1.15 }),
      horizons: [slice({ samples: 200 }), slice({ samples: 200 }), slice({ samples: 200 })],
      handover: slice({ samples: 40, meanErrorRatio: 1.2 }),
      expiredTruthRate: 0.1,
    });
    expect(result.complete).toBe(true);
    expect(result.decision).toBe("FAIL");
    expect(result.reasons).toEqual(expect.arrayContaining([
      "net_win_margin_low",
      "mean_error_ratio_high",
      "handover_mean_error_ratio_high",
    ]));
  });

  it("passes only when complete evidence demonstrates net benefit", () => {
    const result = evaluateTrackFusionOutcomeDecision({
      spanMinutes: 180,
      overall: slice(),
      horizons: [slice({ samples: 200 }), slice({ samples: 200 }), slice({ samples: 200 })],
      handover: slice({ samples: 40, meanErrorRatio: 0.9 }),
      expiredTruthRate: 0.1,
    });
    expect(result).toEqual({ decision: "PASS", reasons: [], complete: true });
  });
});
