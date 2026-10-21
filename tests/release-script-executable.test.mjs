import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { statSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
describe("production release launcher permission contract", () => {
  it("stores deploy/release.sh as an executable Bash script", () => {
    const script = resolve(root, "deploy/release.sh");
    assert.ok((statSync(script).mode & 0o111) !== 0,
      "release.sh must carry Git executable bit (100755)");
    assert.match(readFileSync(script, "utf8").split("\n")[0], /^#!\/usr\/bin\/env bash$/);
  });
  it("keeps a fail-closed one-time legacy launcher fallback in the trusted deploy job", () => {
    const text = readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8");
    assert.match(text, /\[\[ -x "\$\{release_script\}" \]\]/);
    assert.match(text, /release_launcher=\(sudo -n \/bin\/bash "\$\{release_script\}"\)/);
    assert.match(text, /if "\$\{release_launcher\[\@\]\}" \\/);
    assert.match(text, /\-\-commit "\$\{GITHUB_SHA\}"/);
    assert.doesNotMatch(text, /chmod .*release_script/);
  });
});
