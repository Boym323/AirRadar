import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getPrisma: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getPrisma: mocks.getPrisma }));

import { getTimeMachineWindow, TIME_MACHINE_MAX_AIRCRAFT } from "@/lib/server/time-machine";

class Query<T> {
  private limitValue = Number.POSITIVE_INFINITY;
  constructor(private readonly rows: T[]) {}
  where(): this { return this; }
  orderBy(): this { return this; }
  include(): this { return this; }
  select(): this { return this; }
  limit(value: number): this { this.limitValue = value; return this; }
  async all(): Promise<T[]> { return this.rows.slice(0, this.limitValue); }
}

describe("Time Machine server window", () => {
  beforeEach(() => mocks.getPrisma.mockReset());

  it("keeps separate flight instances and reports truncation above the aircraft cap", async () => {
    const at = new Date("2026-09-22T08:00:00.000Z");
    const positions = Array.from({ length: TIME_MACHINE_MAX_AIRCRAFT + 1 }, (_, index) => ({
      flightId: index + 1,
      recordedAt: new Date(at.getTime() + index),
      lat: 50 + index / 100_000,
      lon: 14,
      altitude: 10_000,
      groundSpeed: 200,
      track: 90,
    }));
    const flights = Array.from({ length: TIME_MACHINE_MAX_AIRCRAFT + 1 }, (_, index) => ({
      id: index + 1,
      callsign: `TEST${index + 1}`,
      registration: null,
      aircraftType: "A320",
      origin: "LKPR",
      destination: "LOWW",
      aircraft: { icaoHex: "ABC123", registration: "OK-ABC", aircraftType: "A320" },
    }));

    mocks.getPrisma.mockReturnValue({
      orm: {
        public: {
          FlightPosition: new Query(positions),
          Flight: new Query(flights),
          FlightEvent: new Query([]),
        },
      },
    });

    const result = await getTimeMachineWindow(
      "2026-09-22T08:00:00.000Z",
      "2026-09-22T08:05:00.000Z",
    );

    expect(result.truncated).toBe(true);
    expect(result.aircraft).toHaveLength(TIME_MACHINE_MAX_AIRCRAFT);
    expect(new Set(result.aircraft.map((track) => track.id)).size).toBe(TIME_MACHINE_MAX_AIRCRAFT);
    expect(result.aircraft[0]).toMatchObject({ id: "ABC123:1", hex: "ABC123", flightId: 1 });
    expect(result.aircraft[1]).toMatchObject({ id: "ABC123:2", hex: "ABC123", flightId: 2 });
  });
});
