import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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

  it("rewrites the generated server through the descriptor without corrupting it", async () => {
    const root = await mkdtemp(join(tmpdir(), "airradar-standalone-"));
    const distDir = join(root, ".next-release-test");
    const standaloneDir = join(distDir, "standalone");
    const serverPath = join(standaloneDir, "server.js");

    try {
      await mkdir(join(distDir, "static"), { recursive: true });
      await mkdir(standaloneDir, { recursive: true });
      await writeFile(join(distDir, "BUILD_ID"), "fixture-build\n", "utf8");
      await writeFile(join(distDir, "static", "fixture.js"), "fixture\n", "utf8");
      await writeFile(
        serverPath,
        'const config={"distDir":".next-release-test","distDirRoot":".next-release-test"};\n',
        "utf8",
      );

      const result = spawnSync(
        process.execPath,
        [fileURLToPath(new URL("../scripts/prepare-standalone.mjs", import.meta.url)), distDir],
        { cwd: root, encoding: "utf8" },
      );

      expect(result.status, result.stderr).toBe(0);
      const rewritten = await readFile(serverPath, "utf8");
      expect(rewritten).toContain('"distDir":"./.next"');
      expect(rewritten).toContain('"distDirRoot":".next"');
      expect(rewritten).not.toContain(".next-release-test");
      await expect(readFile(join(standaloneDir, ".airradar-runtime-ready"), "utf8")).resolves.toBe("standalone-v1\n");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
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
