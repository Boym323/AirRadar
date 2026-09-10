import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OgnStateSnapshot } from "@/lib/ogn/types";

const mocks = vi.hoisted(() => ({
  service: {
    waitForReady: vi.fn(),
    getSnapshot: vi.fn(),
    subscribe: vi.fn(),
  },
}));

vi.mock("@/lib/server/ogn-state", () => ({
  getOgnStateService: () => mocks.service,
}));

vi.mock("@/lib/server/sse-capacity", () => ({
  acquireSseClient: () => () => undefined,
}));

import { GET as getState } from "@/app/api/ogn/state/route";
import { GET as getStream } from "@/app/api/ogn/stream/route";

function anonymousSnapshot(): OgnStateSnapshot {
  return {
    enabled: true,
    status: "online",
    fetchedAt: "2026-09-10T12:00:00.000Z",
    targets: [{
      id: "anonymous-1",
      publicId: "anonymous-1",
      address: null,
      addressType: "flarm",
      senderCallsign: null,
      trackingSource: "flarm",
      latitude: 50,
      longitude: 14,
      altitudeFt: 3_000,
      groundSpeedKt: 96,
      trackDeg: 182,
      verticalRateFpm: null,
      turnRateDegPerSec: null,
      flightLevel: null,
      observedAt: "2026-09-10T11:59:59.000Z",
      receivedAt: "2026-09-10T12:00:00.000Z",
      aircraftType: "glider",
      registration: null,
      competitionNumber: null,
      model: null,
      identityVisible: false,
      stealth: false,
      noTracking: false,
      lastReceiver: null,
      distanceKm: 1,
      bearing: 90,
      stale: false,
    }],
  };
}

beforeEach(() => {
  mocks.service.waitForReady.mockResolvedValue(undefined);
  mocks.service.getSnapshot.mockReturnValue(anonymousSnapshot());
  mocks.service.subscribe.mockReturnValue(() => undefined);
});

describe("OGN public routes", () => {
  it("keeps anonymous receiver metadata private in REST", async () => {
    const response = await getState();
    const body = await response.json() as OgnStateSnapshot;

    expect(response.status).toBe(200);
    expect(body.targets[0].lastReceiver).toBeNull();
    expect(JSON.stringify(body)).not.toContain("LKXX");
  });

  it("keeps anonymous receiver metadata private in SSE", async () => {
    const controller = new AbortController();
    const response = await getStream(new Request("http://localhost/api/ogn/stream", { signal: controller.signal }));
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    const first = await reader!.read();
    const text = new TextDecoder().decode(first.value);

    expect(response.status).toBe(200);
    expect(text).toContain('"lastReceiver":null');
    expect(text).not.toContain("LKXX");
    controller.abort();
    await reader!.cancel();
  });
});
