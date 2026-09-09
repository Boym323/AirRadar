import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JsonlAlertHistoryStore } from "@/lib/server/alert-history";

afterEach(() => vi.unstubAllEnvs());

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
    const path = join(directory, "events.jsonl");
    const store = new JsonlAlertHistoryStore(path);
    await store.recordDetected({ id: "new:ABC123", detectedAt: "2026-09-08T12:00:00Z", type: "new_aircraft", reason: "new", aircraft });
    await store.recordNotification("new:ABC123", "attempted");
    await store.recordNotification("new:ABC123", "failed");

    const result = await store.list({ pageSize: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ id: "new:ABC123", notificationStatus: "failed", aircraft: { icaoHex: "ABC123", registration: "OK-ABC" } });
    expect(await readFile(path, "utf8")).not.toContain("secret");
  });

  it("returns bounded pages", async () => {
    const directory = await mkdtemp(join(tmpdir(), "airradar-alert-history-"));
    const store = new JsonlAlertHistoryStore(join(directory, "events.jsonl"));
    for (let index = 0; index < 3; index += 1) {
      await store.recordDetected({ id: `watchlist:${index}`, detectedAt: `2026-09-08T12:0${index}:00Z`, type: "watchlist", reason: "watchlisted", aircraft });
    }
    expect(await store.list({ page: 0, pageSize: 2 })).toMatchObject({ page: 0, pageSize: 2, nextPage: 1, items: expect.any(Array) });
    expect(await store.list({ page: 1, pageSize: 2 })).toMatchObject({ page: 1, nextPage: null });
  });
});
