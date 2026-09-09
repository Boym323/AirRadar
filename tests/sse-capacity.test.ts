import { describe, expect, it } from "vitest";
import { acquireSseClient, getActiveSseClientCount, MAX_SSE_CLIENTS } from "@/lib/server/sse-capacity";

describe("SSE capacity", () => {
  it("bounds active clients and makes release idempotent", () => {
    const releases = Array.from({ length: MAX_SSE_CLIENTS }, () => acquireSseClient());
    expect(releases.every(Boolean)).toBe(true);
    expect(acquireSseClient()).toBeNull();
    expect(getActiveSseClientCount()).toBe(MAX_SSE_CLIENTS);
    releases[0]?.();
    releases[0]?.();
    expect(getActiveSseClientCount()).toBe(MAX_SSE_CLIENTS - 1);
    releases.slice(1).forEach((release) => release?.());
    expect(getActiveSseClientCount()).toBe(0);
  });
});
