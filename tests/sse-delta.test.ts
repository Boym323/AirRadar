import { describe, expect, it } from "vitest";
import type { AircraftView, PublicStateSnapshot } from "@/lib/aircraft/types";
import { applySseV2Event } from "@/lib/aircraft/sse-v2";
import { SseDeltaEncoder } from "@/lib/server/sse-delta";
import { acquireSseClient, getSseDiagnostics, MAX_SSE_CLIENTS } from "@/lib/server/sse-capacity";

function aircraft(index: number, overrides: Partial<AircraftView> = {}): AircraftView {
  const hex = index.toString(16).padStart(6, "0").toUpperCase();
  return {
    icaoHex: hex,
    callsign: `TEST${String(index).padStart(3, "0")}`,
    registration: null,
    aircraftType: "A320",
    aircraftDescription: "Airbus A320",
    lat: 50 + index / 10_000,
    lon: 14 + index / 10_000,
    altitude: 20_000 + index,
    baroAltitude: 20_000 + index,
    geomAltitude: null,
    groundSpeed: 420,
    track: 90,
    verticalRate: 0,
    baroRate: 0,
    geomRate: null,
    squawk: "1200",
    category: "A3",
    emergency: null,
    rssi: -10,
    messages: 100 + index,
    seenSeconds: 0.2,
    seenPosSeconds: 0.2,
    lastSeen: "2026-09-11T20:00:00.000Z",
    source: "ADS-B",
    origin: "local",
    provenance: {
      seenLocal: true,
      seenNetwork: false,
      lastLocalSeen: "2026-09-11T20:00:00.000Z",
      lastNetworkSeen: null,
      positionOrigin: "local",
      positionSource: "ADS-B",
    },
    sourceType: "adsb",
    onGround: false,
    distanceKm: index + 1,
    bearing: 180,
    enrichment: { route: { callsign: `TEST${String(index).padStart(3, "0")}`, airline: null, airlineIcao: null, airlineIata: null, origin: null, destination: null, originAirport: null, destinationAirport: null, source: "fixture", retrievedAt: "2026-09-11T20:00:00.000Z" } },
    atc: null,
    ...overrides,
  };
}

function snapshot(aircraftList: AircraftView[]): PublicStateSnapshot {
  return {
    aircraft: aircraftList,
    relevantAtcFrequencies: [],
    receiver: { name: "Fixture receiver", lat: 50.08, lon: 14.44 },
    fetchedAt: "2026-09-11T20:00:00.000Z",
    provider: "fixture",
    sourceOnline: true,
    lastSourceUpdate: "2026-09-11T20:00:00.000Z",
    sourceError: null,
    readsbOnline: true,
    lastReadsbUpdate: "2026-09-11T20:00:00.000Z",
    lastError: null,
    stats: {
      currentAircraft: aircraftList.length,
      aircraftSeenToday: aircraftList.length,
      uniqueAircraftToday: aircraftList.length,
      maxConcurrentAircraft: aircraftList.length,
      maxDistanceKm: aircraftList.at(-1)?.distanceKm ?? 0,
      aircraftTypes: [{ name: "A320", count: aircraftList.length }],
      airlines: [],
      messagesPerSecond: 100,
    },
  };
}

function sseBytes(eventName: string, payload: unknown): number {
  return new TextEncoder().encode(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`).byteLength;
}

describe("SSE Delta V2", () => {
  it("converges from a full snapshot through changed, appeared and removed aircraft", () => {
    const initial = snapshot(Array.from({ length: 100 }, (_, index) => aircraft(index + 1)));
    const next = snapshot([
      ...Array.from({ length: 99 }, (_, index) => aircraft(index + 1, index === 0 ? { groundSpeed: 421 } : {})),
      aircraft(101),
    ]);
    next.aircraft = next.aircraft.filter((item) => item.icaoHex !== "000064");
    const encoder = new SseDeltaEncoder();
    const first = encoder.next(initial);
    const second = encoder.next(next);

    expect(first.event).toBe("snapshot");
    expect(second.event).toBe("delta");
    if (first.event !== "snapshot" || second.event !== "delta") throw new Error("unexpected event type");
    expect(second.payload.changed.map((item) => item.icaoHex)).toEqual(["000001", "000065"]);
    expect(second.payload.removed).toEqual(["000064"]);

    const appliedInitial = applySseV2Event(null, "snapshot", first.payload);
    expect(appliedInitial.status).toBe("applied");
    if (appliedInitial.status !== "applied") return;
    const appliedDelta = applySseV2Event({ snapshot: appliedInitial.snapshot, sequence: appliedInitial.sequence }, "delta", second.payload);
    expect(appliedDelta.status).toBe("applied");
    if (appliedDelta.status !== "applied") return;
    expect(new Map(appliedDelta.snapshot.aircraft.map((item) => [item.icaoHex, item]))).toEqual(new Map(next.aircraft.map((item) => [item.icaoHex, item])));
    expect(appliedDelta.snapshot.stats).toEqual(next.stats);
  });

  it("is materially smaller in steady state with a realistic 100-aircraft fixture", () => {
    const initial = snapshot(Array.from({ length: 100 }, (_, index) => aircraft(index + 1)));
    const next = snapshot(Array.from({ length: 100 }, (_, index) => aircraft(index + 1, index === 0 ? { groundSpeed: 421 } : {})));
    const encoder = new SseDeltaEncoder();
    const first = encoder.next(initial);
    const second = encoder.next(next);
    if (first.event !== "snapshot" || second.event !== "delta") throw new Error("unexpected event type");
    const v1FullBytes = sseBytes("snapshot", next);
    const v2InitialBytes = sseBytes("snapshot", first.payload);
    const v2DeltaBytes = sseBytes("delta", second.payload);
    const transitionEncoder = new SseDeltaEncoder();
    transitionEncoder.next(initial);
    const appearDisappear = snapshot([
      ...Array.from({ length: 99 }, (_, index) => aircraft(index + 1, index === 0 ? { groundSpeed: 421 } : {})),
      aircraft(101),
    ]);
    const transition = transitionEncoder.next(appearDisappear);
    const v2AppearDisappearDeltaBytes = sseBytes("delta", transition.payload);
    console.info(JSON.stringify({ aircraft: 100, v1FullBytes, v2InitialBytes, v2OneAircraftChangeDeltaBytes: v2DeltaBytes, v2AppearDisappearDeltaBytes, reductionPercent: Math.round((1 - v2DeltaBytes / v1FullBytes) * 1000) / 10 }));
    expect(v2InitialBytes).toBeGreaterThan(v1FullBytes);
    expect(v2DeltaBytes / v1FullBytes).toBeLessThan(0.25);
    expect(v2AppearDisappearDeltaBytes / v1FullBytes).toBeLessThan(0.25);
  });

  it("ignores duplicate deltas and rejects gaps or malformed payloads", () => {
    const initial = snapshot([aircraft(1)]);
    const encoder = new SseDeltaEncoder();
    const first = encoder.next(initial);
    const second = encoder.next(snapshot([aircraft(1, { altitude: 21_000 })]));
    if (first.event !== "snapshot" || second.event !== "delta") throw new Error("unexpected event type");
    const state = applySseV2Event(null, "snapshot", first.payload);
    if (state.status !== "applied") throw new Error("initial snapshot rejected");
    const current = { snapshot: state.snapshot, sequence: state.sequence };
    expect(applySseV2Event(current, "delta", second.payload).status).toBe("applied");
    expect(applySseV2Event({ snapshot: state.snapshot, sequence: "2" }, "delta", second.payload).status).toBe("duplicate");
    expect(applySseV2Event(current, "delta", { ...second.payload, sequence: "4" }).status).toBe("invalid");
    expect(applySseV2Event(current, "delta", { ...second.payload, changed: "not-an-array" }).status).toBe("invalid");
  });

  it("tracks V1/V2 capacity separately while enforcing the shared cap", () => {
    const releases: Array<() => void> = [];
    for (let index = 0; index < MAX_SSE_CLIENTS - 1; index += 1) {
      const release = acquireSseClient(index % 2 ? "v1" : "v2");
      expect(release).not.toBeNull();
      if (release) releases.push(release);
    }
    const last = acquireSseClient("v2");
    expect(last).not.toBeNull();
    if (last) releases.push(last);
    const overflow = acquireSseClient("v1");
    expect(overflow).toBeNull();
    const before = getSseDiagnostics();
    expect(before.activeClients).toBe(MAX_SSE_CLIENTS);
    expect(before.activeV1Clients + before.activeV2Clients).toBe(MAX_SSE_CLIENTS);
    if (overflow) overflow();
    for (const release of releases) release();
    expect(getSseDiagnostics().activeClients).toBe(0);
  });
});
