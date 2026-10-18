import { describe, expect, it } from "vitest";
import type { AircraftView, PublicStateSnapshot } from "@/lib/aircraft/types";
import { applySseV2Event, shouldRebuildSseV2Order, SSE_V2_PROTOCOL } from "@/lib/aircraft/sse-v2";
import { SseDeltaEncoder } from "@/lib/server/sse-delta";
import { encodeAircraftSseFrame } from "@/lib/server/sse-wire";
import { acquireSseClient, getSseDiagnostics, MAX_SSE_CLIENTS } from "@/lib/server/sse-capacity";
import { getRuntimePerformanceDiagnostics, resetRuntimePerformanceDiagnosticsForTests } from "@/lib/server/runtime-performance";

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
  it("measures only uncached frame serialization and counts its aircraft", () => {
    resetRuntimePerformanceDiagnosticsForTests();
    const current = snapshot([aircraft(41), aircraft(42)]);

    const first = encodeAircraftSseFrame(current, null);
    const second = encodeAircraftSseFrame(current, null);

    expect(second).toBe(first);
    expect(getRuntimePerformanceDiagnostics()["snapshot.sse-serialization"]).toMatchObject({
      calls: 1,
      processedAircraft: 2,
      cpuAttribution: "inclusive-process-overlap",
    });
  });

  it("shares wire bytes across legacy and aligned V2 clients without changing wire JSON", () => {
    const initial = snapshot([aircraft(1), aircraft(2)]);
    const changed = snapshot([aircraft(1, { altitude: 21_000 }), aircraft(2)]);
    const decoder = new TextDecoder();
    const legacyA = encodeAircraftSseFrame(initial, null);
    const legacyB = encodeAircraftSseFrame(initial, null);
    expect(legacyB).toBe(legacyA);
    expect(decoder.decode(legacyA)).toBe(`event: snapshot\ndata: ${JSON.stringify(initial)}\n\n`);
    expect(encodeAircraftSseFrame(changed, null)).not.toBe(legacyA);

    const first = new SseDeltaEncoder();
    const second = new SseDeltaEncoder();
    const initialA = first.next(initial);
    const initialB = second.next(initial);
    expect(encodeAircraftSseFrame(initial, initialB)).toBe(encodeAircraftSseFrame(initial, initialA));
    const deltaA = first.next(changed);
    const deltaB = second.next(changed);
    expect(deltaA.event).toBe("delta");
    expect(deltaB.event).toBe("delta");
    const encodedA = encodeAircraftSseFrame(changed, deltaA);
    const encodedB = encodeAircraftSseFrame(changed, deltaB);
    expect(encodedB).toBe(encodedA);
    expect(decoder.decode(encodedA)).toBe(`event: delta\ndata: ${JSON.stringify(deltaA.payload)}\n\n`);
    expect(encodedA).not.toBe(legacyA);
  });

  it("isolates different V2 sequences and evicts old wire-frame variants", () => {
    const initial = snapshot([aircraft(1)]);
    const changed = snapshot([aircraft(1, { groundSpeed: 451 })]);
    const first = new SseDeltaEncoder();
    first.next(initial);
    const common = first.next(changed);
    if (common.event !== "delta") throw new Error("expected delta");
    const firstBytes = encodeAircraftSseFrame(changed, common);
    const decoder = new TextDecoder();

    // A client which skipped some frames can share the same transition but
    // must never receive another client's sequence number.
    const delayed = new SseDeltaEncoder();
    delayed.next(initial);
    delayed.next(initial);
    const delayedDelta = delayed.next(changed);
    if (delayedDelta.event !== "delta") throw new Error("expected delta");
    const delayedBytes = encodeAircraftSseFrame(changed, delayedDelta);
    expect(delayedBytes).not.toBe(firstBytes);
    expect(decoder.decode(delayedBytes)).toContain('"sequence":"3"');
    expect(decoder.decode(firstBytes)).toContain('"sequence":"2"');

    for (let sequence = 4; sequence <= 12; sequence += 1) {
      const variant = { ...common, payload: { ...common.payload, sequence: String(sequence) } };
      const bytes = encodeAircraftSseFrame(changed, variant);
      expect(decoder.decode(bytes)).toContain(`"sequence":"${sequence}"`);
    }
    // The bounded per-transition cache no longer retains sequence 2.
    const regenerated = encodeAircraftSseFrame(changed, common);
    expect(regenerated).not.toBe(firstBytes);
    expect(decoder.decode(regenerated)).toBe(decoder.decode(firstBytes));
  });

  it("rejects delta before initialization without consuming sequence one", () => {
    const initial = snapshot([aircraft(1)]);
    const encoder = new SseDeltaEncoder();

    expect(() => encoder.delta(initial)).toThrow("requires an initial snapshot");
    const first = encoder.next(initial);
    expect(first.event).toBe("snapshot");
    expect(first.payload.sequence).toBe("1");
  });

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
    const unchangedBefore = appliedInitial.snapshot.aircraft.find((item) => item.icaoHex === "000002");
    const changedBefore = appliedInitial.snapshot.aircraft.find((item) => item.icaoHex === "000001");
    const appliedDelta = applySseV2Event({ snapshot: appliedInitial.snapshot, sequence: appliedInitial.sequence }, "delta", second.payload);
    expect(appliedDelta.status).toBe("applied");
    if (appliedDelta.status !== "applied") return;
    expect(new Map(appliedDelta.snapshot.aircraft.map((item) => [item.icaoHex, item]))).toEqual(new Map(next.aircraft.map((item) => [item.icaoHex, item])));
    expect(appliedDelta.snapshot.aircraft.find((item) => item.icaoHex === "000002")).toBe(unchangedBefore);
    expect(appliedDelta.snapshot.aircraft.find((item) => item.icaoHex === "000001")).not.toBe(changedBefore);
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

  it("switches to one order rebuild only for dense deltas", () => {
    expect(shouldRebuildSseV2Order(5_000, 1, 0)).toBe(false);
    expect(shouldRebuildSseV2Order(5_000, 31, 0)).toBe(false);
    expect(shouldRebuildSseV2Order(5_000, 400, 0)).toBe(true);
    expect(shouldRebuildSseV2Order(100, 32, 0)).toBe(true);
  });

  it("keeps distance ordering correct after a dense client delta", () => {
    const initialAircraft = Array.from({ length: 500 }, (_, index) => aircraft(index + 1));
    const initialSnapshot = snapshot(initialAircraft);
    const initialized = applySseV2Event(null, "snapshot", {
      ...initialSnapshot,
      protocol: SSE_V2_PROTOCOL,
      sequence: "1",
    });
    expect(initialized.status).toBe("applied");
    if (initialized.status !== "applied") return;

    const changed = initialAircraft.slice(0, 100).map((item, index) => ({
      ...item,
      distanceKm: 10_000 - index,
      groundSpeed: 430,
    }));
    const { aircraft: baselineAircraft, ...metadata } = snapshot(initialAircraft);
    expect(baselineAircraft).toHaveLength(initialAircraft.length);
    const applied = applySseV2Event(initialized.state, "delta", {
      ...metadata,
      protocol: SSE_V2_PROTOCOL,
      sequence: "2",
      changed,
      removed: [],
    });
    expect(applied.status).toBe("applied");
    if (applied.status !== "applied") return;

    expect(applied.snapshot.aircraft).toHaveLength(500);
    const distances = applied.snapshot.aircraft.map((item) => item.distanceKm ?? Number.POSITIVE_INFINITY);
    expect(distances).toEqual([...distances].sort((left, right) => left - right));
    expect(applied.snapshot.aircraft.filter((item) => item.groundSpeed === 430)).toHaveLength(100);
  });

  it("tracks V1/V2 capacity separately while enforcing the shared cap", () => {
    const releases: Array<() => void> = [];
    const channels = ["aircraft", "intelligence", "ogn", "system"] as const;
    for (let index = 0; index < MAX_SSE_CLIENTS - 1; index += 1) {
      const release = acquireSseClient(
        index % 2 ? "v1" : "v2",
        `capacity-client-${index}`,
        channels[index % channels.length]!,
      );
      expect(release).not.toBeNull();
      if (release) releases.push(release);
    }
    const last = acquireSseClient("v2", "capacity-client-last", "aircraft");
    expect(last).not.toBeNull();
    if (last) releases.push(last);
    const overflow = acquireSseClient("v1", "capacity-client-overflow", "intelligence");
    expect(overflow).toBeNull();
    const before = getSseDiagnostics();
    expect(before.activeClients).toBe(MAX_SSE_CLIENTS);
    expect(before.activeV1Clients + before.activeV2Clients).toBe(MAX_SSE_CLIENTS);
    if (overflow) overflow();
    for (const release of releases) release();
    expect(getSseDiagnostics().activeClients).toBe(0);
  });
});
