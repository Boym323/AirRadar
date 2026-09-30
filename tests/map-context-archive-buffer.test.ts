import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JsonArchive } from "@/lib/server/map-context";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("JsonArchive buffering", () => {
  it("coalesces replacements until an explicit flush and persists the latest snapshot", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "airradar-map-context-"));
    directories.push(directory);
    const file = path.join(directory, "archive.json");
    const archive = new JsonArchive(file, 10, (value): value is { id: number } => Boolean(value && typeof value === "object" && "id" in value));

    await archive.replace([{ id: 1 }]);
    await archive.replace([{ id: 1 }, { id: 2 }]);
    await expect(readFile(file, "utf8")).rejects.toThrow();
    expect(archive.diagnosticsCounters()).toMatchObject({ dirty: true, pendingEntries: 2, flushes: 0, failures: 0 });

    await archive.flush();
    expect(JSON.parse(await readFile(file, "utf8")).entries).toEqual([{ id: 1 }, { id: 2 }]);
    expect(archive.diagnosticsCounters()).toMatchObject({ dirty: false, pendingEntries: 0, flushes: 1, failures: 0 });
  });
});
