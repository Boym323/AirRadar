import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("standalone transition safety", () => {
  it("keeps standalone server normalization on one open file descriptor", async () => {
    const prepare = await readFile(new URL("../scripts/prepare-standalone.mjs", import.meta.url), "utf8");

    expect(prepare).toContain('openSync(standaloneServer, "r+")');
    expect(prepare).toContain('readFileSync(standaloneServerFd, "utf8")');
    expect(prepare).toContain("writeSync(\n      standaloneServerFd,");
    expect(prepare).toContain("ftruncateSync(standaloneServerFd, normalizedBuffer.length)");
    expect(prepare).toContain("closeSync(standaloneServerFd)");
    expect(prepare).not.toContain("existsSync(standaloneServer)");
    expect(prepare).not.toContain("writeFileSync(standaloneServer,");
  });

  it("uses standalone only after runtime assets are fully prepared", async () => {
    const prepare = await readFile(new URL("../scripts/prepare-standalone.mjs", import.meta.url), "utf8");
    const start = await readFile(new URL("../scripts/start-production.mjs", import.meta.url), "utf8");

    expect(prepare).toContain(".airradar-runtime-ready");
    expect(prepare).toContain('writeFileSync(readyMarker, "standalone-v1\\n"');
    expect(prepare).toContain('resolve("data", "ats", "generated")');
    expect(prepare).toContain('resolve(standaloneDir, "data", "ats", "generated")');
    expect(prepare).toContain("cpSync(sourceAtsDir, standaloneAtsDir");
    expect(start).toContain(".airradar-runtime-ready");
    expect(start).toContain("existsSync(standaloneReadyMarker)");
  });
});
