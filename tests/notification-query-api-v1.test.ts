import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { JsonlAlertHistoryStore } from "@/lib/server/alert-history";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

const aircraft = {
  icaoHex: "ABC123",
  callsign: "CSA123",
  registration: "OK-ABC",
  aircraftType: "A320",
  enrichment: { metadata: { registration: "OK-ABC", icaoTypeCode: "A320" } },
} as never;

describe("Notification Query API V1", () => {
  it("filters by delivery status and identity/rule query before pagination", async () => {
    const directory = await mkdtemp(join(tmpdir(), "airradar-notification-query-"));
    directories.push(directory);
    const store = new JsonlAlertHistoryStore(join(directory, "events.jsonl"));
    await store.recordDetected({ id: "watch", detectedAt: "2026-10-07T10:00:00Z", type: "aircraft_appeared", reason: "appeared", aircraft, ruleIds: ["rule-1"], ruleNames: ["Prague watch"] });
    await store.recordNotification("watch", "delivered");
    await store.recordDetected({ id: "record", detectedAt: "2026-10-07T10:01:00Z", type: "reception_record", reason: "record", aircraft, ruleIds: ["rule-2"], ruleNames: ["Record only"] });
    await store.recordNotification("record", "center_only");

    expect((await store.list({ deliveryStatuses: ["delivered"], query: "csa123" })).items.map((entry) => entry.id)).toEqual(["watch"]);
    expect((await store.list({ deliveryStatuses: ["center_only"], query: "record only" })).items.map((entry) => entry.id)).toEqual(["record"]);
    expect((await store.list({ query: "OK-ABC", pageSize: 1 })).nextPage).toBe(1);
  });

  it("fails closed for an explicitly empty delivery filter", async () => {
    const directory = await mkdtemp(join(tmpdir(), "airradar-notification-query-"));
    directories.push(directory);
    const store = new JsonlAlertHistoryStore(join(directory, "events.jsonl"));
    await store.recordDetected({ id: "watch", detectedAt: "2026-10-07T10:00:00Z", type: "watchlist", reason: "watchlisted", aircraft });
    expect((await store.list({ deliveryStatuses: [] })).items).toEqual([]);
  });
});
