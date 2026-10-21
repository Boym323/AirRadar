import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/system-status", () => ({
  readSystemStatus: vi.fn(async (_service: unknown, detail: "full" | "public") => ({ detail })),
}));

import { readSystemStatus } from "@/lib/server/system-status";
import { getSystemStatusStream } from "@/lib/server/system-status-stream";

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllTimers();
});

describe("shared system status polling", () => {
  it("uses one public poll for public listeners and one full poll only while an admin listens", async () => {
    vi.useFakeTimers();
    const stream = getSystemStatusStream();
    const publicListener = vi.fn();
    const secondPublicListener = vi.fn();
    const removePublic = stream.subscribe(publicListener, "public");
    const removeSecondPublic = stream.subscribe(secondPublicListener, "public");

    await vi.waitFor(() => expect(readSystemStatus).toHaveBeenCalledTimes(1));
    expect(readSystemStatus).toHaveBeenLastCalledWith(undefined, "public");

    const adminListener = vi.fn();
    const removeAdmin = stream.subscribe(adminListener, "full");
    await vi.waitFor(() => expect(readSystemStatus).toHaveBeenCalledTimes(2));
    expect(readSystemStatus).toHaveBeenLastCalledWith(undefined, "full");

    removeAdmin();
    removeSecondPublic();
    removePublic();
    expect(publicListener).toHaveBeenCalled();
    expect(adminListener).toHaveBeenCalledWith({ detail: "full" });
  });
});
