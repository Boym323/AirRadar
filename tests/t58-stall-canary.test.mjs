import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, existsSync, rmSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizedStallEvent, summarizeCanarySamples, classifyStallEvidence, sanitizedCpuProfile, sampleWithStartupRetry } from "../scripts/t58-stall-canary.mjs";

describe("T58 canary report sanitization", () => {
  it("keeps only bounded safe fields and drops payloads and identities", () => {
    const result=sanitizedStallEvent({
      observedAt:"2026-10-16T12:00:00Z",overshootMs:4000,intervalCpuPercent:87,
      intervalGcPauseMs:440.4567,intervalGcCount:7,intervalMajorGcCount:1,
      intervalEventLoopActiveMs:3985.442,intervalEventLoopIdleMs:14.558,
      correlatedScope:{name:"snapshot.apply",overlapMs:3900,icao:"ABC123"},
      url:"/secret",token:"unsafe",payload:"ABC123",stack:"secret",
    });
    assert.deepEqual(result,{
      observedAt:"2026-10-16T12:00:00.000Z",overshootMs:4000,intervalCpuPercent:87,
      correlatedScope:"snapshot.apply",overlapMs:3900,
      gcPauseMs:440.457,gcCount:7,majorGcCount:1,
      eventLoopActiveMs:3985.442,eventLoopIdleMs:14.558,
    });
    assert.ok(!JSON.stringify(result).includes("ABC123"));
  });
  it("counts GC and loop context only when provided, without raw identity fields", () => {
    const sample = {observedAt:"2026-10-16T12:00:00Z",overshootMs:2500,
      intervalGcPauseMs:42.8,intervalGcCount:4,intervalMajorGcCount:0,
      intervalEventLoopActiveMs:2700,intervalEventLoopIdleMs:800,
      diagnosticStoreId:"PRIVATE",pid:125,stack:"PRIVATE"};
    const summary = summarizeCanarySamples([
      {totalStalls:1,recentStalls:[sample],cpuPercent:20},
    ]);
    assert.equal(summary.gcContextEvents,1);
    assert.equal(summary.eventLoopUtilizationContextEvents,1);
    assert.equal(summary.topEvents[0].gcPauseMs,42.8);
    assert.ok(!JSON.stringify(summary).includes("PRIVATE"));
    assert.ok(!JSON.stringify(summary).includes("pid"));
  });
  it("rejects arbitrary scope names and bad timestamps", () => {
    const bad={observedAt:"2026-10-16T12:00:00Z",overshootMs:1000,
      correlatedScope:{name:"snapshot.ABC123/x",overlapMs:1000}};
    assert.equal(sanitizedStallEvent(bad)?.correlatedScope,null);
    assert.equal(sanitizedStallEvent({...bad,observedAt:"invalid"}),null);
    assert.deepEqual({
      gcPauseMs: sanitizedStallEvent({...bad,intervalGcPauseMs:-7})?.gcPauseMs,
      eventLoopActiveMs: sanitizedStallEvent({...bad,intervalEventLoopActiveMs:Infinity})?.eventLoopActiveMs,
    },{gcPauseMs:null,eventLoopActiveMs:null});
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
    assert.equal(summary.gcContextEvents,0);
    assert.equal(summary.eventLoopUtilizationContextEvents,0);
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
  it("exports only bounded V8 sample attribution and never raw profile fields", () => {
    const safe = sanitizedCpuProfile({ status: "completed", reason: null, durationMs: 120000,
      sampleIntervalUs: 20000, samples: 200, nodes: 50, rawProfile: "SECRET",
      stalls: [{ observedAt: "2026-10-17T12:00:00Z", overshootMs: 1200,
        sampleCount: 40, sampledMs: 800, cpuPercent: 90,
        topFrames: [{ frame: "snapshotLoop > decodeFrame", category: "javascript", samples: 40,
          chunk: "lib_07shbkf._.js", line: 12, column: 34, url: "SECRET" }] }] });
    assert.equal(safe.stalls[0].topFrames[0].frame, "snapshotLoop > decodeFrame");
    assert.ok(!JSON.stringify(safe).includes("SECRET"));
    assert.equal(safe.stalls[0].topFrames[0].chunk, "lib_07shbkf._.js");
    assert.throws(() => sanitizedCpuProfile({ status: "completed", stalls: [{
      topFrames: [{ frame: "https://secret", category: "javascript", samples: 1,
        chunk: "secret.js", line: 0, column: 0 }] }] }),
    /canary_cpu_profile_invalid_stalls/);
  });
  it("accepts both already-on and default-off monitoring on preflight", () => {
    assert.equal(classifyStallEvidence({status:"disabled",totalStalls:0,recentStalls:[]}), "disabled");
    assert.equal(classifyStallEvidence({status:"enabled",totalStalls:5,recentStalls:[]}), "enabled");
  });
  it("retries only the bounded diagnostic startup race", async () => {
    let attempts = 0;
    const value = await sampleWithStartupRetry(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("Diagnostic request /api/system/runtime-performance HTTP 502");
      if (attempts === 2) throw new Error("canary_cpu_profile_invalid_stalls");
      return "ready";
    }, { attempts: 3, delayMs: 0 });
    assert.equal(value, "ready");
    assert.equal(attempts, 3);
    await assert.rejects(
      sampleWithStartupRetry(async () => { throw new Error("canary_deployed_commit_changed"); }, { attempts: 3, delayMs: 0 }),
      /canary_deployed_commit_changed/,
    );
    await assert.rejects(
      sampleWithStartupRetry(async () => { throw new Error("Diagnostic request /api/system/runtime-performance HTTP 429"); }, { attempts: 3, delayMs: 0 }),
      /HTTP 429/,
    );
    await assert.rejects(
      sampleWithStartupRetry(async () => { throw new Error("Diagnostic request /api/other HTTP 502"); }, { attempts: 3, delayMs: 0 }),
      /HTTP 502/,
    );
  });
  it("fails closed with specific sanitized reasons", () => {
    assert.throws(()=>classifyStallEvidence(undefined), /canary_evidence_field_missing/);
    assert.throws(()=>classifyStallEvidence({status:"enabled"}), /canary_evidence_invalid_structure/);
    assert.throws(()=>classifyStallEvidence({status:"unexpected",totalStalls:0,recentStalls:[]}), /canary_evidence_invalid_status/);
    assert.throws(()=>classifyStallEvidence({status:"disabled",totalStalls:0,recentStalls:[]}, "enabled"), /canary_evidence_state_mismatch/);
  });
});


describe("T58 canary lifecycle with mocked commands (no production changes)", () => {
  function runMockCanary(preflight, verificationFails = false, startFails = false) {
    const dir = mkdtempSync(join(tmpdir(), "t58-canary-failclosed-"));
    const trace = join(dir, "trace.log");
    const mock = (name, content) => writeFileSync(join(dir, name), content, { mode: 0o700 });
    try {
      mock("git", '#!/bin/sh\nprintf "%s\\n" "$EXPECTED_SHA"\n');
      mock("node", `#!/bin/sh
printf 'node %s\\n' "$*" >> "$CANARY_TRACE"
case "$2" in
  preflight) printf '%s\\n' "$MOCK_PREFLIGHT" ;;
  observe) exit 0 ;;
  verify-restored) if [ "$MOCK_VERIFY_FAIL" = 1 ]; then exit 1; fi; echo CANARY_RESTORED ;;
  *) exit 77 ;;
esac
`);
      mock("sudo", '#!/bin/sh\nprintf "sudo %s\\n" "$*" >> "$CANARY_TRACE"\ncase "$*" in *--t58-canary-start*) if [ "$MOCK_START_FAIL" = 1 ]; then exit 17; fi ;; esac\n');
      mock("curl", '#!/bin/sh\nprintf "curl %s\\n" "$*" >> "$CANARY_TRACE"\n');
      const result = spawnSync("bash", ["scripts/t58-stall-canary.sh"], {
        cwd: fileURLToPath(new URL("../", import.meta.url)),
        encoding: "utf8",
        timeout: 8_000,
        env: { ...process.env, PATH: dir + ":" + process.env.PATH,
          GITHUB_EVENT_NAME: "workflow_run", GITHUB_ACTIONS: "true",
          EXPECTED_SHA: "a".repeat(40), T58_CANARY_OUTPUT: join(dir, "safe.json"),
          CANARY_TRACE: trace, MOCK_PREFLIGHT: preflight,
          MOCK_VERIFY_FAIL: verificationFails ? "1" : "0", MOCK_START_FAIL: startFails ? "1" : "0" },
      });
      return { result, trace: existsSync(trace) ? readFileSync(trace, "utf8") : "" };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("fails closed if diagnostics were enabled before this job; does not stop or restart the service", () => {
    const { result, trace } = runMockCanary("CANARY_ALREADY_ENABLED");
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /::error::Canary blocked/);
    assert.match(trace, /node scripts\/t58-stall-canary\.mjs preflight/);
    assert.doesNotMatch(trace, /observe|verify-restored|sudo|curl/);
  });

  it("does not declare success when sudo stop succeeds but runtime restoration cannot be verified", () => {
    const { result, trace } = runMockCanary("CANARY_DISABLED", true);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /::error::Canary rollback unverified/);
    assert.match(trace, /--t58-canary-start/);
    assert.match(trace, /--t58-canary-stop/);
    assert.match(trace, /node scripts\/t58-stall-canary\.mjs verify-restored/);
  });

  it("does not stop a pre-existing override when privileged activation is rejected", () => {
    const { result, trace } = runMockCanary("CANARY_DISABLED", false, true);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /::error::Canary activation failed/);
    assert.match(trace, /--t58-canary-start/);
    assert.doesNotMatch(trace, /--t58-canary-stop|observe|verify-restored/);
  });

  it("succeeds only when a started canary receives an explicit restored-runtime confirmation", () => {
    const { result, trace } = runMockCanary("CANARY_DISABLED");
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Rollback verified/);
    assert.match(trace, /--t58-canary-stop/);
    assert.match(trace, /verify-restored/);
  });
});
