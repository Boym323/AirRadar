import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const systemSource = readFileSync(new URL("../lib/server/system-status.ts", import.meta.url), "utf8");
const projectionSource = readFileSync(new URL("../lib/server/system-status-projection.ts", import.meta.url), "utf8");
const diagnosticsSource = readFileSync(new URL("../lib/server/system-status-diagnostics.ts", import.meta.url), "utf8");

describe("system status module boundaries", () => {
  it("keeps public/admin redaction outside the provider orchestration module", () => {
    expect(systemSource).toContain('from "@/lib/server/system-status-projection"');
    expect(systemSource).not.toContain("function toPublicSystemStatus");
    expect(systemSource).not.toContain("function toAdminSystemStatus");
    expect(projectionSource).toContain("function toPublicSystemStatus");
    expect(projectionSource).toContain("processRssBytes: 0");
    expect(projectionSource).toContain('host: "hidden"');
  });

  it("keeps diagnostic state mapping in a pure module", () => {
    expect(systemSource).toContain('from "@/lib/server/system-status-diagnostics"');
    expect(systemSource).not.toContain("function weatherDiagnostic");
    expect(systemSource).not.toContain("function radarDiagnostic");
    expect(systemSource).not.toContain("function windDiagnostic");
    expect(diagnosticsSource).toContain("function weatherDiagnostic");
    expect(diagnosticsSource).toContain("function radarDiagnostic");
    expect(diagnosticsSource).toContain("function windDiagnostic");
    expect(diagnosticsSource).not.toContain("getPrisma");
    expect(diagnosticsSource).not.toContain("fetch(");
  });
});
