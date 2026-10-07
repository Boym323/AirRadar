import { getAlertsFleetsRepository, type AlertV1Delivery, type AlertV1DeliveryOccurrence } from "@/lib/server/alerts-fleets-repository";

const MAX_ATTEMPTS = 5;
const STALE_CLAIM_MS = 5 * 60_000;
const POLL_MS = 15_000;
const PUSHOVER_ENDPOINT = "https://api.pushover.net/1/messages.json";

type RetryableError = Error & { retryable?: boolean; status?: number };
type FetchLike = typeof fetch;

function configured(): boolean { return process.env.PUSHOVER_ENABLED?.trim().toLowerCase() === "true"; }
function credentials(): { user: string; token: string } | null {
  const user = process.env.PUSHOVER_USER_KEY?.trim();
  const token = process.env.PUSHOVER_API_TOKEN?.trim();
  return configured() && user && token ? { user, token } : null;
}
function safeError(error: unknown): string { return (error instanceof Error ? error.message : "delivery failed").replace(/[\r\n]/g, " ").slice(0, 300); }

export function formatPushoverDeliveryMessage(occurrence: AlertV1DeliveryOccurrence): string {
  const label = occurrence.callsign || occurrence.registration || occurrence.aircraftIcao;
  const payload = occurrence.payload;
  const details = [
    typeof payload.squawk === "string" ? `Squawk ${payload.squawk}` : null,
    typeof payload.flightEventType === "string" ? payload.flightEventType : null,
    typeof payload.geofenceName === "string" ? `zóna ${payload.geofenceName}` : null,
    typeof payload.distanceMeters === "number" && Number.isFinite(payload.distanceMeters) ? `${Math.round(payload.distanceMeters)} m` : null,
  ].filter((value): value is string => Boolean(value));
  return [`AirRadar · ${occurrence.trigger}`, "", label, occurrence.aircraftIcao, ...details, "", "airradar.pomykal.cz"].join("\n");
}

export async function sendPushoverDelivery(
  _delivery: AlertV1Delivery,
  occurrence: AlertV1DeliveryOccurrence,
  fetcher: FetchLike = fetch,
): Promise<void> {
  const config = credentials();
  if (!config) {
    const error: RetryableError = new Error("Pushover is not configured");
    error.retryable = false;
    throw error;
  }
  const response = await fetcher(PUSHOVER_ENDPOINT, {
    method: "POST",
    signal: AbortSignal.timeout(8_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      token: config.token,
      user: config.user,
      message: formatPushoverDeliveryMessage(occurrence),
      title: "AirRadar upozornění",
      priority: "0",
      url: `https://airradar.pomykal.cz/aircraft/${encodeURIComponent(occurrence.aircraftIcao)}`,
      url_title: "Otevřít detail v AirRadaru",
    }),
  });
  if (response.ok) return;
  const error: RetryableError = new Error(`Pushover provider returned ${response.status}`);
  error.status = response.status;
  error.retryable = response.status === 429 || response.status >= 500;
  throw error;
}

export class AlertDeliveryWorker {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private running = false;
  private lastRunAt: string | null = null;
  private lastSuccessAt: string | null = null;
  private lastFailureAt: string | null = null;
  private lastError: string | null = null;
  private processed = 0;
  private sent = 0;
  private failed = 0;
  private retried = 0;
  private recoveredStale = 0;

  start(): void { if (!configured() || !this.stopped) return; this.stopped = false; void this.run(); }
  async stop(): Promise<void> { this.stopped = true; if (this.timer) clearTimeout(this.timer); this.timer = null; }
  diagnostics() {
    return {
      enabled: configured(),
      configured: credentials() !== null,
      running: !this.stopped,
      activePoll: this.running,
      lastRunAt: this.lastRunAt,
      lastSuccessAt: this.lastSuccessAt,
      lastFailureAt: this.lastFailureAt,
      lastError: this.lastError,
      processed: this.processed,
      sent: this.sent,
      failed: this.failed,
      retried: this.retried,
      recoveredStale: this.recoveredStale,
      pollIntervalMs: POLL_MS,
      maxAttempts: MAX_ATTEMPTS,
    };
  }
  private schedule(): void { if (!this.stopped) this.timer = setTimeout(() => void this.run(), POLL_MS); }
  private async run(): Promise<void> {
    if (this.running || this.stopped) return;
    this.running = true;
    this.lastRunAt = new Date().toISOString();
    const repo = getAlertsFleetsRepository();
    try {
      this.recoveredStale += await repo.recoverStaleDeliveries(STALE_CLAIM_MS);
      for (let index = 0; index < 8; index += 1) {
        const delivery = await repo.claimDelivery();
        if (!delivery) break;
        this.processed += 1;
        try {
          if (delivery.channel === "PUSHOVER") {
            const occurrence = await repo.getOccurrenceForDelivery(delivery.occurrenceId);
            if (!occurrence) throw Object.assign(new Error("alert occurrence not found"), { retryable: false });
            await sendPushoverDelivery(delivery, occurrence);
          }
          await repo.markDeliverySent(delivery.id);
          this.sent += 1;
          this.lastSuccessAt = new Date().toISOString();
          this.lastError = null;
        } catch (error) {
          const retryable = (error as RetryableError).retryable !== false && delivery.attemptCount < MAX_ATTEMPTS;
          const retryAt = retryable ? Date.now() + Math.min(15 * 60_000, 1_000 * 2 ** delivery.attemptCount) : null;
          await repo.markDeliveryFailure(delivery.id, safeError(error), retryAt);
          if (retryable) this.retried += 1;
          else this.failed += 1;
          this.lastFailureAt = new Date().toISOString();
          this.lastError = safeError(error);
        }
      }
    } catch (error) {
      this.lastError = safeError(error);
    } finally {
      this.running = false;
      this.schedule();
    }
  }
}

const globalForDelivery = globalThis as unknown as { alertDeliveryWorker?: AlertDeliveryWorker };
export function getAlertDeliveryWorker(): AlertDeliveryWorker { return globalForDelivery.alertDeliveryWorker ??= new AlertDeliveryWorker(); }
