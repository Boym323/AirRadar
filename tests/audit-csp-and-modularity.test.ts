import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("audit modularity and CSP hardening", () => {
  it("keeps retired prediction and airport-sequencing modules absent", () => {
    for (const path of [
      "../lib/server/aircraft-predictive-projection.ts",
      "../components/airport-operations-controller.ts",
      "../lib/airport-intelligence/arrival-sequence-v7.ts",
      "../lib/airport-intelligence/arrival-flow-v8.ts",
    ]) expect(existsSync(new URL(path, import.meta.url)), path).toBe(false);
  });

  it("denies inline HTML event handler attributes while Next bootstrap remains supported", async () => {
    const configured = await nextConfig("phase-development-server").headers?.();
    const policy = configured?.find(route => route.source === "/(.*)")
      ?.headers.find(header => header.key === "Content-Security-Policy")?.value ?? "";
    expect(policy).toContain("script-src-attr 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
  });
});
