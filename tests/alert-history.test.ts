import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAlertHistoryPath, JsonlAlertHistoryStore } from "@/lib/server/alert-history";

const directories: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const aircraft = {
  icaoHex: "ABC123",
  callsign: "TEST123",
  registration: "OK-ABC",
  aircraftType: "A320",
  enrichment: { metadata: { registration: "OK-ABC", icaoTypeCode: "A320" } },
} as never;

describe("alert history", () => {
  it("appends safe event and delivery lines and folds the latest status", async () => {
    const directory = await mkdtemp(join(tmpdir(), "airradar-alert-history-"));
    directories.push(directory);
    const path = join(directory, "events.jsonl");
    const store = new JsonlAlertHistoryStore(path);
    await store.recordDetected({ id: "new:ABC123", detectedAt: "2026-09-08T12:00:00Z", type: "new_aircraft", reason: "new", aircraft });
    await store.recordNotification("new:ABC123", "attempted");
    await store.recordNotification("new:ABC123", "failed");

    const result = await store.list({ pageSize: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: "new:ABC123",
      notificationStatus: "failed",
      aircraft: { icaoHex: "ABC123", registration: "OK-ABC" },
      ruleIds: [],
      ruleNames: [],
      radiusKm: null,
      squawk: null,
    });
    expect(await readFile(path, "utf8")).not.toContain("secret");
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it("persists explicit watchlist radius and emergency metadata", async () => {
    const directory = await mkdtemp(join(tmpdir(), "airradar-alert-history-"));
    directories.push(directory);
    const store = new JsonlAlertHistoryStore(join(directory, "events.jsonl"));
    await store.recordDetected({
      id: "entered:ABC123",
      detectedAt: "2026-09-10T18:00:00Z",
      type: "entered_radius",
      reason: "entered_radius",
      aircraft,
      ruleIds: ["near"],
      ruleNames: ["Nearby test"],
      radiusKm: 50,
    });
    await store.recordDetected({
      id: "7700:ABC123",
      detectedAt: "2026-09-10T18:01:00Z",
      type: "emergency_7700",
      reason: "squawk_7700",
      aircraft,
      squawk: "7700",
    });

    const result = await store.list({ pageSize: 10 });
    expect(result.items[0]).toMatchObject({ type: "emergency_7700", squawk: "7700" });
    expect(result.items[1]).toMatchObject({
      type: "entered_radius",
      ruleIds: ["near"],
      ruleNames: ["Nearby test"],
      radiusKm: 50,
    });
  });

  it("keeps legacy JSONL entries readable after the v1.3 metadata extension", async () => {
    const directory = await mkdtemp(join(tmpdir(), "airradar-alert-history-"));
    directories.push(directory);
    const path = join(directory, "events.jsonl");
    await writeFile(path, `${JSON.stringify({
      kind: "detected",
      entry: {
        id: "legacy",
        detectedAt: "2026-09-08T12:00:00.000Z",
        type: "watchlist",
        reason: "watchlisted",
        aircraft: { icaoHex: "ABC123", registration: "OK-ABC", callsign: "TEST123", aircraftType: "A320" },
        record: null,
        notificationStatus: "pending",
        notificationAttemptedAt: null,
      },
    })}\n`, "utf8");

    expect((await new JsonlAlertHistoryStore(path).list()).items[0]).toMatchObject({
      id: "legacy",
      ruleIds: [],
      ruleNames: [],
      radiusKm: null,
      squawk: null,
    });
  });

  it("returns bounded pages", async () => {
    const directory = await mkdtemp(join(tmpdir(), "airradar-alert-history-"));
    directories.push(directory);
    const store = new JsonlAlertHistoryStore(join(directory, "events.jsonl"));
    for (let index = 0; index < 3; index += 1) {
      await store.recordDetected({ id: `watchlist:${index}`, detectedAt: `2026-09-08T12:0${index}:00Z`, type: "watchlist", reason: "watchlisted", aircraft });
    }
    expect(await store.list({ page: 0, pageSize: 2 })).toMatchObject({ page: 0, pageSize: 2, nextPage: 1, items: expect.any(Array) });
    expect(await store.list({ page: 1, pageSize: 2 })).toMatchObject({ page: 1, nextPage: null });
  });

  it("reloads from the same persistent file and isolates separate ledgers", async () => {
    const firstDirectory = await mkdtemp(join(tmpdir(), "airradar-alert-history-"));
    const secondDirectory = await mkdtemp(join(tmpdir(), "airradar-alert-history-"));
    directories.push(firstDirectory, secondDirectory);
    const firstPath = join(firstDirectory, "events.jsonl");
    const first = new JsonlAlertHistoryStore(firstPath);
    await first.recordDetected({ id: "first", detectedAt: "2026-09-08T12:00:00Z", type: "watchlist", reason: "watchlisted", aircraft });

    expect((await new JsonlAlertHistoryStore(firstPath).list()).items.map((entry) => entry.id)).toEqual(["first"]);
    expect((await new JsonlAlertHistoryStore(join(secondDirectory, "events.jsonl")).list()).items).toEqual([]);
  });

  it("uses the fixed production state path instead of an arbitrary environment path", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALERT_HISTORY_PATH", "/tmp/not-an-airradar-state-file.jsonl");
    expect(getAlertHistoryPath()).toBe("/var/lib/airradar/alert-events.jsonl");
  });

  it("rotates the physical JSONL ledger while retaining a bounded tail", async () => {
    const directory = await mkdtemp(join(tmpdir(), "airradar-alert-history-"));
    directories.push(directory);
    const path = join(directory, "events.jsonl");
    const store = new JsonlAlertHistoryStore(path, { maxBytes: 700, retentionBytes: 300 });
    for (let index = 0; index < 20; index += 1) await store.recordNotification(`notification-${index}`, "attempted");
    expect((await stat(path)).size).toBeLessThanOrEqual(700);
  });
});