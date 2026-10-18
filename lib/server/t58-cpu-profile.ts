import { Session } from "node:inspector";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

// A one-shot profiler for the existing T58 canary. It never opens the remote
// inspector port, persists a raw profile, or accepts request-supplied input.
const PROFILE_MS = 120_000;
// The first production stalls appeared during the warmed-up periodic work,
// outside the startup profile window. Keep the canary bounded while moving the
// capture to the observed 90s..210s interval after process start.
const PROFILE_DELAY_MS = 90_000;
const SAMPLE_US = 20_000;
const RSS_LIMIT_BYTES = 1_750 * 1_048_576;
const MAX_SAMPLES = 10_000;
const MAX_NODES = 10_000;
const MAX_OUTPUT_BYTES = 32 * 1024;
const MAX_STALLS = 24;
const MAX_PROFILE_SCHED_WAIT_MS = 180_000;
const SAFE_NAME = /^[A-Za-z_$][A-Za-z0-9_$ .:-]{0,79}$/;

type ProfileNode = { id: number; callFrame: {
  functionName: string; url: string; lineNumber?: number; columnNumber?: number;
}; parent?: number; children?: number[] };
type CpuProfile = { startTime: number; endTime: number; nodes: ProfileNode[]; samples?: number[]; timeDeltas?: number[] };
type StallContext = {
  observedAt: string; endedMonoMs: number; overshootMs: number;
  cpuPercent: number | null; gcPauseMs: number | null; gcCount: number | null;
  mainThreadCpuMs: number | null; schedulerWaitMs: number | null;
  schedulerSwitches: number | null;
};
type StallSummary = Omit<StallContext, "endedMonoMs"> & {
  sampledMs: number; sampleCount: number;
  topFrames: Array<{ frame: string; category: "javascript" | "native" | "gc" | "idle" | "unknown";
    chunk: string | null; line: number | null; column: number | null; samples: number }>;
};
type Summary = {
  status: "disabled" | "starting" | "running" | "stopping" | "completed" | "discarded";
  reason: string | null; durationMs: number | null; sampleIntervalUs: number;
  samples: number; nodes: number; stalls: StallSummary[];
};
type State = {
  session: Session | null; startedMonoMs: number; timer: ReturnType<typeof setTimeout> | null;
  memoryTimer: ReturnType<typeof setInterval> | null; stalls: StallContext[];
  lastThreadCpu: NodeJS.CpuUsage | null; lastSched: [number, number, number] | null;
  summary: Summary;
};
const globalState = globalThis as typeof globalThis & { __airRadarT58CpuProfile?: State };
const state = globalState.__airRadarT58CpuProfile ??= {
  session: null, startedMonoMs: 0, timer: null, memoryTimer: null, stalls: [],
  lastThreadCpu: null, lastSched: null,
  summary: { status: "disabled", reason: null, durationMs: null, sampleIntervalUs: SAMPLE_US,
    samples: 0, nodes: 0, stalls: [] },
};

function post(session: Session, method: string, params?: object): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => session.post(method, params, (error, result) =>
    error ? reject(error) : resolve(result as Record<string, unknown>)));
}

function schedulerSample(): [number, number, number] | null {
  if (process.platform !== "linux") return null;
  try {
    const values = readFileSync(`/proc/self/task/${process.pid}/schedstat`, "utf8").trim().split(/\s+/).map(Number);
    return values.length === 3 && values.every(Number.isFinite)
      ? [values[0]!, values[1]!, values[2]!] : null;
  } catch { return null; }
}

function safeFrame(node: ProfileNode): Omit<StallSummary["topFrames"][number], "samples"> {
  const name = node.callFrame?.functionName ?? "";
  const emptyLocation = { chunk: null, line: null, column: null };
  if (name === "(garbage collector)") return { frame: "(garbage collector)", category: "gc", ...emptyLocation };
  if (name === "(idle)") return { frame: "(idle)", category: "idle", ...emptyLocation };
  const url = node.callFrame?.url ?? "";
  const category = url.startsWith("node:") || name.startsWith("Builtin:") || name.startsWith("Stub:")
    ? "native" : url.startsWith("file:") || url.startsWith("webpack-internal:") ? "javascript" : "unknown";
  // Function names can be generated from dynamic source. Only a narrow static
  // alphabet leaves the process; never export URLs, paths, source or arguments.
  // Only a fixed build path and a bare chunk basename are exported. No URL,
  // directory, query string, application data or source text leaves the process.
  const chunk = /^file:\/\/\/var\/www\/airradar\/\.next\/standalone\/\.next\/server\/chunks\/(?:ssr\/)?((?!.*\.\.)[A-Za-z0-9_.-]{1,80}\.js)$/.exec(url)?.[1] ?? null;
  const line = chunk && Number.isSafeInteger(node.callFrame.lineNumber) &&
    node.callFrame.lineNumber! >= 0 && node.callFrame.lineNumber! <= 1_000_000
    ? node.callFrame.lineNumber! : null;
  const column = chunk && Number.isSafeInteger(node.callFrame.columnNumber) &&
    node.callFrame.columnNumber! >= 0 && node.callFrame.columnNumber! <= 1_000_000
    ? node.callFrame.columnNumber! : null;
  return { frame: SAFE_NAME.test(name) ? name : "(redacted)", category, chunk, line, column };
}

export function summarizeT58CpuProfile(profile: CpuProfile, startedMonoMs: number, stalls: StallContext[]): Summary {
  if (!Number.isFinite(profile.startTime) || !Number.isFinite(profile.endTime) ||
      !Array.isArray(profile.nodes) || !Array.isArray(profile.samples) || !Array.isArray(profile.timeDeltas) ||
      profile.samples.length !== profile.timeDeltas.length || profile.samples.length > MAX_SAMPLES ||
      profile.nodes.length > MAX_NODES) {
    return { status: "discarded", reason: "profile_bounds_exceeded", durationMs: null,
      sampleIntervalUs: SAMPLE_US, samples: 0, nodes: 0, stalls: [] };
  }
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const parent = new Map<number, number>();
  for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
  const aggregates = stalls.slice(0, MAX_STALLS).map((stall) => ({ stall, counts: new Map<string,
    StallSummary["topFrames"][number]>(), samples: 0 }));
  let cursorUs = profile.startTime;
  for (let i = 0; i < profile.samples.length; i++) {
    const delta = profile.timeDeltas[i]!;
    if (!Number.isFinite(delta) || delta < 0) continue;
    cursorUs += delta;
    const sampleMonoMs = startedMonoMs + (cursorUs - profile.startTime) / 1_000;
    const node = nodes.get(profile.samples[i]!);
    if (!node) continue;
    const leaf = safeFrame(node);
    const stack = [leaf.frame];
    let parentId = parent.get(node.id);
    while (parentId !== undefined && stack.length < 3) {
      const ancestor = nodes.get(parentId);
      if (!ancestor) break;
      const name = safeFrame(ancestor).frame;
      if (name !== "(redacted)" && name !== "(root)") stack.unshift(name);
      parentId = parent.get(parentId);
    }
    const frame = { ...leaf, frame: stack.join(" > ").slice(0, 240) };
    for (const aggregate of aggregates) {
      const { stall } = aggregate;
      if (sampleMonoMs < stall.endedMonoMs - stall.overshootMs || sampleMonoMs > stall.endedMonoMs) continue;
      aggregate.samples++;
      const key = `${frame.category}:${frame.frame}:${frame.chunk}:${frame.line}:${frame.column}`;
      const item = aggregate.counts.get(key) ?? { ...frame, samples: 0 };
      item.samples++;
      aggregate.counts.set(key, item);
    }
  }
  const summary: Summary = {
    status: "completed", reason: null,
    durationMs: Math.max(0, Math.round((profile.endTime - profile.startTime) / 1_000)),
    sampleIntervalUs: SAMPLE_US, samples: profile.samples.length, nodes: profile.nodes.length,
    stalls: aggregates.map(({ stall, counts, samples }) => ({
      observedAt: stall.observedAt, overshootMs: stall.overshootMs, cpuPercent: stall.cpuPercent,
      gcPauseMs: stall.gcPauseMs, gcCount: stall.gcCount,
      mainThreadCpuMs: stall.mainThreadCpuMs, schedulerWaitMs: stall.schedulerWaitMs,
      schedulerSwitches: stall.schedulerSwitches, sampledMs: samples * SAMPLE_US / 1_000,
      sampleCount: samples,
      topFrames: [...counts.values()].sort((a, b) => b.samples - a.samples).slice(0, 8),
    })),
  };
  if (Buffer.byteLength(JSON.stringify(summary)) > MAX_OUTPUT_BYTES) {
    return { ...summary, status: "discarded", reason: "output_bounds_exceeded", stalls: [] };
  }
  return summary;
}

async function stop(reason: string): Promise<void> {
  if (state.summary.status !== "running" && state.summary.status !== "starting") return;
  state.summary.status = "stopping";
  if (state.timer) clearTimeout(state.timer);
  if (state.memoryTimer) clearInterval(state.memoryTimer);
  state.timer = null; state.memoryTimer = null;
  const session = state.session;
  state.session = null;
  if (!session) { state.summary = { ...state.summary, status: "discarded", reason }; return; }
  if (reason === "rss_limit") {
    session.disconnect();
    state.summary = { ...state.summary, status: "discarded", reason, stalls: [] };
    state.stalls = []; state.lastSched = null; state.lastThreadCpu = null;
    return;
  }
  try {
    const result = await post(session, "Profiler.stop");
    if (process.memoryUsage().rss > RSS_LIMIT_BYTES) {
      state.summary = { ...state.summary, status: "discarded", reason: "rss_limit_after_stop", stalls: [] };
      return;
    }
    const profile = result.profile as CpuProfile;
    state.summary = summarizeT58CpuProfile(profile, state.startedMonoMs, state.stalls);
    if (reason !== "time_limit" && state.summary.status === "completed") state.summary.reason = reason;
  } catch {
    state.summary = { ...state.summary, status: "discarded", reason: "profiler_stop_failed" };
  } finally {
    session.disconnect(); state.stalls = []; state.lastSched = null; state.lastThreadCpu = null;
  }
}

export async function startT58CpuProfile(options: { delayMs?: number } = {}): Promise<void> {
  if (process.env.AIRRADAR_T58_CPU_PROFILE_ENABLED !== "1" || state.summary.status !== "disabled") return;
  state.summary.status = "starting";
  await new Promise<void>((resolve) => {
    const delayMs = Number.isFinite(options.delayMs) && options.delayMs! >= 0
      ? Math.min(options.delayMs!, PROFILE_DELAY_MS) : PROFILE_DELAY_MS;
    state.timer = setTimeout(resolve, delayMs);
    state.timer.unref?.();
  });
  state.timer = null;
  if (process.env.AIRRADAR_T58_CPU_PROFILE_ENABLED !== "1" || state.summary.status !== "starting") return;
  if (process.memoryUsage().rss > RSS_LIMIT_BYTES) {
    state.summary = { ...state.summary, status: "discarded", reason: "rss_limit_at_start" }; return;
  }
  const session = new Session();
  try {
    session.connect(); state.session = session;
    await post(session, "Profiler.enable");
    await post(session, "Profiler.setSamplingInterval", { interval: SAMPLE_US });
    state.startedMonoMs = performance.now();
    await post(session, "Profiler.start");
    state.summary.status = "running";
    state.timer = setTimeout(() => { void stop("time_limit"); }, PROFILE_MS);
    state.timer.unref?.();
    state.memoryTimer = setInterval(() => {
      if (process.memoryUsage().rss > RSS_LIMIT_BYTES) void stop("rss_limit");
    }, 1_000);
    state.memoryTimer.unref?.();
  } catch {
    session.disconnect(); state.session = null;
    state.summary = { ...state.summary, status: "discarded", reason: "profiler_start_failed" };
  }
}

export function observeT58CpuProfileInterval(event: {
  observedAt: string; overshootMs: number; intervalCpuPercent: number | null;
  intervalGcPauseMs: number | null; intervalGcCount: number | null;
} | null, nowMonoMs: number): void {
  if (state.summary.status !== "running") return;
  const cpu = process.threadCpuUsage();
  const sched = schedulerSample();
  if (event && state.stalls.length < MAX_STALLS) {
    const priorCpu = state.lastThreadCpu;
    const priorSched = state.lastSched;
    state.stalls.push({
      observedAt: event.observedAt, endedMonoMs: nowMonoMs, overshootMs: event.overshootMs,
      cpuPercent: event.intervalCpuPercent, gcPauseMs: event.intervalGcPauseMs,
      gcCount: event.intervalGcCount,
      mainThreadCpuMs: priorCpu ? Math.max(0, (cpu.user + cpu.system - priorCpu.user - priorCpu.system) / 1_000) : null,
      schedulerWaitMs: sched && priorSched ? Math.min(MAX_PROFILE_SCHED_WAIT_MS, Math.max(0, (sched[1] - priorSched[1]) / 1e6)) : null,
      schedulerSwitches: sched && priorSched ? Math.max(0, sched[2] - priorSched[2]) : null,
    });
  }
  state.lastThreadCpu = cpu; state.lastSched = sched;
}

export function getT58CpuProfileSummary(): Summary {
  return structuredClone(state.summary);
}

export async function stopT58CpuProfileForTests(): Promise<void> { await stop("test_stop"); }
