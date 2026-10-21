import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listWebPushSubscriptions, parseWebPushSubscriptionInput, removeWebPushSubscription, saveWebPushSubscription } from "@/lib/server/web-push-store";

let directory: string;

afterEach(async () => {
  vi.unstubAllEnvs();
  if (directory) await rm(directory, { recursive: true, force: true });
});

const subscription = (index: number) => ({
  endpoint: `https://push.example.test/subscription/${index}`,
  expirationTime: null,
  keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) },
});

describe("web push subscription store", () => {
  it("validates protocol, endpoint, key lengths and expiration", () => {
    expect(parseWebPushSubscriptionInput(subscription(1))).not.toBeNull();
    expect(parseWebPushSubscriptionInput({ ...subscription(1), endpoint: "http://push.example.test/x" })).toBeNull();
    expect(parseWebPushSubscriptionInput({ ...subscription(1), endpoint: `https://x.test/${"x".repeat(2050)}` })).toBeNull();
    expect(parseWebPushSubscriptionInput({ ...subscription(1), expirationTime: Number.NaN })).toBeNull();
    expect(parseWebPushSubscriptionInput({ ...subscription(1), keys: { p256dh: "bad", auth: "A".repeat(22) } })).toBeNull();
  });

  it("serializes concurrent registration and removal writes without lost updates", async () => {
    directory = await mkdtemp(join(tmpdir(), "airradar-webpush-"));
    vi.stubEnv("AIRRADAR_RUNTIME_STATE_DIRECTORY", directory);
    await Promise.all(Array.from({ length: 24 }, (_, index) => saveWebPushSubscription(subscription(index))));
    expect(await listWebPushSubscriptions()).toHaveLength(24);
    await Promise.all(Array.from({ length: 12 }, (_, index) => removeWebPushSubscription(subscription(index).endpoint)));
    const saved = await listWebPushSubscriptions();
    expect(saved).toHaveLength(12);
    expect(saved.map((item) => item.endpoint).sort()).toEqual(Array.from({ length: 12 }, (_, index) => subscription(index + 12).endpoint).sort());
    expect((await stat(join(directory, "web-push-subscriptions-v1.json"))).mode & 0o777).toBe(0o600);
    expect(await readFile(join(directory, "web-push-subscriptions-v1.json"), "utf8")).not.toContain(".tmp");
  });
});
