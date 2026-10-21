import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JsonArchive } from "@/lib/server/map-context";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });

describe("T12 retained archived AUP", () => {
  it("reads previously persisted AUP snapshots without network fetch", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "airradar-aup-"));
    directories.push(directory);
    const file = path.join(directory, "map-context-aup-v1.json");
    const entry = { status: "ok", issuedAt: "2026-09-18T09:00:00Z",
      validityStart: "2026-09-18T10:00:00Z", validityEnd: "2026-09-18T18:00:00Z",
      archivedAt: "2026-09-18T09:01:00Z", fetchedAt: "2026-09-18T09:01:00Z",
      aupReference: "historical", latestUupReference: null, uupCount: 0, windows: [] };
    const valid = (v: unknown): v is typeof entry =>
      Boolean(v && typeof v === "object" && "validityStart" in v);
    const writer = new JsonArchive(file, 10, valid);
    await writer.replace([entry]);
    await writer.flush();
    expect(await new JsonArchive(file, 10, valid).read()).toEqual([entry]);
  });
});
