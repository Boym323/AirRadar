import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import { buildPredictiveShadowInput as fromCoordinator, predictivePhase as phaseFromCoordinator } from "@/lib/server/aircraft-state";
import { buildPredictiveShadowInput, predictivePhase } from "@/lib/server/aircraft-predictive-projection";

describe("audit modularity and CSP hardening", () => {
  it("keeps original prediction exports pointing at the pure implementation", () => {
    expect(fromCoordinator).toBe(buildPredictiveShadowInput);
    expect(phaseFromCoordinator).toBe(predictivePhase);
    const source = readFileSync(new URL("../lib/server/aircraft-predictive-projection.ts", import.meta.url), "utf8");
    expect(source).not.toContain("getPrisma");
    expect(source).not.toContain("setInterval(");
    expect(source).not.toContain("getAircraftStateService");
  });

  it("denies inline HTML event handler attributes while Next bootstrap remains supported", async () => {
    const configured = await nextConfig.headers?.();
    const policy = configured?.find(route => route.source === "/(.*)")
      ?.headers.find(header => header.key === "Content-Security-Policy")?.value ?? "";
    expect(policy).toContain("script-src-attr 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
  });
});
