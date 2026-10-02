import { getAlertsFleetsRepository, type AlertV1Delivery } from "@/lib/server/alerts-fleets-repository";

const MAX_ATTEMPTS = 5;
const STALE_CLAIM_MS = 5 * 60_000;
const POLL_MS = 15_000;

function configured(): boolean { return process.env.AIRRADAR_PUSHOVER_ENABLED === "true"; }
function providerReady(): boolean { return Boolean(process.env.AIRRADAR_PUSHOVER_APP_TOKEN?.trim() && process.env.AIRRADAR_PUSHOVER_USER_KEY?.trim()); }
function safeError(error: unknown): string { return (error instanceof Error ? error.message : "delivery failed").replace(/[\r\n]/g, " ").slice(0, 300); }

async function sendPushover(delivery: AlertV1Delivery): Promise<void> {
  if (!providerReady()) throw new Error("Pushover is not configured");
  const response = await fetch("https://api.pushover.net/1/messages.json", { method: "POST", signal: AbortSignal.timeout(8_000), headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: process.env.AIRRADAR_PUSHOVER_APP_TOKEN!, user: process.env.AIRRADAR_PUSHOVER_USER_KEY!, message: `AirRadar alert ${delivery.occurrenceId}`, priority: "0" }) });
  if (!response.ok) { const retryable = response.status === 429 || response.status >= 500; const error = new Error(`Pushover provider returned ${response.status}`); (error as Error & { retryable?: boolean }).retryable = retryable; throw error; }
}

export class AlertDeliveryWorker {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private running = false;
  private lastRunAt: string | null = null;
  private lastError: string | null = null;

  start(): void { if (!configured() || !this.stopped) return; this.stopped = false; void this.run(); }
  async stop(): Promise<void> { this.stopped = true; if (this.timer) clearTimeout(this.timer); this.timer = null; }
  diagnostics() { return { enabled: configured(), configured: providerReady(), lastRunAt: this.lastRunAt, lastError: this.lastError }; }
  private schedule(): void { if (!this.stopped) this.timer = setTimeout(() => void this.run(), POLL_MS); }
  private async run(): Promise<void> { if (this.running || this.stopped) return; this.running = true; this.lastRunAt = new Date().toISOString(); const repo = getAlertsFleetsRepository(); try { await repo.recoverStaleDeliveries(STALE_CLAIM_MS); for (let index = 0; index < 8; index += 1) { const delivery = await repo.claimDelivery(); if (!delivery) break; try { if (delivery.channel === "PUSHOVER") await sendPushover(delivery); await repo.markDeliverySent(delivery.id); } catch (error) { const retryable = (error as Error & { retryable?: boolean }).retryable !== false && delivery.attemptCount < MAX_ATTEMPTS; const retryAt = retryable ? Date.now() + Math.min(15 * 60_000, 1_000 * 2 ** delivery.attemptCount) : null; await repo.markDeliveryFailure(delivery.id, safeError(error), retryAt); this.lastError = safeError(error); } } } catch (error) { this.lastError = safeError(error); } finally { this.running = false; this.schedule(); } }
}

const globalForDelivery = globalThis as unknown as { alertDeliveryWorker?: AlertDeliveryWorker };
export function getAlertDeliveryWorker(): AlertDeliveryWorker { return globalForDelivery.alertDeliveryWorker ??= new AlertDeliveryWorker(); }
