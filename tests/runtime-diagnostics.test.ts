import { describe, expect, it } from "vitest";
import { cgroupFileCandidates, parseCpuCgroupCounters, readRuntimeDiagnostics } from "@/lib/server/runtime-diagnostics";

describe("runtime memory diagnostics", () => {
  it("prefers the cgroup belonging to the current process", () => {
    expect(cgroupFileCandidates("memory.current", "0::/system.slice/airradar.service\n")[0]).toBe(
      "/sys/fs/cgroup/system.slice/airradar.service/memory.current",
    );
    expect(cgroupFileCandidates("memory.max", "0::/system.slice/airradar.service\n")[0]).toBe(
      "/sys/fs/cgroup/system.slice/airradar.service/memory.max",
    );
  });

  it("locates process-scoped cgroup CPU quota and throttle counters", () => {
    expect(cgroupFileCandidates("cpu.stat", "0::/system.slice/airradar.service\n")[0]).toBe(
      "/sys/fs/cgroup/system.slice/airradar.service/cpu.stat",
    );
    expect(cgroupFileCandidates("cpu.max", "2:cpu,cpuacct:/system.slice/airradar.service\n")[0]).toBe(
      "/sys/fs/cgroup/cpu/system.slice/airradar.service/cpu.max",
    );
  });


  it("parses cgroup v2 quota and microsecond throttling counters", () => {
    expect(parseCpuCgroupCounters({
      cpuMax: "150000 100000\n",
      cpuStat: "usage_usec 900000\nnr_periods 100\nnr_throttled 3\nthrottled_usec 12345\n",
      legacyQuota: null, legacyPeriod: null,
    })).toEqual({ cgroupCpuQuotaCores: 1.5, cgroupCpuNrThrottled: 3, cgroupCpuThrottledUsec: 12345 });
  });

  it("supports v1 throttled_time nanoseconds and -1 unlimited quota", () => {
    expect(parseCpuCgroupCounters({
      cpuMax: null, cpuStat: "nr_periods 4\nnr_throttled 2\nthrottled_time 1500000\n",
      legacyQuota: "200000", legacyPeriod: "100000",
    })).toEqual({ cgroupCpuQuotaCores: 2, cgroupCpuNrThrottled: 2, cgroupCpuThrottledUsec: 1500 });
    expect(parseCpuCgroupCounters({
      cpuMax: null, cpuStat: "nr_throttled 0\nthrottled_time 0",
      legacyQuota: "-1", legacyPeriod: "100000",
    })).toEqual({ cgroupCpuQuotaCores: null, cgroupCpuNrThrottled: 0, cgroupCpuThrottledUsec: 0 });
  });

  it("never treats missing or malformed counters as absence of throttling", () => {
    expect(parseCpuCgroupCounters({
      cpuMax: "max 100000", cpuStat: "nr_periods 4",
      legacyQuota: "50000", legacyPeriod: "100000",
    })).toEqual({ cgroupCpuQuotaCores: null, cgroupCpuNrThrottled: null, cgroupCpuThrottledUsec: null });
    expect(parseCpuCgroupCounters({
      cpuMax: null, cpuStat: null,
      legacyQuota: null, legacyPeriod: null,
    })).toEqual({ cgroupCpuQuotaCores: null, cgroupCpuNrThrottled: null, cgroupCpuThrottledUsec: null });
  });

  it("returns safe process memory fields without requiring cgroup support", () => {
    const diagnostics = readRuntimeDiagnostics();
    expect(diagnostics.processRssBytes).toBeGreaterThan(0);
    expect(diagnostics.processRssAnonBytes).toBeGreaterThan(0);
    expect(diagnostics.processRssFileBytes).toBeGreaterThanOrEqual(0);
    expect(diagnostics.processPrivateDirtyBytes).toBeGreaterThan(0);
    expect(diagnostics.heapUsedBytes).toBeGreaterThan(0);
    expect(diagnostics.activeSseClients).toBeGreaterThanOrEqual(0);
    expect(["available", "controller_disabled", "unavailable"])
      .toContain(diagnostics.cgroupCpuThrottleStatus);
  });

  it("does not allocate process-local DB attribution for public status", () => {
    const diagnostics = readRuntimeDiagnostics({}, "public");
    expect(diagnostics.transactionAttribution).toBeUndefined();
    expect(diagnostics.autocommitOperationAttribution).toBeUndefined();
    expect(diagnostics.systemStatusRequests).toBeUndefined();
    expect(diagnostics.activeSseClients).toBeGreaterThanOrEqual(0);
  });
});
