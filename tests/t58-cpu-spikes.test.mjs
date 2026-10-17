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
    {name:"snapshot.trackFusion",cpuMs:10+i*800},
    {name:"snapshot.network.ingest",cpuMs:10+i*120},
    {name:"ingest.network-beast",cpuMs:10+i*240}],
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
   assert.equal(arr[0].sample.hotPaths["ingest.network-beast"],10);
   assert.equal(arr[1].sample.hotPaths["snapshot.network.ingest"],130);
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
   assert.equal(report.cgroup.throttledIntervals,null);
   assert.equal(report.cgroup.totalNrThrottled,null);
   assert.equal(report.cgroup.totalThrottledUsec,null);
   assert.match(cpuSpikeMarkdown(report),/Cgroup throttle events \/ time \(us\) \| N\/A \/ N\/A/);
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

  it("retries the initial baseline after a transient HTTP failure", async () => {
    const f = fixture({ failures: { 0: new Error("Diagnostic request /api/system/status HTTP 503") } });
    const result = await collectCpuSpikeSamples(f.options);
    const report = buildCpuSpikeReport(result);
    assert.equal(result.stopReason, "complete");
    assert.equal(result.samples.length, 9);
    assert.equal(result.attempts, 10);
    assert.equal(report.collection.failuresByCategory.http_failure, 1);
    assert.equal(report.collection.verdict, "PARTIAL");
    assert.equal(f.checkpoints[0].collection.verdict, "INSUFFICIENT_EVIDENCE");
    assert.equal(f.checkpoints.at(-1).collection.validSamples, 9);
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

import { fetchCpuSpikeDiagnostic } from "../scripts/t58-cpu-spike-http.mjs";
import { SAMPLE_INTERVAL_MS } from "../scripts/t58-cpu-spikes.mjs";

describe("T58 quota-aware diagnostic HTTP", () => {
  const base = new URL("https://airradar.pomykal.cz/");

  it("uses six requests/minute per endpoint instead of exhausting the 12/min public quota", () => {
    assert.equal(SAMPLE_INTERVAL_MS, 10_000);
    assert.equal(60_000 / SAMPLE_INTERVAL_MS, 6);
    assert.equal(600_000 / SAMPLE_INTERVAL_MS + 1, 61);
  });

  it("has an explicit endpoint allowlist and never puts credentials in the URL", async () => {
    const calls = [];
    const transport = async (url, options) => {
      calls.push({ path: url.pathname, cookie: options.headers?.Cookie, cache: options.cache });
      return new Response(JSON.stringify({ scope: "process-local" }), { status: 200 });
    };
    const result = await fetchCpuSpikeDiagnostic(base, "SECRET_COOKIE", "runtime", transport);
    assert.equal(result.scope, "process-local");
    assert.deepEqual(calls, [{
      path: "/api/system/runtime-performance",
      cookie: "SECRET_COOKIE",
      cache: "no-store",
    }]);
    await assert.rejects(fetchCpuSpikeDiagnostic(base, null, "../secret", transport),
      /t58_spike_invalid_endpoint/);
    assert.equal(calls.length, 1);
  });

  it("reports sanitized endpoint-specific status codes 429, 503, 502", async () => {
    for (const [kind, status] of [
      ["status", 429], ["runtime", 429],
      ["status", 503], ["runtime", 502],
    ]) {
      const transport = async () => new Response("SECRET_BODY", { status });
      await assert.rejects(fetchCpuSpikeDiagnostic(base, "SECRET_COOKIE", kind, transport), error => {
        assert.equal(error.message, "t58_spike_" + kind + "_http_" + status);
        assert.equal(classifyCpuSpikeFailure(error), kind + "_http_" + status);
        assert.equal(error.message.includes("SECRET"), false);
        return true;
      });
    }
  });

  it("keeps 401/403 fatal and rejects unrecognized status/body without leaking data", async () => {
    for (const status of [401, 403]) {
      await assert.rejects(
        fetchCpuSpikeDiagnostic(base, "SECRET", "status", async () =>
          new Response("SECRET_BODY", { status })),
        e => classifyCpuSpikeFailure(e) === "authentication_failure");
    }
    await assert.rejects(
      fetchCpuSpikeDiagnostic(base, "SECRET", "runtime", async () =>
        new Response("SECRET_BODY", { status: 418 })),
      e => classifyCpuSpikeFailure(e) === "runtime_http_other");
    await assert.rejects(
      fetchCpuSpikeDiagnostic(base, null, "runtime", async () =>
        new Response("SECRET_INVALID_JSON", { status: 200 })),
      e => classifyCpuSpikeFailure(e) === "telemetry_unavailable");
  });

  it("a complete ten-minute run with unknown cgroup counters passes with explicit limitations", async () => {
    let cursor = 0, clock = 0;
    const state = await collectCpuSpikeSamples({
      slots: 60, intervalMs: SAMPLE_INTERVAL_MS,
      now: () => clock,
      sleep: async ms => { clock += ms; },
      poll: async () => {
        const i = cursor++;
        const sample = raw(i, { cgroupMissing: true });
        sample.sample.at = new Date(EPOCH + i * SAMPLE_INTERVAL_MS).toISOString();
        return sample;
      },
      checkpoint: async () => {},
    });
    const report = buildCpuSpikeReport(state);
    assert.equal(state.stopReason, "complete");
    assert.equal(report.collection.plannedSamples, 61);
    assert.equal(report.collection.validSamples, 61);
    assert.equal(report.collection.failedSamples, 0);
    assert.equal(report.source.samplingIntervalSeconds, 10);
    assert.match(cpuSpikeMarkdown(report), /61\*\* at 10-second intervals/);
    assert.equal(report.source.intervals, 60);
    assert.equal(report.collection.verdict, "PASS_WITH_LIMITATIONS");
  });
});
