import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  EVENT_REPLAY_RADIUS_MINUTES,
  eventReplayQuery,
  isEventReplayable,
} from "@/lib/intelligence/event-replay";
import {
  TIME_MACHINE_EVENT_REPLAY_MAX_WINDOW_MS,
  TIME_MACHINE_MAX_WINDOW_MS,
  validateTimeMachineWindow,
} from "@/lib/server/time-machine";

const intelligencePage = readFileSync(new URL("../app/intelligence/page.tsx", import.meta.url), "utf8");
const timeMachineSource = readFileSync(new URL("../components/time-machine.tsx", import.meta.url), "utf8");
const windowRoute = readFileSync(new URL("../app/api/time-machine/window/route.ts", import.meta.url), "utf8");

describe("Event Replay V1", () => {
  it("allows only the persisted Flight Intelligence event types in the V1 scope", () => {
    for (const type of ["GO_AROUND", "HOLDING", "DIVERSION", "UNUSUAL_TURN", "ORBIT"] as const) {
      expect(isEventReplayable(type)).toBe(true);
    }
    for (const type of ["APPROACH", "TAKEOFF", "TOP_OF_DESCENT", "AIRSPACE_ENTRY"] as const) {
      expect(isEventReplayable(type)).toBe(false);
    }
  });

  it("builds a stable Time Machine target around the persisted event", () => {
    expect(EVENT_REPLAY_RADIUS_MINUTES).toBe(10);
    expect(eventReplayQuery({
      type: "GO_AROUND",
      occurredAt: "2026-10-06T17:00:00.000Z",
      icaoHex: "abc123",
      flightId: 42,
    })).toEqual({
      at: "2026-10-06T17:00:00.000Z",
      replay: "10",
      hex: "ABC123",
      flightId: "42",
    });
    expect(eventReplayQuery({
      type: "APPROACH",
      occurredAt: "2026-10-06T17:00:00.000Z",
      icaoHex: "ABC123",
      flightId: 42,
    })).toBeNull();
  });

  it("keeps normal Time Machine windows at five minutes and bounds event replay at twenty", () => {
    expect(TIME_MACHINE_MAX_WINDOW_MS).toBe(5 * 60_000);
    expect(TIME_MACHINE_EVENT_REPLAY_MAX_WINDOW_MS).toBe(20 * 60_000);

    expect(() => validateTimeMachineWindow(
      "2026-10-06T17:00:00.000Z",
      "2026-10-06T17:06:00.000Z",
    )).toThrow("Historical window is too large");

    expect(() => validateTimeMachineWindow(
      "2026-10-06T16:50:00.000Z",
      "2026-10-06T17:10:00.000Z",
      TIME_MACHINE_EVENT_REPLAY_MAX_WINDOW_MS,
    )).not.toThrow();

    expect(() => validateTimeMachineWindow(
      "2026-10-06T16:49:59.000Z",
      "2026-10-06T17:10:00.000Z",
      TIME_MACHINE_EVENT_REPLAY_MAX_WINDOW_MS,
    )).toThrow("Historical window is too large");
  });

  it("wires Intelligence to replay mode without a new event or persistence engine", () => {
    expect(intelligencePage).toContain('data-testid="event-replay-action"');
    expect(intelligencePage).toContain('pathname: "/time-machine"');
    expect(timeMachineSource).toContain('params.get("replay") === String(EVENT_REPLAY_RADIUS_MINUTES)');
    expect(timeMachineSource).toContain('data-testid="event-replay-banner"');
    expect(timeMachineSource).toContain('"&mode=event-replay"');
    expect(timeMachineSource).toContain('setPendingEventTarget(target)');
    expect(windowRoute).toContain('url.searchParams.get("mode") === "event-replay"');
    expect(timeMachineSource).not.toContain("getFlightIntelligenceService");
  });
});
