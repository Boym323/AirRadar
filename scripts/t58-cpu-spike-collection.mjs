import { performance } from "node:perf_hooks";

/** Closed, reviewable failure taxonomy: never print error.message or URL. */
export function classifyCpuSpikeFailure(error) {
  const message = error instanceof Error ? error.message : "";
  const name = error && typeof error === "object" ? String(error.name ?? "") : "";
  if (message === "t58_spike_deployed_process_changed") return "identity_changed";
  if (/t58_spike_(authorization_missing|authentication_failure)/.test(message) ||
      /HTTP (401|403)\b|login refused|session cookie/i.test(message)) return "authentication_failure";
  if (name === "TimeoutError" || name === "AbortError" || /\btimeout\b|timed out/i.test(message))
    return "http_timeout";
  if (/Diagnostic request .* HTTP \d{3}/.test(message)) return "http_failure";
  if (/t58_spike_required_telemetry_unavailable/.test(message)) return "telemetry_unavailable";
  if (name === "TypeError" || /fetch failed|network/i.test(message)) return "network_failure";
  return "unexpected_error";
}

const fatalCategories = new Set(["identity_changed", "authentication_failure", "telemetry_unavailable"]);

/**
 * Pure orchestration; poll returns {identity, sample}. Only allowlisted
 * projected samples and fixed categories reach checkpoint().
 * The initial process identity NEVER enters persisted state.
 */
export async function collectCpuSpikeSamples({
  poll, checkpoint, slots, intervalMs = 5_000,
  now = () => performance.now(),
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  maxConsecutiveFailures = 3,
}) {
  if (typeof poll !== "function" || typeof checkpoint !== "function" ||
      !Number.isSafeInteger(slots) || slots < 1 || slots > 120 ||
      !Number.isSafeInteger(intervalMs) || intervalMs < 500 || intervalMs > 5_000 ||
      !Number.isSafeInteger(maxConsecutiveFailures) || maxConsecutiveFailures < 1 ||
      maxConsecutiveFailures > 5) throw Error("t58_spike_invalid_schedule");

  const state = {
    samples: [], plannedSlots: slots + 1, attempts: 0,
    failuresByCategory: {}, failedSlots: 0, stopReason: "running",
  };
  let identity = null;
  let consecutiveFailures = 0;
  const failure = (category) => {
    state.failedSlots++;
    state.failuresByCategory[category] = (state.failuresByCategory[category] ?? 0) + 1;
    consecutiveFailures++;
    if (fatalCategories.has(category)) state.stopReason = category;
    else if (consecutiveFailures >= maxConsecutiveFailures)
      state.stopReason = "consecutive_failures";
  };
  const capture = async slot => {
    state.attempts++;
    try {
      const observation = await poll();
      if (!observation?.sample || !observation?.identity)
        throw Error("t58_spike_required_telemetry_unavailable");
      const current = observation.identity;
      if (identity && (identity.commit !== current.commit ||
          identity.processId !== current.processId || identity.storeId !== current.storeId))
        throw Error("t58_spike_deployed_process_changed");
      if (!identity) identity = current;
      state.samples.push({ ...observation.sample, slot });
      consecutiveFailures = 0;
    } catch (error) {
      failure(classifyCpuSpikeFailure(error));
    }
    // Never serialize the identity (even in a failure/partial report).
    await checkpoint({
      ...state, samples: [...state.samples],
      failuresByCategory: { ...state.failuresByCategory },
    });
  };

  // A transient failure before the baseline must not discard the entire
  // diagnosis. Retry only a bounded number of times; fatal errors stop now.
  for (let retry = 0; retry < maxConsecutiveFailures && !identity &&
      state.stopReason === "running"; retry++) {
    if (retry > 0) await sleep(Math.min(1_000, intervalMs));
    await capture(0);
  }
  if (state.stopReason !== "running" || !identity) {
    state.stopReason = state.stopReason === "running" ? "initial_sample_unavailable" : state.stopReason;
    await checkpoint({ ...state, samples: [...state.samples] });
    return state;
  }
  const start = now();
  const deadline = start + slots * intervalMs + intervalMs * 2;
  for (let slot = 1; slot <= slots; slot++) {
    if (now() > deadline) {
      state.stopReason = "deadline_exceeded";
      break;
    }
    await sleep(Math.max(0, start + slot * intervalMs - now()));
    if (now() > deadline) {
      state.stopReason = "deadline_exceeded";
      break;
    }
    await capture(slot);
    if (state.stopReason !== "running") break;
  }
  if (state.stopReason === "running") state.stopReason = "complete";
  await checkpoint({ ...state, samples: [...state.samples],
    failuresByCategory: { ...state.failuresByCategory } });
  return state;
}
