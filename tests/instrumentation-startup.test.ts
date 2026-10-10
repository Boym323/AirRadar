import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  registerShutdownCoordinator: vi.fn(),
  startAircraftState: vi.fn(),
  startMapContext: vi.fn(async () => undefined),
  startRuntimeTelemetry: vi.fn(),
  startAlertDelivery: vi.fn(),
  startRuntimeHealthObservation: vi.fn(),
}));

vi.mock("@/lib/server/shutdown", () => ({
  registerShutdownCoordinator: mocks.registerShutdownCoordinator,
}));

vi.mock("@/lib/server/aircraft-state", () => ({
  getAircraftStateService: () => ({ start: mocks.startAircraftState }),
}));

vi.mock("@/lib/server/map-context", () => ({
  defaultMapContextArchiveService: { start: mocks.startMapContext },
}));

vi.mock("@/lib/server/runtime-telemetry", () => ({
  startRuntimeTelemetry: mocks.startRuntimeTelemetry,
}));

vi.mock("@/lib/server/alert-delivery-worker", () => ({
  getAlertDeliveryWorker: () => ({ start: mocks.startAlertDelivery }),
}));
vi.mock("@/lib/server/runtime-health-observation", () => ({
  startRuntimeHealthObservation: mocks.startRuntimeHealthObservation,
}));

describe("server instrumentation startup", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.registerShutdownCoordinator.mockClear();
    mocks.startAircraftState.mockClear();
    mocks.startMapContext.mockClear();
    mocks.startRuntimeTelemetry.mockClear();
    mocks.startAlertDelivery.mockClear();
    mocks.startRuntimeHealthObservation.mockClear();
  });

  it("starts aircraft collection eagerly with the Node runtime", async () => {
    await import("../instrumentation.node");

    expect(mocks.registerShutdownCoordinator).toHaveBeenCalledOnce();
    expect(mocks.startAircraftState).toHaveBeenCalledOnce();
    expect(mocks.startMapContext).toHaveBeenCalledOnce();
    expect(mocks.startRuntimeTelemetry).toHaveBeenCalledOnce();
    expect(mocks.startAlertDelivery).toHaveBeenCalledOnce();
    expect(mocks.startRuntimeHealthObservation).toHaveBeenCalledOnce();
  });
});
