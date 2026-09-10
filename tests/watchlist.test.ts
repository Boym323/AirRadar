import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { aircraftWatchlistHref } from "@/lib/aircraft/detail-links";
import { getTranslations } from "@/lib/i18n";
import { getAlertCooldownMs } from "@/lib/server/config";
import { parseAlertRules } from "@/lib/server/alert-config";
import {
  createWatchlistRule,
  deleteWatchlistRule,
  listWatchlistRules,
  toPublicWatchlistResponse,
  updateWatchlistRule,
} from "@/lib/server/watchlist-store";
import type { StateSnapshot } from "@/lib/aircraft/types";

let directory: string;
let configPath: string;

function snapshot(): StateSnapshot {
  return {
    aircraft: [{
      icaoHex: "ABC123", callsign: "TEST123", registration: "OK-TEST", aircraftType: null, aircraftDescription: null,
      lat: null, lon: null, altitude: null, baroAltitude: null, geomAltitude: null, groundSpeed: null, track: null,
      verticalRate: null, baroRate: null, geomRate: null, squawk: null, category: null, emergency: null, rssi: null,
      messages: null, seenSeconds: 0, seenPosSeconds: 0, lastSeen: "2026-09-08T12:00:00.000Z", source: "ADS-B",
      sourceType: "adsb_icao", onGround: false, distanceKm: 12, bearing: 90,
    }],
    relevantAtcFrequencies: [], receiver: { lat: 50, lon: 14, name: "Test" }, fetchedAt: "2026-09-08T12:00:00.000Z",
    provider: "test", sourceOnline: true, lastSourceUpdate: "2026-09-08T12:00:00.000Z", sourceError: "secret provider error",
    readsbOnline: true, lastReadsbUpdate: "2026-09-08T12:00:00.000Z", lastError: "postgresql://secret", stats: {
      currentAircraft: 1, aircraftSeenToday: 1, uniqueAircraftToday: 1, maxConcurrentAircraft: 1, maxDistanceKm: 12,
      aircraftTypes: [], airlines: [], messagesPerSecond: null,
    },
  };
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "airradar-watchlist-"));
  configPath = join(directory, "alerts.json");
  vi.stubEnv("ALERT_COOLDOWN_MS", "30000");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

describe("server watchlist management", () => {
  it("lists and creates rules with normalized values", async () => {
    expect(await listWatchlistRules(configPath)).toEqual([]);
    const created = await createWatchlistRule({ id: "plane", name: " Test plane ", type: "icao", value: " abc123 ", enabled: true }, configPath);
    expect(created).toMatchObject({ id: "plane", name: "Test plane", type: "icaoHex", value: "ABC123", enabled: true });
    expect((await listWatchlistRules(configPath))).toHaveLength(1);
  });

  it("updates and toggles enabled state without changing the rule id", async () => {
    await createWatchlistRule({ id: "plane", name: "Plane", type: "icaoHex", value: "ABC123" }, configPath);
    const disabled = await updateWatchlistRule("plane", { enabled: false, value: "abc123" }, configPath);
    expect(disabled).toMatchObject({ id: "plane", enabled: false, value: "ABC123" });
    expect((await updateWatchlistRule("plane", { enabled: true }, configPath)).enabled).toBe(true);
  });

  it("deletes a rule", async () => {
    await createWatchlistRule({ id: "plane", name: "Plane", type: "icaoHex", value: "ABC123" }, configPath);
    await deleteWatchlistRule("plane", configPath);
    expect(await listWatchlistRules(configPath)).toEqual([]);
  });

  it("rejects invalid ICAO, distance and cooldown values", async () => {
    await expect(createWatchlistRule({ name: "bad", type: "icaoHex", value: "not-hex" }, configPath)).rejects.toMatchObject({ code: "invalid_icao" });
    await expect(createWatchlistRule({ name: "bad", type: "callsign", value: "TEST", maxDistanceKm: 0 }, configPath)).rejects.toMatchObject({ code: "invalid_distance" });
    expect(getAlertCooldownMs()).toBe(60_000);
    await expect(createWatchlistRule({ name: "bad", type: "callsign", value: "TEST", cooldownMs: 59_999 }, configPath)).rejects.toMatchObject({ code: "invalid_cooldown" });
    await expect(createWatchlistRule({ name: "ok", type: "callsign", value: "TEST", cooldownMs: 60_000 }, configPath)).resolves.toBeTruthy();
  });

  it("keeps duplicate handling aligned with current id semantics", async () => {
    await createWatchlistRule({ id: "same", name: "One", type: "callsign", value: "TEST" }, configPath);
    await expect(createWatchlistRule({ id: "same", name: "Duplicate", type: "callsign", value: "TEST" }, configPath)).rejects.toMatchObject({ code: "duplicate_rule" });
    await createWatchlistRule({ id: "other", name: "Same condition", type: "callsign", value: "TEST" }, configPath);
    expect((await listWatchlistRules(configPath)).map((rule) => rule.id)).toEqual(["same", "other"]);
  });

  it("persists atomically and serializes concurrent writes", async () => {
    await Promise.all([
      createWatchlistRule({ id: "one", name: "One", type: "callsign", value: "ONE" }, configPath),
      createWatchlistRule({ id: "two", name: "Two", type: "callsign", value: "TWO" }, configPath),
    ]);
    const source = await readFile(join(directory, "alerts.json"), "utf8");
    expect(JSON.parse(source)).toHaveLength(2);
    expect((await readdir(directory)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("exposes only safe current matching state and last-trigger metadata", async () => {
    const rule = await createWatchlistRule({ id: "plane", name: "Plane", type: "icaoHex", value: "abc123" }, configPath);
    const response = toPublicWatchlistResponse([rule], snapshot(), new Map([["plane", "2026-09-10T18:00:00.000Z"]]));
    expect(response.rules[0]?.currentState).toMatchObject({ status: "matching", aircraft: [{ icaoHex: "ABC123", registration: "OK-TEST", callsign: "TEST123" }] });
    expect(response.rules[0]?.lastTriggeredAt).toBe("2026-09-10T18:00:00.000Z");
    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain("secret provider error");
    expect(serialized).not.toContain("postgresql://secret");
    expect(serialized).not.toContain(directory);
  });

  it("defaults last-trigger metadata to null", async () => {
    const rule = await createWatchlistRule({ id: "plane", name: "Plane", type: "icaoHex", value: "abc123" }, configPath);
    expect(toPublicWatchlistResponse([rule], snapshot()).rules[0]?.lastTriggeredAt).toBeNull();
  });

  it("provides Czech and English UI dictionaries", () => {
    expect(getTranslations("cs").watchlist.pageTitle).toContain("Správa");
    expect(getTranslations("en").watchlist.pageTitle).toContain("Watchlist");
    expect(getTranslations("cs").watchlist.followAircraft).toBeTruthy();
    expect(getTranslations("en").watchlist.followAircraft).toBeTruthy();
  });

  it("prefills aircraft detail navigation with ICAO and registration", () => {
    expect(aircraftWatchlistHref("ABC123", "OK-TEST")).toBe("/watchlist?icaoHex=ABC123&registration=OK-TEST");
  });

  it("retains strict config validation for empty rules and positive distances", () => {
    const parsed = parseAlertRules([{ id: "empty", enabled: true, type: "callsign", value: "" }, { id: "zero", enabled: true, type: "callsign", value: "X", maxDistanceKm: 0 }]);
    expect(parsed.rules).toEqual([]);
    expect(parsed.errors.join(" ")).toContain("non-empty");
    expect(parsed.errors.join(" ")).toContain("positive");
  });
});