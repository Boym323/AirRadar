import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("standalone transition safety", () => {
  it("uses standalone only after runtime assets are fully prepared", async () => {
    const prepare = await readFile(new URL("../scripts/prepare-standalone.mjs", import.meta.url), "utf8");
    const start = await readFile(new URL("../scripts/start-production.mjs", import.meta.url), "utf8");

    expect(prepare).toContain(".airradar-runtime-ready");
    expect(prepare).toContain('writeFileSync(readyMarker, "standalone-v1\\n"');
    expect(start).toContain(".airradar-runtime-ready");
    expect(start).toContain("existsSync(standaloneReadyMarker)");
  });
});
