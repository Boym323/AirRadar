import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function detect(...paths: string[]) {
  const result = spawnSync(process.execPath, ["scripts/ci-critical-scope.mjs", "--stdin0"], {
    cwd: process.cwd(), input: paths.join("\0") + "\0", encoding: "utf8",
  });
  expect(result.status).toBe(0);
  return result.stdout;
}

describe("C5 CI critical-runtime gate", () => {
  it("runs isolated smoke for streaming, system diagnostics and deployment changes", () => {
    expect(detect("app/api/stream/route.ts")).toBe("true");
    expect(detect("lib/server/system-status.ts")).toBe("true");
    expect(detect("lib/server/sse-capacity.ts")).toBe("true");
    expect(detect("deploy/release.sh")).toBe("true");
    expect(detect("next.config.ts")).toBe("true");
  });
  it("skips docs, styles and unrelated UI to avoid redundant PR jobs", () => {
    expect(detect("README.md", "docs/RELEASE.md", "components/map.tsx")).toBe("false");
    expect(detect()).toBe("false");
  });
  it("considers all changed paths rather than only the first", () => {
    expect(detect("docs/RELEASE.md", "app/api/system/status/route.ts")).toBe("true");
  });
});
