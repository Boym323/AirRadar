import { afterEach, describe, expect, it, vi } from "vitest";

const { repository } = vi.hoisted(() => {
  const delivery = {
    id: "delivery-1", occurrenceId: "occurrence-1", channel: "PUSHOVER", status: "PROCESSING",
    attemptCount: 1, nextAttemptAt: "2026-10-21T00:00:00.000Z", claimedAt: "2026-10-21T00:00:00.000Z", sentAt: null, lastError: null,
  };
  return {
    repository: {
      recoverStaleDeliveries: vi.fn(async () => 0),
      claimDelivery: vi.fn(async () => delivery as typeof delivery | null),
      getOccurrenceForDelivery: vi.fn(async () => null as unknown as {
        id: string; trigger: string; aircraftIcao: string; registration: string | null;
        callsign: string | null; occurredAt: string; payload: Record<string, unknown>;
      } | null),
      markDeliverySent: vi.fn(async (id: string) => { void id; }),
      markDeliveryFailure: vi.fn(async (id: string, error: string, retryAt: number | null) => { void id; void error; void retryAt; }),
    },
  };
});

vi.mock("@/lib/server/alerts-fleets-repository", () => ({ getAlertsFleetsRepository: () => repository }));

import { AlertDeliveryWorker } from "@/lib/server/alert-delivery-worker";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("durable alert worker state transitions", () => {
  it("records an unknown channel as terminal failure and never marks it sent", async () => {
    vi.stubEnv("PUSHOVER_ENABLED", "true");
    repository.claimDelivery.mockReset();
    repository.claimDelivery
      .mockResolvedValueOnce({ ...awaitClaim(), channel: "WEB_PUSH" })
      .mockResolvedValue(null);
    const worker = new AlertDeliveryWorker();
    worker.start();
    await vi.waitFor(() => expect(repository.markDeliveryFailure).toHaveBeenCalledTimes(1));
    await worker.stop();
    expect(repository.markDeliveryFailure.mock.calls[0]?.[2]).toBeNull();
    expect(repository.markDeliverySent).not.toHaveBeenCalled();
    expect(worker.diagnostics()).toMatchObject({ failed: 1, sent: 0, retried: 0 });
  });

  it("retains failed Pushover attempts for retry after a provider 429", async () => {
    vi.stubEnv("PUSHOVER_ENABLED", "true");
    vi.stubEnv("PUSHOVER_USER_KEY", "test-user");
    vi.stubEnv("PUSHOVER_API_TOKEN", "test-token");
    repository.claimDelivery.mockReset();
    repository.getOccurrenceForDelivery.mockReset();
    repository.getOccurrenceForDelivery.mockResolvedValue({
      id: "occurrence-1", trigger: "SQUAWK", aircraftIcao: "ABC123", registration: null,
      callsign: null, occurredAt: "2026-10-21T00:00:00.000Z", payload: { squawk: "7700" },
    });
    repository.claimDelivery.mockResolvedValueOnce(awaitClaim()).mockResolvedValue(null);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })));
    const worker = new AlertDeliveryWorker();
    worker.start();
    await vi.waitFor(() => expect(repository.markDeliveryFailure).toHaveBeenCalledTimes(1));
    await worker.stop();
    expect(repository.markDeliveryFailure.mock.calls[0]?.[2]).toBeTypeOf("number");
    expect(repository.markDeliverySent).not.toHaveBeenCalled();
    expect(worker.diagnostics()).toMatchObject({ retried: 1, sent: 0 });
  });

  it("lets two workers compete for one atomic claim without duplicate delivery", async () => {
    vi.stubEnv("PUSHOVER_ENABLED", "true");
    vi.stubEnv("PUSHOVER_USER_KEY", "test-user");
    vi.stubEnv("PUSHOVER_API_TOKEN", "test-token");
    repository.getOccurrenceForDelivery.mockResolvedValue({
      id: "occurrence-1", trigger: "SQUAWK", aircraftIcao: "ABC123", registration: null,
      callsign: null, occurredAt: "2026-10-21T00:00:00.000Z", payload: { squawk: "7700" },
    });
    let pending: ReturnType<typeof awaitClaim> | null = awaitClaim();
    repository.claimDelivery.mockImplementation(async () => {
      const claimed = pending;
      pending = null;
      return claimed;
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"status":1}', { status: 200 })));
    const first = new AlertDeliveryWorker();
    const second = new AlertDeliveryWorker();

    first.start();
    second.start();
    await vi.waitFor(() => expect(repository.markDeliverySent).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(first.diagnostics().activePoll || second.diagnostics().activePoll).toBe(false));
    await Promise.all([first.stop(), second.stop()]);

    expect(repository.claimDelivery).toHaveBeenCalled();
    expect(repository.markDeliveryFailure).not.toHaveBeenCalled();
    expect(mockFetchCalls()).toBe(1);
    expect(first.diagnostics().sent + second.diagnostics().sent).toBe(1);
  });

  it("recovers an expired claim after worker restart and sends only after provider acceptance", async () => {
    vi.stubEnv("PUSHOVER_ENABLED", "true");
    vi.stubEnv("PUSHOVER_USER_KEY", "test-user");
    vi.stubEnv("PUSHOVER_API_TOKEN", "test-token");
    repository.getOccurrenceForDelivery.mockResolvedValue({
      id: "occurrence-1", trigger: "SQUAWK", aircraftIcao: "ABC123", registration: null,
      callsign: null, occurredAt: "2026-10-21T00:00:00.000Z", payload: { squawk: "7700" },
    });
    repository.recoverStaleDeliveries.mockResolvedValue(1);
    repository.claimDelivery.mockResolvedValueOnce(awaitClaim()).mockResolvedValue(null);
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"status":1}', { status: 200 })));

    const restarted = new AlertDeliveryWorker();
    restarted.start();
    await vi.waitFor(() => expect(repository.markDeliverySent).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(restarted.diagnostics().activePoll).toBe(false));
    await restarted.stop();

    expect(repository.recoverStaleDeliveries).toHaveBeenCalledWith(expect.any(Number));
    expect(restarted.diagnostics()).toMatchObject({ recoveredStale: 1, sent: 1, failed: 0 });
    expect(repository.markDeliveryFailure).not.toHaveBeenCalled();
  });

  it("retries a transient provider failure, then marks sent only on a later accepted response", async () => {
    vi.stubEnv("PUSHOVER_ENABLED", "true");
    vi.stubEnv("PUSHOVER_USER_KEY", "test-user");
    vi.stubEnv("PUSHOVER_API_TOKEN", "test-token");
    repository.getOccurrenceForDelivery.mockResolvedValue({
      id: "occurrence-1", trigger: "SQUAWK", aircraftIcao: "ABC123", registration: null,
      callsign: null, occurredAt: "2026-10-21T00:00:00.000Z", payload: { squawk: "7700" },
    });
    repository.claimDelivery.mockResolvedValueOnce(awaitClaim())
      .mockResolvedValueOnce({ ...awaitClaim(), attemptCount: 2 })
      .mockResolvedValue(null);
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(new Response('{"status":1}', { status: 200 }));
    vi.stubGlobal("fetch", fetcher);

    const worker = new AlertDeliveryWorker();
    worker.start();
    await vi.waitFor(() => expect(repository.markDeliverySent).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(worker.diagnostics().activePoll).toBe(false));
    await worker.stop();

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(repository.markDeliveryFailure).toHaveBeenCalledTimes(1);
    expect(repository.markDeliveryFailure.mock.calls[0]?.[2]).toBeTypeOf("number");
    expect(worker.diagnostics()).toMatchObject({ retried: 1, sent: 1, failed: 0 });
  });
});

function awaitClaim() {
  return {
    id: "delivery-1", occurrenceId: "occurrence-1", channel: "PUSHOVER", status: "PROCESSING",
    attemptCount: 1, nextAttemptAt: "2026-10-21T00:00:00.000Z", claimedAt: "2026-10-21T00:00:00.000Z", sentAt: null, lastError: null,
  };
}

function mockFetchCalls(): number {
  return vi.mocked(fetch).mock.calls.length;
}
