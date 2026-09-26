import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acquireSseClient: vi.fn(),
  release: vi.fn(),
  unsubscribe: vi.fn(),
  subscribe: vi.fn(),
  getRecent: vi.fn(),
}));

vi.mock("@/lib/server/sse-capacity", () => ({
  acquireSseClient: mocks.acquireSseClient,
}));

vi.mock("@/lib/server/flight-intelligence", () => ({
  getFlightIntelligenceService: () => ({ subscribe: mocks.subscribe, getRecent: mocks.getRecent }),
}));

import { GET as getIntelligenceStream } from "@/app/api/intelligence/stream/route";

describe("/api/intelligence/stream", () => {
  beforeEach(() => {
    mocks.release.mockReset();
    mocks.unsubscribe.mockReset();
    mocks.subscribe.mockReset();
    mocks.subscribe.mockReturnValue(mocks.unsubscribe);
    mocks.getRecent.mockReset();
    mocks.getRecent.mockReturnValue([]);
    mocks.acquireSseClient.mockReset();
    mocks.acquireSseClient.mockReturnValue(mocks.release);
  });

  it("participates in the shared SSE capacity limit", async () => {
    mocks.acquireSseClient.mockReturnValueOnce(null);

    const response = await getIntelligenceStream(new Request("http://localhost/api/intelligence/stream"));

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("15");
    expect(mocks.subscribe).not.toHaveBeenCalled();
  });

  it("sends a recent-event snapshot after the listener is registered", async () => {
    mocks.getRecent.mockReturnValue([{
      eventKey: "ABC123:APPROACH:1",
      occurredAt: "2026-09-26T18:00:00.000Z",
    }]);

    const response = await getIntelligenceStream(new Request("http://localhost/api/intelligence/stream"));
    const reader = response.body!.getReader();
    const first = await reader.read();
    const text = new TextDecoder().decode(first.value);

    expect(mocks.subscribe).toHaveBeenCalledOnce();
    expect(mocks.getRecent).toHaveBeenCalledWith({ limit: 12 });
    expect(text).toContain("event: intelligence-snapshot");
    expect(text).toContain("ABC123:APPROACH:1");

    await reader.cancel();
  });

  it("releases capacity and unsubscribes when the consumer cancels", async () => {
    const response = await getIntelligenceStream(new Request("http://localhost/api/intelligence/stream"));
    const reader = response.body!.getReader();

    expect(response.status).toBe(200);
    expect(mocks.acquireSseClient).toHaveBeenCalledWith("v1", "anonymous", "intelligence");
    expect(mocks.subscribe).toHaveBeenCalledOnce();

    await reader.cancel();

    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
    expect(mocks.release).toHaveBeenCalledOnce();
  });
});
