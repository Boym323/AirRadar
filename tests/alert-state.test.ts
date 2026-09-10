import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { JsonAlertStateStore } from "@/lib/server/alert-state";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("persistent alert engine state", () => {
  it("writes a bounded state atomically and reloads it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "airradar-alert-state-"));
    directories.push(directory);
    const path = join(directory, "alert-engine-state.json");
    const store = new JsonAlertStateStore(path);
    store.save({
      dedup: [["rule:near:ABC123", 1_000]],
      permanent: [["new:ABC123", 900]],
      ruleLastTriggered: [["near", 1_000]],
    });

    expect(store.load()).toEqual({
      dedup: [["rule:near:ABC123", 1_000]],
      permanent: [["new:ABC123", 900]],
      ruleLastTriggered: [["near", 1_000]],
    });
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect((await readdir(directory)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
    const stored = JSON.parse(await readFile(path, "utf8")) as { version?: number; updatedAt?: string };
    expect(stored.version).toBe(1);
    expect(Date.parse(stored.updatedAt ?? "")).not.toBeNaN();
  });

  it("fails safe to empty state for malformed or unsupported files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "airradar-alert-state-"));
    directories.push(directory);
    const path = join(directory, "alert-engine-state.json");
    const store = new JsonAlertStateStore(path);

    await writeFile(path, "not-json", "utf8");
    expect(store.load()).toEqual({ dedup: [], permanent: [], ruleLastTriggered: [] });

    await writeFile(path, JSON.stringify({ version: 999, dedup: [["rule:x:Y", 1]] }), "utf8");
    expect(store.load()).toEqual({ dedup: [], permanent: [], ruleLastTriggered: [] });
  });

  it("drops malformed and out-of-range persisted entries instead of trusting them", async () => {
    const directory = await mkdtemp(join(tmpdir(), "airradar-alert-state-"));
    directories.push(directory);
    const path = join(directory, "alert-engine-state.json");
    await writeFile(path, JSON.stringify({
      version: 1,
      dedup: [["ok", 1], ["bad-time", "x"], ["out-of-range", Number.MAX_VALUE], ["", 2]],
      permanent: "bad",
      ruleLastTriggered: [["near", 3], ["invalid-date", Number.MAX_VALUE]],
    }), "utf8");

    expect(new JsonAlertStateStore(path).load()).toEqual({
      dedup: [["ok", 1]],
      permanent: [],
      ruleLastTriggered: [["near", 3]],
    });
  });
});
