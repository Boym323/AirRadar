import { describe, expect, it } from "vitest";
import { cgroupFileCandidates, readRuntimeDiagnostics } from "@/lib/server/runtime-diagnostics";

describe("runtime memory diagnostics", () => {
  it("prefers the cgroup belonging to the current process", () => {
    expect(cgroupFileCandidates("memory.current", "0::/system.slice/airradar.service\n")[0]).toBe(
      "/sys/fs/cgroup/system.slice/airradar.service/memory.current",
    );
    expect(cgroupFileCandidates("memory.max", "0::/system.slice/airradar.service\n")[0]).toBe(
      "/sys/fs/cgroup/system.slice/airradar.service/memory.max",
    );
  });

  it("returns safe process memory fields without requiring cgroup support", () => {
    const diagnostics = readRuntimeDiagnostics();
    expect(diagnostics.processRssBytes).toBeGreaterThan(0);
    expect(diagnostics.processRssAnonBytes).toBeGreaterThan(0);
    expect(diagnostics.processRssFileBytes).toBeGreaterThanOrEqual(0);
    expect(diagnostics.processPrivateDirtyBytes).toBeGreaterThan(0);
    expect(diagnostics.heapUsedBytes).toBeGreaterThan(0);
    expect(diagnostics.activeSseClients).toBeGreaterThanOrEqual(0);
  });
});
