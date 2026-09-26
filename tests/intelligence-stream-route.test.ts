import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acquireSseClient: vi.fn(),
  release: vi.fn(),
  unsubscribe: vi.fn(),
  subscribe: vi.fn(),
}));

vi.mock("@/lib/server/sse-capacity", () => ({
  acquireSseClient: mocks.acquireSseClient,
}));

vi.mock("@/lib/server/flight-intelligence", () => ({
  getFlightIntelligenceService: () => ({ subscribe: mocks.subscribe }),
}));

import { GET as getIntelligenceStream } from "@/app/api/intelligence/stream/route";

describe("/api/intelligence/stream", () => {
  beforeEach(() => {
    mocks.release.mockReset();
    mocks.unsubscribe.mockReset();
    mocks.subscribe.mockReset();
    mocks.subscribe.mockReturnValue(mocks.unsubscribe);
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
