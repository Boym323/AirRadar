import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Release Artifact Diet V1", () => {
  const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const prepareStandalone = readFileSync(new URL("../scripts/prepare-standalone.mjs", import.meta.url), "utf8");
  const productionStart = readFileSync(new URL("../scripts/start-production.mjs", import.meta.url), "utf8");
  const release = readFileSync(new URL("../deploy/release.sh", import.meta.url), "utf8");

  it("packages only the standalone runtime and BUILD_ID", () => {
    expect(workflow).toContain('cp -a -- .next/BUILD_ID "${artifact_root}/.next/BUILD_ID"');
    expect(workflow).toContain('cp -a -- .next/standalone "${artifact_root}/.next/standalone"');
    expect(workflow).not.toContain('cp -a -- .next "${artifact_root}/.next"');
  });

  it("never embeds the Next compiler cache in the standalone runtime", () => {
    expect(prepareStandalone).toContain('entry === "standalone" || entry === "cache"');
  });

  it("keeps the slim artifact aligned with production startup and release validation", () => {
    expect(productionStart).toContain('../.next/BUILD_ID');
    expect(productionStart).toContain('../.next/standalone/server.js');
    expect(release).toContain('"${PREPARED_BUILD_ROOT}/.next/BUILD_ID"');
    expect(release).toContain('"${staged_next}/standalone/server.js"');
  });
});
