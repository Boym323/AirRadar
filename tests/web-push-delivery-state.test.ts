import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { mockSendNotification, mockSetVapidDetails } = vi.hoisted(() => ({
  mockSendNotification: vi.fn(async (subscription: { endpoint: string }, payload: string) => { void subscription; void payload; }),
  mockSetVapidDetails: vi.fn((subject: string, publicKey: string, privateKey: string) => { void subject; void publicKey; void privateKey; }),
}));
vi.mock("web-push", () => ({ default: { sendNotification: mockSendNotification, setVapidDetails: mockSetVapidDetails } }));

import { WebPushNotifier, getWebPushDiagnostics } from "@/lib/server/web-push";
import { listWebPushSubscriptions, saveWebPushSubscription } from "@/lib/server/web-push-store";

let directory: string;

afterEach(async () => {
  vi.unstubAllEnvs();
  mockSendNotification.mockClear();
  mockSetVapidDetails.mockClear();
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe("web push delivery contract", () => {
  it("sends a stored subscription through the provider adapter", async () => {
    directory = await mkdtemp(join(tmpdir(), "airradar-webpush-send-"));
    vi.stubEnv("AIRRADAR_RUNTIME_STATE_DIRECTORY", directory);
    vi.stubEnv("WEB_PUSH_PUBLIC_KEY", "public-key");
    vi.stubEnv("WEB_PUSH_PRIVATE_KEY", "private-key");
    vi.stubEnv("WEB_PUSH_SUBJECT", "mailto:admin@example.test");
    await saveWebPushSubscription({ endpoint: "https://push.example.test/sub", expirationTime: null, keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) } });

    const notifier = new WebPushNotifier();
    await notifier.send({ aircraft: { icaoHex: "ABC123", callsign: "TEST1", registration: null }, emergency: true, squawk: "7700", eventId: "event-1" });

    expect(mockSetVapidDetails).toHaveBeenCalledWith("mailto:admin@example.test", "public-key", "private-key");
    expect(mockSendNotification).toHaveBeenCalledTimes(1);
    expect(mockSendNotification.mock.calls[0]?.[0].endpoint).toBe("https://push.example.test/sub");
    expect(mockSendNotification.mock.calls[0]?.[1]).toContain("ABC123");
  });

  it("removes a subscription after the provider reports it expired", async () => {
    directory = await mkdtemp(join(tmpdir(), "airradar-webpush-expired-"));
    vi.stubEnv("AIRRADAR_RUNTIME_STATE_DIRECTORY", directory);
    vi.stubEnv("WEB_PUSH_PUBLIC_KEY", "public-key");
    vi.stubEnv("WEB_PUSH_PRIVATE_KEY", "private-key");
    vi.stubEnv("WEB_PUSH_SUBJECT", "mailto:admin@example.test");
    await saveWebPushSubscription({ endpoint: "https://push.example.test/expired", expirationTime: null, keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) } });
    mockSendNotification.mockRejectedValueOnce(Object.assign(new Error("expired"), { statusCode: 410 }));

    await new WebPushNotifier().send({ aircraft: { icaoHex: "ABC123", callsign: null, registration: null }, emergency: false });
    expect(await listWebPushSubscriptions()).toEqual([]);
  });

  it("reports configured transport without an event producer as unavailable", () => {
    vi.stubEnv("WEB_PUSH_PUBLIC_KEY", "public-key");
    vi.stubEnv("WEB_PUSH_PRIVATE_KEY", "private-key");
    vi.stubEnv("WEB_PUSH_SUBJECT", "mailto:admin@example.test");
    expect(getWebPushDiagnostics()).toMatchObject({ configured: true, producerAvailable: false, deliveryState: "UNAVAILABLE" });
  });
});
