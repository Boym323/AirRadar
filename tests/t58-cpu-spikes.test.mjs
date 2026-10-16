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
