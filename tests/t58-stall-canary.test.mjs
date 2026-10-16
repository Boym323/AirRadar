import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sanitizedStallEvent, summarizeCanarySamples } from "../scripts/t58-stall-canary.mjs";

describe("T58 canary report sanitization", () => {
  it("keeps only bounded safe fields and drops payloads and identities", () => {
    const result=sanitizedStallEvent({
      observedAt:"2026-10-16T12:00:00Z",overshootMs:4000,intervalCpuPercent:87,
      correlatedScope:{name:"snapshot.apply",overlapMs:3900,icao:"ABC123"},
      url:"/secret",token:"unsafe",payload:"ABC123",stack:"secret",
    });
    assert.deepEqual(result,{
      observedAt:"2026-10-16T12:00:00.000Z",overshootMs:4000,intervalCpuPercent:87,
      correlatedScope:"snapshot.apply",overlapMs:3900,
    });
    assert.ok(!JSON.stringify(result).includes("ABC123"));
  });
  it("rejects arbitrary scope names and bad timestamps", () => {
    const bad={observedAt:"2026-10-16T12:00:00Z",overshootMs:1000,
      correlatedScope:{name:"snapshot.ABC123/x",overlapMs:1000}};
    assert.equal(sanitizedStallEvent(bad)?.correlatedScope,null);
    assert.equal(sanitizedStallEvent({...bad,observedAt:"invalid"}),null);
  });
  it("deduplicates repeated bounded rings and counts correlation", () => {
    const ev={observedAt:"2026-10-16T12:00:00Z",overshootMs:1300};
    const summary=summarizeCanarySamples([
      {totalStalls:1,recentStalls:[ev],cpuPercent:20,rssMiB:900,eventLoopP99Ms:70},
      {totalStalls:1,recentStalls:[ev],cpuPercent:30,rssMiB:910,eventLoopP99Ms:80},
    ]);
    assert.equal(summary.distinctObservedStalls,1);
    assert.equal(summary.totalStalls,1);
    assert.equal(summary.cpuPercentP95,30);
    assert.deepEqual(summary.correlationCounts,{unattributed:1});
  });
});
