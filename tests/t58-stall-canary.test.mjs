import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { sanitizedStallEvent, summarizeCanarySamples, classifyStallEvidence } from "../scripts/t58-stall-canary.mjs";

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

describe("privileged T58 canary control", () => {
  const release = readFileSync(new URL("../deploy/release.sh", import.meta.url), "utf8");
  const root = readFileSync(new URL("../deploy/t58-canary-control.sh", import.meta.url), "utf8");
  const runner = readFileSync(new URL("../scripts/t58-stall-canary.sh", import.meta.url), "utf8");
  const rollback = readFileSync(new URL("../deploy/rollback-stall-canary.sh", import.meta.url), "utf8");

  it("validates bash syntax for every entrypoint without starting a service", () => {
    for (const file of [
      "deploy/release.sh",
      "deploy/t58-canary-control.sh",
      "deploy/rollback-stall-canary.sh",
      "scripts/t58-stall-canary.sh",
    ]) {
      execFileSync("bash", ["-n", new URL("../" + file, import.meta.url).pathname]);
    }
  });

  it("reuses only the existing sudo-approved release command", () => {
    assert.match(release, /--t58-canary-probe\|--t58-canary-start\|--t58-canary-stop/);
    assert.match(release, /"\$EUID" -eq 0/);
    assert.match(release, /exec \/bin\/bash/);
    assert.match(runner, /sudo -n "\$control" --t58-canary-probe/);
    assert.match(runner, /sudo -n "\$control" --t58-canary-start/);
    assert.match(runner, /sudo -n "\$control" --t58-canary-stop/);
    assert.doesNotMatch(runner, /sudo -n (?:systemctl|systemd-run|tee|chmod|install|rm)\b/);
  });

  it("arms independent rollback before enabling the flag and guards concurrent deploys", () => {
    const timerIndex = root.indexOf("systemd-run --quiet");
    const writeIndex = root.indexOf('mv -- "$temporary" "$dropin"');
    assert.ok(timerIndex > 0 && writeIndex > timerIndex);
    assert.match(root, /flock -w 15 9/);
    assert.match(root, /23m/);
    assert.match(release, /A T58 stall canary is active/);
    assert.match(rollback, /systemctl restart "\$unit"/);
    assert.match(root, /t58_existing_env_flag/);
  });

  it("cannot accept dynamic privileged commands or paths", () => {
    assert.match(root, /case "\$action" in probe\|start\|stop/);
    assert.match(root, /unit=airradar\.service/);
    assert.match(root, /dropin=\/etc\/systemd\/system\/airradar\.service\.d\/zz-t58-stall-canary\.conf/);
    assert.doesNotMatch(root, /eval\s/);
    assert.doesNotMatch(root, /chmod 0777|NOPASSWD: ALL/);
  });
});

describe("safe read-only evidence contract", () => {
  it("accepts both already-on and default-off monitoring on preflight", () => {
    assert.equal(classifyStallEvidence({status:"disabled",totalStalls:0,recentStalls:[]}), "disabled");
    assert.equal(classifyStallEvidence({status:"enabled",totalStalls:5,recentStalls:[]}), "enabled");
  });
  it("fails closed with specific sanitized reasons", () => {
    assert.throws(()=>classifyStallEvidence(undefined), /canary_evidence_field_missing/);
    assert.throws(()=>classifyStallEvidence({status:"enabled"}), /canary_evidence_invalid_structure/);
    assert.throws(()=>classifyStallEvidence({status:"unexpected",totalStalls:0,recentStalls:[]}), /canary_evidence_invalid_status/);
    assert.throws(()=>classifyStallEvidence({status:"disabled",totalStalls:0,recentStalls:[]}, "enabled"), /canary_evidence_state_mismatch/);
  });
});
