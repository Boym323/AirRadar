import { afterEach, describe, expect, it, vi } from "vitest";
import { createEnrichmentService, isFlightAwareEnabled } from "@/lib/server/providers";

describe("FlightAware configuration guard", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not enable FlightAware from an API key alone", () => {
    vi.stubEnv("FLIGHTAWARE_ENABLED", "false");
    vi.stubEnv("FLIGHTAWARE_API_KEY", "test-real-looking-key");

    const service = createEnrichmentService();

    expect(isFlightAwareEnabled()).toBe(false);
    expect(service.hasFlightPlanProvider).toBe(false);
  });

  it("rejects the production EMPTY placeholder even when explicitly enabled", () => {
    vi.stubEnv("FLIGHTAWARE_ENABLED", "true");
    vi.stubEnv("FLIGHTAWARE_API_KEY", "EMPTY");

    const service = createEnrichmentService();

    expect(isFlightAwareEnabled()).toBe(true);
    expect(service.hasFlightPlanProvider).toBe(false);
  });

  it("requires both explicit enablement and a usable key", () => {
    vi.stubEnv("FLIGHTAWARE_ENABLED", "true");
    vi.stubEnv("FLIGHTAWARE_API_KEY", "test-real-looking-key");

    const service = createEnrichmentService();

    expect(service.hasFlightPlanProvider).toBe(true);
    expect(service.getDiagnostics().flightPlan.enabled).toBe(true);
  });
});
