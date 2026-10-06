import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const graduationSource = readFileSync(
  new URL("../lib/operational-twin/regional-attention-graduation.ts", import.meta.url),
  "utf8",
);
const routeSource = readFileSync(
  new URL("../app/api/admin/operational-twin/regional-attention-graduation/route.ts", import.meta.url),
  "utf8",
);
const calibrationRouteSource = readFileSync(
  new URL("../app/api/admin/operational-twin/calibration/route.ts", import.meta.url),
  "utf8",
);
const calibrationComponentSource = readFileSync(
  new URL("../components/digital-twin-calibration-center.tsx", import.meta.url),
  "utf8",
);

describe("Regional Attention Graduation V1 boundary", () => {
  it("is a pure readiness projection over outcome evidence", () => {
    expect(graduationSource).toContain("buildRegionalAttentionGraduation");
    expect(graduationSource).toContain('autoPromotion: false');
    expect(graduationSource).toContain("publicSemanticsRemainCanonical: true");
    expect(graduationSource).not.toContain("fetch(");
    expect(graduationSource).not.toContain("getPrisma");
    expect(graduationSource).not.toContain("setInterval");
    expect(graduationSource).not.toContain("setTimeout");
  });

  it("never graduates destination clusters or safety-product semantics", () => {
    expect(graduationSource).toContain("destinationClusterEligible: false");
    expect(graduationSource).toContain("collisionWarningEligible: false");
    expect(graduationSource).toContain("separationProductEligible: false");
  });

  it("keeps direct graduation diagnostics admin-only", () => {
    expect(routeSource).toContain("isWatchlistSessionValid(request)");
    expect(routeSource).toContain('"Cache-Control": "no-store"');
  });

  it("surfaces graduation in the Calibration Center without adding policy mutation", () => {
    expect(calibrationRouteSource).toContain("getRegionalAttentionGraduationReport()");
    expect(calibrationComponentSource).toContain('data-testid="calibration-regional-attention-graduation"');
    expect(calibrationComponentSource).toContain("manualPromotionEligible");
    expect(calibrationComponentSource).not.toContain("method: \"POST\"");
    expect(calibrationComponentSource).not.toContain("method: \"PATCH\"");
  });
});
