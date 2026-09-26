import { describe, expect, it } from "vitest";
import {
  acquireSseClient,
  getActiveSseClientCount,
  MAX_SSE_CLIENTS,
  MAX_SSE_CLIENTS_PER_CHANNEL,
  MAX_SSE_CLIENTS_PER_CLIENT,
  type SseChannel,
} from "@/lib/server/sse-capacity";

describe("SSE capacity", () => {
  it("bounds active clients globally and makes release idempotent", () => {
    const channels: SseChannel[] = ["aircraft", "intelligence", "ogn"];
    const releases = Array.from({ length: MAX_SSE_CLIENTS }, (_, index) =>
      acquireSseClient(index % 2 === 0 ? "v1" : "v2", `client-${index}`, channels[index % channels.length]!));
    expect(releases.every(Boolean)).toBe(true);
    expect(acquireSseClient("v1", "overflow", "aircraft")).toBeNull();
    expect(getActiveSseClientCount()).toBe(MAX_SSE_CLIENTS);
    releases[0]?.();
    releases[0]?.();
    expect(getActiveSseClientCount()).toBe(MAX_SSE_CLIENTS - 1);
    releases.slice(1).forEach((release) => release?.());
    expect(getActiveSseClientCount()).toBe(0);
  });

  it("limits one client identity across all SSE endpoints", () => {
    const releases = Array.from({ length: MAX_SSE_CLIENTS_PER_CLIENT }, (_, index) =>
      acquireSseClient("v1", "203.0.113.10", index % 2 === 0 ? "aircraft" : "intelligence"));
    expect(releases.every(Boolean)).toBe(true);
    expect(acquireSseClient("v1", "203.0.113.10", "ogn")).toBeNull();

    releases[0]?.();
    const replacement = acquireSseClient("v1", "203.0.113.10", "ogn");
    expect(replacement).not.toBeNull();

    releases.slice(1).forEach((release) => release?.());
    replacement?.();
    expect(getActiveSseClientCount()).toBe(0);
  });

  it("keeps shared capacity available for another stream family", () => {
    const releases = Array.from({ length: MAX_SSE_CLIENTS_PER_CHANNEL }, (_, index) =>
      acquireSseClient("v2", `aircraft-${index}`, "aircraft"));
    expect(releases.every(Boolean)).toBe(true);
    expect(acquireSseClient("v2", "aircraft-overflow", "aircraft")).toBeNull();

    const intelligenceRelease = acquireSseClient("v1", "intelligence-client", "intelligence");
    expect(intelligenceRelease).not.toBeNull();

    releases.forEach((release) => release?.());
    intelligenceRelease?.();
    expect(getActiveSseClientCount()).toBe(0);
  });
});
