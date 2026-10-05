import { describe, expect, it } from "vitest";
import type { Aircraft } from "@/lib/aircraft/types";
import { buildTrackFusionObservation, TrackFusionShadow } from "@/lib/track-fusion";

const receiver = { lat: 49.2, lon: 17.7, name: "TEST" };
const baseNow = Date.parse("2026-10-05T07:30:00.000Z");

function aircraft(input: {
  hex?: string;
  origin: "local" | "adsblol";
  source: Aircraft["source"];
  lat: number | null;
  lon: number | null;
  lastSeenMs?: number;
  groundSpeed?: number | null;
  track?: number | null;
  altitude?: number | null;
  verticalRate?: number | null;
}): Aircraft {
  const lastSeenMs = input.lastSeenMs ?? baseNow;
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
    groundSpeed: input.groundSpeed === undefined ? 300 : input.groundSpeed,
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
    lastSeen: new Date(lastSeenMs).toISOString(),
    source: input.source,
    origin: input.origin,
    provenance: {
      seenLocal: input.origin === "local",
      seenNetwork: input.origin !== "local",
      lastLocalSeen: input.origin === "local" ? new Date(lastSeenMs).toISOString() : null,
      lastNetworkSeen: input.origin !== "local" ? new Date(lastSeenMs).toISOString() : null,
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

describe("Track Fusion Shadow V1", () => {
  it("prefers a stronger local ADS-B position while retaining overlap residual", () => {
    const local = aircraft({ origin: "local", source: "ADS-B", lat: 49.2, lon: 17.7 });
    const network = aircraft({ origin: "adsblol", source: "ADS-B", lat: 49.201, lon: 17.701 });
    const shadow = new TrackFusionShadow();

    shadow.observe({
      ...maps(local, network),
      receiver,
      localStaleAfterMs: 15_000,
      networkStaleAfterMs: 15_000,
      now: baseNow,
    });

    const track = shadow.getTrack("ABC123");
    expect(track?.position?.sourceClass).toBe("LOCAL");
    expect(track?.quality).toBe("GOOD");
    expect(track?.overlap).toBe(true);
    expect(track?.positionResidualNm).not.toBeNull();
    expect(shadow.diagnostics().positionComparisons).toBe(1);
  });

  it("selects fields independently so network can fill missing local kinematics", () => {
    const local = aircraft({ origin: "local", source: "ADS-B", lat: 49.2, lon: 17.7, groundSpeed: null });
    const network = aircraft({ origin: "adsblol", source: "ADS-B", lat: 49.2, lon: 17.7, groundSpeed: 321 });
    const shadow = new TrackFusionShadow();

    shadow.observe({
      ...maps(local, network),
      receiver,
      localStaleAfterMs: 15_000,
      networkStaleAfterMs: 15_000,
      now: baseNow,
    });

    const track = shadow.getTrack("ABC123");
    expect(track?.position?.sourceClass).toBe("LOCAL");
    expect(track?.groundSpeed?.value).toBe(321);
    expect(track?.groundSpeed?.sourceClass).toBe("NETWORK");
    expect(shadow.diagnostics().fieldSelections.groundSpeed.network).toBe(1);
  });

  it("accepts a geometrically consistent LOCAL to NETWORK handover", () => {
    const shadow = new TrackFusionShadow();
    const local = aircraft({ origin: "local", source: "ADS-B", lat: 49.2, lon: 17.7, groundSpeed: 360, track: 90 });
    shadow.observe({
      ...maps(local, null),
      receiver,
      localStaleAfterMs: 15_000,
      networkStaleAfterMs: 15_000,
      now: baseNow,
    });

    const network = aircraft({
      origin: "adsblol",
      source: "ADS-B",
      lat: 49.2,
      lon: 17.712,
      groundSpeed: 360,
      track: 90,
      lastSeenMs: baseNow + 5_000,
    });
    shadow.observe({
      ...maps(null, network),
      receiver,
      localStaleAfterMs: 15_000,
      networkStaleAfterMs: 15_000,
      now: baseNow + 5_000,
    });

    expect(shadow.getTrack("ABC123")?.position?.sourceClass).toBe("NETWORK");
    expect(shadow.diagnostics().acceptedSourceTransitions).toBe(1);
    expect(shadow.diagnostics().rejectedSourceTransitions).toBe(0);
  });

  it("rejects an implausible source handover and briefly dead-reckons the prior track", () => {
    const shadow = new TrackFusionShadow();
    const local = aircraft({ origin: "local", source: "ADS-B", lat: 49.2, lon: 17.7, groundSpeed: 360, track: 90 });
    shadow.observe({
      ...maps(local, null),
      receiver,
      localStaleAfterMs: 15_000,
      networkStaleAfterMs: 15_000,
      now: baseNow,
    });

    const network = aircraft({
      origin: "adsblol",
      source: "ADS-B",
      lat: 49.2,
      lon: 18.5,
      groundSpeed: 360,
      track: 90,
      lastSeenMs: baseNow + 5_000,
    });
    shadow.observe({
      ...maps(null, network),
      receiver,
      localStaleAfterMs: 15_000,
      networkStaleAfterMs: 15_000,
      now: baseNow + 5_000,
    });

    const track = shadow.getTrack("ABC123");
    expect(track?.position?.sourceClass).toBe("ESTIMATED");
    expect(track?.quality).toBe("ESTIMATED");
    expect(track?.position?.protocol).toBe("handover-rejected-dead-reckoning");
    expect(shadow.diagnostics().rejectedSourceTransitions).toBe(1);
    expect(shadow.diagnostics().estimatedGapFills).toBe(1);
  });

  it("detects divergence from the existing canonical local-first position without changing it", () => {
    const local = aircraft({ origin: "local", source: "MLAT", lat: 49.2, lon: 17.7 });
    const network = aircraft({ origin: "adsblol", source: "ADS-B", lat: 49.2, lon: 17.73 });
    const shadow = new TrackFusionShadow();

    shadow.observe({
      ...maps(local, network),
      receiver,
      localStaleAfterMs: 15_000,
      networkStaleAfterMs: 15_000,
      now: baseNow,
    });

    const track = shadow.getTrack("ABC123");
    expect(track?.position?.sourceClass).toBe("NETWORK");
    expect(track?.canonicalPositionResidualNm).toBeGreaterThan(0.5);
    expect(shadow.diagnostics().canonicalPositionDivergences).toBe(1);
  });

  it("deduplicates unchanged observations", () => {
    const local = aircraft({ origin: "local", source: "ADS-B", lat: 49.2, lon: 17.7 });
    const shadow = new TrackFusionShadow();
    const input = {
      ...maps(local, null),
      receiver,
      localStaleAfterMs: 15_000,
      networkStaleAfterMs: 15_000,
      now: baseNow,
    };
    shadow.observe(input);
    shadow.observe({ ...input, now: baseNow + 1_000 });
    expect(shadow.diagnostics().evaluations).toBe(1);
    expect(shadow.diagnostics().dedupedEvaluations).toBe(1);
  });

  it("scores local ADS-B above local MLAT and network MLAT", () => {
    const localAdsb = buildTrackFusionObservation(aircraft({ origin: "local", source: "ADS-B", lat: 49.2, lon: 17.7 }), baseNow);
    const localMlat = buildTrackFusionObservation(aircraft({ origin: "local", source: "MLAT", lat: 49.2, lon: 17.7 }), baseNow);
    const networkMlat = buildTrackFusionObservation(aircraft({ origin: "adsblol", source: "MLAT", lat: 49.2, lon: 17.7 }), baseNow);
    expect(localAdsb.position!.score).toBeGreaterThan(localMlat.position!.score);
    expect(localMlat.position!.score).toBeGreaterThan(networkMlat.position!.score);
  });
});
