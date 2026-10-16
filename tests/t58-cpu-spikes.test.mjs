import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { projectCpuSpikeSample, analyzeCpuSpikeSamples, cpuSpikeMarkdown } from "../scripts/t58-cpu-spikes.mjs";
const EPOCH=Date.parse("2026-10-16T00:00:00.000Z");
function raw(i,opts={}){
 const sys={detailLevel:"admin",application:{commit:"abcdef1234567890",version:"1.0.469"},
   runtime:{autocommitOperationAttribution:{processId:100,diagnosticsStoreId:"SECRET_STORE"},
     aircraftCount:62,cgroupCpuQuotaCores:2,cgroupCpuNrThrottled:i,cgroupCpuThrottledUsec:i*2500}};
 const perf={schemaVersion:4,scope:"process-local",runtime:{
   status:"enabled",cpuUserTimeMs:10000+i*4600,cpuSystemTimeMs:2000+i*500,
   gcTotalPauseMs:100+i*60,gcCount:200+i*3,majorGcCount:10+i,
   gcMaxPauseMs:18,eventLoopLagP99Ms:80+i},
   hotPaths:[{name:"snapshot.operationalTwin",cpuMs:100+i*1400},
    {name:"SECRET_ICAO_XYZ",cpuMs:200+i*999},
    {name:"snapshot.trackFusion",cpuMs:10+i*800}],
   validatorPaths:[{name:"twin.eventOutcome.local",cpuMs:90+i*1300}],
  };
 if(opts.cgroupMissing){sys.runtime.cgroupCpuNrThrottled=null;sys.runtime.cgroupCpuThrottledUsec=null;}
 return projectCpuSpikeSample(sys,perf,new Date(EPOCH+i*5000).toISOString());
}
describe("T58 read-only spike correlation",()=>{
 it("projects only allowlisted aggregate data and keeps identity out of report",()=>{
   const arr=Array.from({length:7},(_,i)=>raw(i));
   const report=analyzeCpuSpikeSamples(arr.map(x=>x.sample));
   const serialized=JSON.stringify(report)+cpuSpikeMarkdown(report);
   assert.equal(report.source.commit,"abcdef1234567890");
   assert.equal(report.source.samples,7);
   assert.equal(report.cgroup.observedIntervals,6);
   assert.equal(report.cgroup.totalNrThrottled,6);
   assert.equal(report.cgroup.totalThrottledUsec,15000);
   assert.equal(report.gc.totalPauseMs,360);
   assert.equal(report.gc.pauseTimeSharePercent,1.2);
   assert.equal(report.cpu.p50Percent,102);
   assert.ok(report.spikes.length>0);
   assert.equal(serialized.includes("SECRET"),false);
   assert.equal(serialized.includes("processId"),false);
   assert.equal(serialized.includes("diagnosticsStoreId"),false);
   assert.equal(serialized.includes("SECRET_ICAO_XYZ"),false);
 });
 it("missing cgroup metrics stay unknown instead of zero",()=>{
   const rows=Array.from({length:6},(_,i)=>raw(i,{cgroupMissing:true}).sample);
   const report=analyzeCpuSpikeSamples(rows);
   assert.equal(report.cgroup.coverageComplete,false);
   assert.equal(report.cgroup.observedIntervals,0);
   assert.equal(report.cgroup.unavailableIntervals,5);
   assert.match(report.interpretation[0],/cannot rule out throttling/);
 });
 it("fails closed on process counter reset, identity and interval discrepancies",()=>{
   const rows=Array.from({length:6},(_,i)=>raw(i).sample);
   assert.throws(()=>analyzeCpuSpikeSamples([...rows.slice(0,4),{...rows[4],cpuUserMs:0},rows[5]]),/counter_reset/);
   assert.throws(()=>analyzeCpuSpikeSamples([...rows.slice(0,4),{...rows[4],commit:"other"},rows[5]]),/version_changed/);
   assert.throws(()=>analyzeCpuSpikeSamples([...rows.slice(0,4),{...rows[4],at:rows[3].at},rows[5]]),/invalid_sample_spacing/);
   assert.throws(()=>analyzeCpuSpikeSamples(rows.slice(0,4)),/insufficient/);
 });
 it("requires admin/committed instrumentation and nonnegative counters",()=>{
   const status={detailLevel:"public",application:{commit:"abcdef123",version:"x"},runtime:{}};
   assert.throws(()=>projectCpuSpikeSample(status,{}),/required_telemetry/);
   const {sample}=raw(0);
   assert.equal(sample.hotPaths["SECRET_ICAO_XYZ"],undefined);
 });
});

import { classifyCpuSpikeFailure, collectCpuSpikeSamples } from "../scripts/t58-cpu-spike-collection.mjs";
import { buildCpuSpikeReport } from "../scripts/t58-cpu-spikes.mjs";

describe("T58 resilient bounded production collection", () => {
  function fixture({ slots = 8, failures = {}, changedIdentity = -1, post = null } = {}) {
    let step = 0, clock = 0;
    const checkpoints = [];
    const poll = async () => {
      const i = step++;
      if (failures[i]) throw failures[i];
      const value = raw(i);
      if (i === changedIdentity) value.identity.storeId = "CHANGED_PRIVATE_STORE";
      return value;
    };
    return {
      checkpoints,
      options: {
        slots, intervalMs: 1_000,
        now: () => clock,
        sleep: async ms => { clock += ms; },
        poll,
        checkpoint: async state => {
          checkpoints.push(JSON.parse(JSON.stringify(buildCpuSpikeReport(state))));
          if (post) await post(state);
        },
      },
    };
  }

  it("categorizes errors without preserving URLs, tokens, messages or stack", () => {
    assert.equal(classifyCpuSpikeFailure(Object.assign(new Error("The operation was aborted due to timeout"),{name:"TimeoutError"})), "http_timeout");
    assert.equal(classifyCpuSpikeFailure(new Error("Diagnostic request /api/system/status HTTP 503")), "http_failure");
    assert.equal(classifyCpuSpikeFailure(new Error("Diagnostic request /api/system/status HTTP 401")), "authentication_failure");
    assert.equal(classifyCpuSpikeFailure(Object.assign(new Error("fetch failed some-secret"),{name:"TypeError"})), "network_failure");
    assert.equal(classifyCpuSpikeFailure(new Error("t58_spike_required_telemetry_unavailable")), "telemetry_unavailable");
    assert.equal(classifyCpuSpikeFailure(new Error("secret token abc123")), "unexpected_error");
  });

  it("preserves completed samples through a transient timeout and excludes the gap", async () => {
    const fixtureValue = fixture({ failures: { 3: Object.assign(new Error("private URL timeout"),{name:"TimeoutError"}) } });
    const result = await collectCpuSpikeSamples(fixtureValue.options);
    const report = buildCpuSpikeReport(result);
    assert.equal(result.stopReason, "complete");
    assert.equal(result.samples.length, 8);
    assert.equal(report.collection.verdict, "PARTIAL");
    assert.equal(report.collection.failuresByCategory.http_timeout, 1);
    assert.equal(report.source.skippedIntervals, 1);
    assert.equal(report.source.intervals, 6);
    assert.equal(report.collection.failedSamples, 1);
    assert.equal(fixtureValue.checkpoints.length, 10);
    const encoded = JSON.stringify(fixtureValue.checkpoints);
    assert.equal(encoded.includes("PRIVATE_STORE"), false);
    assert.equal(encoded.includes("private URL"), false);
    assert.equal(encoded.includes("t58_spike_required_telemetry_unavailable"), false);
  });

  it("stops after bounded consecutive timeouts and retains a PARTIAL report", async () => {
    const fixtureValue = fixture({ failures: {
      5: new Error("Diagnostic request /api/system/status HTTP 503"),
      6: new Error("Diagnostic request /api/system/status HTTP 503"),
      7: new Error("Diagnostic request /api/system/status HTTP 503"),
    } });
    const state = await collectCpuSpikeSamples(fixtureValue.options);
    const report = buildCpuSpikeReport(state);
    assert.equal(state.stopReason, "consecutive_failures");
    assert.equal(state.attempts, 8);
    assert.equal(report.collection.verdict, "PARTIAL");
    assert.equal(report.collection.failuresByCategory.http_failure, 3);
    assert.equal(report.collection.validSamples, 5);
  });

  it("fails closed on process identity change and never serializes the private store ID", async () => {
    const f = fixture({ changedIdentity: 6 });
    const state = await collectCpuSpikeSamples(f.options);
    const report = buildCpuSpikeReport(state);
    assert.equal(state.stopReason, "identity_changed");
    assert.equal(report.collection.verdict, "INSUFFICIENT_EVIDENCE");
    assert.equal(report.collection.failuresByCategory.identity_changed, 1);
    assert.equal(JSON.stringify(report).includes("PRIVATE_STORE"), false);
    assert.equal(JSON.stringify(report).includes("CHANGED_PRIVATE_STORE"), false);
    assert.equal(f.checkpoints.at(-1).collection.stopReason, "identity_changed");
  });

  it("writes an insufficient-evidence checkpoint even if the first poll fails", async () => {
    const f = fixture({ failures: {
      0: new Error("t58_spike_required_telemetry_unavailable"),
    } });
    const state = await collectCpuSpikeSamples(f.options);
    const report = buildCpuSpikeReport(state);
    assert.equal(state.stopReason, "telemetry_unavailable");
    assert.equal(report.collection.verdict, "INSUFFICIENT_EVIDENCE");
    assert.equal(report.source.samples, 0);
    assert.equal(report.cpu, null);
    assert.match(cpuSpikeMarkdown(report), /INSUFFICIENT_EVIDENCE/);
    assert.equal(f.checkpoints.length >= 1, true);
  });

  it("rejects unbounded schedule and skips CPU differences across missing polls", async () => {
    const f = fixture({ slots: 121 });
    await assert.rejects(collectCpuSpikeSamples(f.options), /invalid_schedule/);
    const a = [raw(0).sample, {...raw(1).sample, slot: 1}, {...raw(4).sample, slot: 4},
      {...raw(5).sample, slot: 5}, {...raw(6).sample, slot: 6},
      {...raw(7).sample, slot: 7}, {...raw(8).sample, slot: 8}];
    a[0].slot=0;
    const report=analyzeCpuSpikeSamples(a);
    assert.equal(report.source.skippedIntervals,1);
    assert.equal(report.source.intervals,5);
  });
});
