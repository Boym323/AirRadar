import { describe, expect, it } from "vitest";
import { getSseDiagnostics, recordSsePayload } from "@/lib/server/sse-capacity";

describe("bounded SSE traffic accounting", () => {
  it("accounts V1 and V2 aircraft payloads without retaining content", () => {
    const before = getSseDiagnostics();
    recordSsePayload("v1", "snapshot", 125);
    recordSsePayload("v2", "snapshot", 250);
    recordSsePayload("v2", "delta", 75, 2, 1);
    const after = getSseDiagnostics();
    expect(after.totalAircraftEvents - before.totalAircraftEvents).toBe(3);
    expect(after.totalAircraftBytes - before.totalAircraftBytes).toBe(450);
    expect(after.totalV1AircraftBytes - before.totalV1AircraftBytes).toBe(125);
    expect(after.totalV2AircraftBytes - before.totalV2AircraftBytes).toBe(325);
    expect(after.lastV1SnapshotBytes).toBe(125);
    expect(after.lastV2SnapshotBytes).toBe(250);
    expect(after.lastV2DeltaBytes).toBe(75);
  });
});
