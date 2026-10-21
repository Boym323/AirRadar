import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchAlertDelivery, formatPushoverDeliveryMessage, sendPushoverDelivery } from "@/lib/server/alert-delivery-worker";
import type { AlertV1Delivery, AlertV1DeliveryOccurrence } from "@/lib/server/alerts-fleets-repository";

const occurrence: AlertV1DeliveryOccurrence = {
  id: "alert-v1:r1:SQUAWK:s1",
  trigger: "SQUAWK",
  aircraftIcao: "ABC123",
  registration: "OK-TEST",
  callsign: "CSA123",
  occurredAt: "2026-10-06T12:00:00.000Z",
  payload: { squawk: "7700", latitude: 50.1, longitude: 14.2 },
};
const delivery: AlertV1Delivery = { id: "delivery-1", occurrenceId: occurrence.id, channel: "PUSHOVER", status: "PROCESSING", attemptCount: 1, nextAttemptAt: occurrence.occurredAt, claimedAt: occurrence.occurredAt, sentAt: null, lastError: null };

afterEach(() => vi.unstubAllEnvs());

describe("durable Pushover delivery", () => {
  it("formats useful alert context without sending coordinates", () => {
    const message = formatPushoverDeliveryMessage(occurrence);
    expect(message).toContain("CSA123");
    expect(message).toContain("Squawk 7700");
    expect(message).not.toContain("50.1");
    expect(message).not.toContain("14.2");
  });

  it("posts the occurrence using the existing credentials", async () => {
    vi.stubEnv("PUSHOVER_ENABLED", "true");
    vi.stubEnv("PUSHOVER_USER_KEY", "user-key");
    vi.stubEnv("PUSHOVER_API_TOKEN", "api-token");
    const fetcher = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response('{"status":1}', { status: 200 }),
    );
    await sendPushoverDelivery(delivery, occurrence, fetcher as typeof fetch);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const request = fetcher.mock.calls[0]?.[1];
    expect(request).toBeDefined();
    expect(String(request?.body)).toContain("token=api-token");
    expect(String(request?.body)).toContain("user=user-key");
    expect(String(request?.body)).toContain("Squawk+7700");
  });

  it.each([429, 503])("marks provider HTTP %s as retryable", async (status) => {
    vi.stubEnv("PUSHOVER_ENABLED", "true");
    vi.stubEnv("PUSHOVER_USER_KEY", "user-key");
    vi.stubEnv("PUSHOVER_API_TOKEN", "api-token");
    await expect(sendPushoverDelivery(delivery, occurrence, vi.fn(async () => new Response("{}", { status })) as typeof fetch)).rejects.toMatchObject({ retryable: true, status });
  });

  it("allows timeouts to propagate to the worker retry path", async () => {
    vi.stubEnv("PUSHOVER_ENABLED", "true");
    vi.stubEnv("PUSHOVER_USER_KEY", "user-key");
    vi.stubEnv("PUSHOVER_API_TOKEN", "api-token");
    await expect(sendPushoverDelivery(delivery, occurrence, vi.fn(async () => { throw new Error("timeout"); }) as typeof fetch))
      .rejects.toThrow("timeout");
  });

  it.each(["{}", "not-json", '{"status":0}'])("rejects false provider success payload %s", async (body) => {
    vi.stubEnv("PUSHOVER_ENABLED", "true");
    vi.stubEnv("PUSHOVER_USER_KEY", "user-key");
    vi.stubEnv("PUSHOVER_API_TOKEN", "api-token");
    await expect(sendPushoverDelivery(delivery, occurrence, vi.fn(async () => new Response(body, { status: 200 })) as typeof fetch))
      .rejects.toMatchObject({ retryable: false, status: 200 });
  });

  it("rejects unsupported channels without looking up or sending an occurrence", async () => {
    const repository = { getOccurrenceForDelivery: vi.fn(async () => occurrence) };
    const sender = vi.fn(async () => undefined);
    await expect(dispatchAlertDelivery({ ...delivery, channel: "WEB_PUSH" }, repository, sender))
      .rejects.toMatchObject({ retryable: false });
    expect(repository.getOccurrenceForDelivery).not.toHaveBeenCalled();
    expect(sender).not.toHaveBeenCalled();
  });

  it("dispatches supported channels only after loading the occurrence", async () => {
    const repository = { getOccurrenceForDelivery: vi.fn(async () => occurrence) };
    const sender = vi.fn(async () => undefined);
    await dispatchAlertDelivery(delivery, repository, sender);
    expect(repository.getOccurrenceForDelivery).toHaveBeenCalledWith(delivery.occurrenceId);
    expect(sender).toHaveBeenCalledWith(delivery, occurrence);
  });
});
