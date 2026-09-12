import { afterEach, describe, expect, it, vi } from "vitest";
import type { StateSnapshot } from "@/lib/aircraft/types";

const mocks = vi.hoisted(() => ({ getAircraftStateService: vi.fn() }));
vi.mock("@/lib/server/aircraft-state", () => ({ getAircraftStateService: mocks.getAircraftStateService }));

import { GET as getStream } from "@/app/api/stream/route";

function state(altitude: number): StateSnapshot {
  return {
    aircraft: [{
      icaoHex: "ABC123",
      callsign: "TEST123",
      registration: null,
      aircraftType: "A320",
      aircraftDescription: null,
      lat: 50,
      lon: 14,
      altitude,
      baroAltitude: altitude,
      geomAltitude: null,
      groundSpeed: 400,
      track: 90,
      verticalRate: 0,
      baroRate: 0,
      geomRate: null,
      squawk: "1200",
      category: "A3",
      emergency: null,
      rssi: -10,
      messages: 1,
      seenSeconds: 0,
      seenPosSeconds: 0,
      lastSeen: "2026-09-11T20:00:00.000Z",
      source: "ADS-B",
      origin: "local",
      sourceType: "adsb",
      onGround: false,
      distanceKm: 10,
      bearing: 180,
      trail: [],
      atc: null,
    }],
    relevantAtcFrequencies: [],
    receiver: { name: "Fixture", lat: 50, lon: 14 },
    fetchedAt: "2026-09-11T20:00:00.000Z",
    provider: "fixture",
    sourceOnline: true,
    lastSourceUpdate: "2026-09-11T20:00:00.000Z",
    sourceError: null,
    readsbOnline: true,
    lastReadsbUpdate: "2026-09-11T20:00:00.000Z",
    lastError: null,
    stats: { currentAircraft: 1, aircraftSeenToday: 1, uniqueAircraftToday: 1, maxConcurrentAircraft: 1, maxDistanceKm: 10, aircraftTypes: [], airlines: [], messagesPerSecond: 1 },
  };
}

async function readEvent(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<{ event: string; data: Record<string, unknown> }> {
  const result = await reader.read();
  expect(result.done).toBe(false);
  const text = new TextDecoder().decode(result.value);
  const event = text.match(/^event: ([^\n]+)/m)?.[1];
  const data = text.match(/^data: ([^\n]+)/m)?.[1];
  if (!event || !data) throw new Error(`Invalid SSE frame: ${text}`);
  return { event, data: JSON.parse(data) as Record<string, unknown> };
}

describe("/api/stream protocol negotiation and cleanup", () => {
  afterEach(() => vi.clearAllMocks());

  it("keeps V1 as the default and emits V2 snapshot then delta when opted in", async () => {
    let current = state(20_000);
    let listener: ((snapshot: StateSnapshot) => void) | null = null;
    const unsubscribe = vi.fn();
    const service = {
      subscribe: vi.fn((callback: (snapshot: StateSnapshot) => void) => { listener = callback; return unsubscribe; }),
      getSnapshot: vi.fn(() => current),
    };
    mocks.getAircraftStateService.mockReturnValue(service);

    const v1 = await getStream(new Request("http://localhost/api/stream"));
    const v1Reader = v1.body!.getReader();
    const v1Event = await readEvent(v1Reader);
    expect(v1Event.event).toBe("snapshot");
    expect(v1Event.data.aircraft).toHaveLength(1);
    await v1Reader.cancel();
    expect(unsubscribe).toHaveBeenCalledTimes(1);

    const v2 = await getStream(new Request("http://localhost/api/stream?v=2"));
    const v2Reader = v2.body!.getReader();
    const initial = await readEvent(v2Reader);
    expect(initial.event).toBe("snapshot");
    expect(initial.data.protocol).toBe("airradar-sse-v2");
    expect(initial.data.sequence).toBe("1");

    current = state(21_000);
    const notify = listener as ((snapshot: StateSnapshot) => void) | null;
    if (notify) notify(current);
    const delta = await readEvent(v2Reader);
    expect(delta.event).toBe("delta");
    expect(delta.data.sequence).toBe("2");
    expect(delta.data.changed).toHaveLength(1);
    expect(delta.data.removed).toEqual([]);
    await v2Reader.cancel();
    expect(unsubscribe).toHaveBeenCalledTimes(2);
  });
});
