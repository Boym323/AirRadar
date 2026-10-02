import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPrisma: vi.fn(),
}));

vi.mock("@/lib/server/db", () => ({ getPrisma: mocks.getPrisma }));

import { AlertEngine } from "@/lib/server/alert-engine";

describe("AlertEngine canonical FlightEvent identity", () => {
  it("resolves the persisted numeric id when detector event.id is semantic", async () => {
    const first = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: 42 });
    const where = vi.fn(() => ({ first }));
    mocks.getPrisma.mockReturnValue({ orm: { public: { FlightEvent: { where } } } });

    const engine = new AlertEngine({ notifier: { name: "test", enabled: false, send: vi.fn() } });
    const id = await (engine as unknown as { resolvePersistedFlightEventId: (event: { id: string; eventKey: string }) => Promise<number | null> })
      .resolvePersistedFlightEventId({ id: "ABC123:CRUISE_ENTER:GLOBAL:0", eventKey: "ABC123:CRUISE_ENTER:GLOBAL:0" });

    expect(id).toBe(42);
    expect(where).toHaveBeenCalledWith({ eventKey: "ABC123:CRUISE_ENTER:GLOBAL:0" });
  });
});
