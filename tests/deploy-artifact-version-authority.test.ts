import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("automated deploy version authority", () => {
  it("uses the validated production artifact as the version source", () => {
    const release = readFileSync(new URL("../deploy/release.sh", import.meta.url), "utf8");
    const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

    expect(release).toContain('${PREPARED_BUILD_ROOT}/manifest.json');
    expect(release).toContain("Prepared build commit mismatch");
    expect(release).toContain("Prepared build has invalid stable version");
    expect(release).toContain('manifest.channel !== "production"');

    expect(workflow).toContain('/tmp/airradar-ci-production-build/manifest.json');
    expect(workflow).not.toContain('expected_version="$(node /var/www/airradar/scripts/version.mjs resolve-release-version --channel stable)"');
    expect(workflow).not.toContain('release_version="$(node /var/www/airradar/scripts/version.mjs resolve-release-version --channel stable)"');
  });
});
