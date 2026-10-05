import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("validated production build artifact", () => {
  it("publishes the release build and passes it to automated deployment", async () => {
    const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
    expect(workflow).toContain("name: Package validated production build");
    expect(workflow).toContain("name: production-build-${{ github.sha }}");
    expect(workflow).toContain("actions/download-artifact@v8");
    expect(workflow).toContain("path: /tmp/airradar-ci-production-build");
    expect(workflow).toContain("sudo -n /var/www/airradar/deploy/release.sh");
  });

  it("verifies identity and checksum before reusing the CI build", async () => {
    const release = await readFile(new URL("../deploy/release.sh", import.meta.url), "utf8");
    expect(release).toContain("--build-artifact-dir");
    expect(release).toContain("stage_validated_build_artifact");
    expect(release).toContain("Validated build artifact checksum mismatch.");
    expect(release).toContain('metadata.commit !== commit');
    expect(release).toContain('tar -tzf "${archive}"');
    expect(release).toContain('stage_validated_build_artifact\n  else');
  });
});
