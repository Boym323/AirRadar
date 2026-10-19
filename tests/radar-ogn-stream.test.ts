import { describe, expect, it, vi } from "vitest";
import type { OgnStateSnapshot } from "@/lib/ogn/types";
import { subscribeToOgnStream } from "@/components/radar/use-radar-ogn-stream";

describe("radar OGN stream subscription", () => {
  it("applies enabled snapshots and closes the event source on cleanup", () => {
    const listener: { current: EventListener | null } = { current: null };
    const source = {
      addEventListener: vi.fn((_type: string, callback: EventListener) => { listener.current = callback; }),
      removeEventListener: vi.fn(),
      close: vi.fn(),
    };
    const onSnapshot = vi.fn();
    const cleanup = subscribeToOgnStream(onSnapshot, () => source);
    const snapshot: OgnStateSnapshot = {
      enabled: true,
      status: "online",
      fetchedAt: "2026-10-19T00:00:00.000Z",
      targets: [],
    };

    listener.current?.({ data: JSON.stringify(snapshot) } as MessageEvent<string> as Event);
    expect(onSnapshot).toHaveBeenCalledWith(snapshot);
    cleanup();
    listener.current?.({ data: JSON.stringify(snapshot) } as MessageEvent<string> as Event);

    expect(source.addEventListener).toHaveBeenCalledWith("snapshot", expect.any(Function));
    expect(source.removeEventListener).toHaveBeenCalledWith("snapshot", expect.any(Function));
    expect(source.close).toHaveBeenCalledOnce();
    expect(onSnapshot).toHaveBeenCalledOnce();
  });

  it("ignores disabled and malformed snapshots", () => {
    const listener: { current: EventListener | null } = { current: null };
    const source = {
      addEventListener: vi.fn((_type: string, callback: EventListener) => { listener.current = callback; }),
      removeEventListener: vi.fn(),
      close: vi.fn(),
    };
    const onSnapshot = vi.fn();
    const cleanup = subscribeToOgnStream(onSnapshot, () => source);

    listener.current?.({ data: JSON.stringify({ enabled: false }) } as MessageEvent<string> as Event);
    listener.current?.({ data: "{" } as MessageEvent<string> as Event);
    cleanup();

    expect(onSnapshot).not.toHaveBeenCalled();
  });
});
