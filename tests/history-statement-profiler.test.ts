import { describe, expect, it } from "vitest";
import { HISTORY_STATEMENT_PHASES, HistoryStatementProfiler } from "@/lib/server/history-statement-profiler";

describe("opt-in history statement diagnostic", () => {
  it("records only fixed allowlisted phase counters without SQL or identities", () => {
    const profiler = new HistoryStatementProfiler();
    profiler.observe("aircraft.lookup", 12.5, true);
    profiler.observe("aircraft.lookup", 20, false);
    profiler.observe("position.write", -5, true);
    const result = profiler.diagnostics();
    expect(Object.keys(result.phases)).toEqual([...HISTORY_STATEMENT_PHASES]);
    expect(result.semantics).toMatchObject({ containsIdentities: false, containsQueries: false });
    expect(result.phases["aircraft.lookup"]).toEqual({ calls: 2, failures: 1, totalAwaitMs: 32.5, maxAwaitMs: 20, meanAwaitMs: 16.25 });
    expect(result.phases["position.write"].totalAwaitMs).toBe(0);
    expect(result.phases["flight.lookup"].meanAwaitMs).toBeNull();
    expect(JSON.stringify(result)).not.toContain("ABC123");
  });
});
