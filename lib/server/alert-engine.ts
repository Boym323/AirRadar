import type { Aircraft } from "@/lib/aircraft/types";
import { matchesAircraftRule } from "@/lib/aircraft/watchlist";
import { loadAlertConfig, type AlertRule } from "@/lib/server/alert-config";
import { getAlertCooldownMs, isEmergencyAlertEnabled } from "@/lib/server/config";
import { createAlertNotifier, type AlertNotifier, type AircraftAlert } from "@/lib/server/alert-notifier";

const MAX_DEDUP_ENTRIES = 10_000;
const MAX_PENDING_ALERTS = 32;
const MAX_CONCURRENT_DELIVERIES = 2;

export interface AlertStatus {
  status: "ok" | "disabled" | "error";
  enabled: boolean;
  notifier: string;
  ruleCount: number;
}

export interface AlertEngineOptions {
  rules?: AlertRule[];
  configErrors?: string[];
  notifier?: AlertNotifier;
  cooldownMs?: number;
  now?: () => number;
}

function aircraftMap(value: ReadonlyMap<string, Aircraft> | ReadonlyArray<Aircraft>): ReadonlyMap<string, Aircraft> {
  if (!Array.isArray(value)) return value as ReadonlyMap<string, Aircraft>;
  return new Map(value.map((aircraft: Aircraft) => [aircraft.icaoHex, aircraft]));
}

function isEmergency(aircraft: Aircraft | undefined): boolean {
  return Boolean(aircraft?.emergency);
}

export class AlertEngine {
  private rules: AlertRule[];
  private configErrors: string[];
  private readonly notifier: AlertNotifier;
  private readonly cooldownMs: number;
  private readonly now: () => number;
  private readonly dedupCache = new Map<string, number>();
  private readonly pending: AircraftAlert[] = [];
  private activeDeliveries = 0;
  private deliveryError = false;

  constructor(options: AlertEngineOptions = {}) {
    const config = options.rules ? { rules: options.rules, errors: options.configErrors ?? [] } : loadAlertConfig();
    this.rules = config.rules.filter((rule) => rule.enabled);
    this.configErrors = config.errors;
    this.notifier = options.notifier ?? createAlertNotifier();
    this.cooldownMs = options.cooldownMs ?? getAlertCooldownMs();
    this.now = options.now ?? Date.now;
  }

  /**
   * Replace the configured rules after a validated alerts.json update. The
   * deduplication cache is deliberately retained so a UI edit cannot bypass
   * the existing transition and cooldown semantics.
   */
  reload(config = loadAlertConfig()): void {
    this.rules = config.rules.filter((rule) => rule.enabled);
    this.configErrors = config.errors;
  }

  getStatus(): AlertStatus {
    const hasConditions = this.rules.length > 0 || isEmergencyAlertEnabled();
    const status: AlertStatus["status"] = this.configErrors.length || this.deliveryError
      ? "error"
      : this.notifier.enabled && hasConditions ? "ok" : "disabled";
    return { status, enabled: status === "ok", notifier: this.notifier.name, ruleCount: this.rules.length };
  }

  observe(
    previousValue: ReadonlyMap<string, Aircraft> | ReadonlyArray<Aircraft>,
    currentValue: ReadonlyMap<string, Aircraft> | ReadonlyArray<Aircraft>,
  ): void {
    const now = this.now();
    this.cleanupDedupCache(now);
    const previous = aircraftMap(previousValue);
    const current = aircraftMap(currentValue);

    for (const aircraft of current.values()) {
      const prior = previous.get(aircraft.icaoHex);
      const matchedRules = this.rules.filter((rule) => matchesAircraftRule(aircraft, rule));
      const transitionedRules = matchedRules.filter((rule) => !prior || !matchesAircraftRule(prior, rule));
      if (transitionedRules.length && this.isAvailable(`aircraft:${aircraft.icaoHex}`, now)) {
        this.reserve(`aircraft:${aircraft.icaoHex}`, now);
        for (const rule of transitionedRules) this.reserve(`rule:${rule.id}:${aircraft.icaoHex}`, now);
        this.enqueue({ aircraft, matchedRules: transitionedRules, emergency: false, priority: "normal" });
      }

      if (isEmergencyAlertEnabled() && isEmergency(aircraft) && !isEmergency(prior)) {
        const key = `emergency:${aircraft.icaoHex}`;
        if (this.isAvailable(key, now)) {
          this.reserve(key, now);
          this.enqueue({ aircraft, matchedRules: [], emergency: true, priority: "high" });
        }
      }
    }
  }

  cleanupDedupCache(now = this.now()): void {
    const cutoff = now - this.cooldownMs;
    for (const [key, timestamp] of this.dedupCache) {
      if (timestamp < cutoff) this.dedupCache.delete(key);
    }
    while (this.dedupCache.size > MAX_DEDUP_ENTRIES) {
      const oldest = this.dedupCache.keys().next().value as string | undefined;
      if (!oldest) break;
      this.dedupCache.delete(oldest);
    }
  }

  private isAvailable(key: string, now: number): boolean {
    const lastAlert = this.dedupCache.get(key);
    return lastAlert === undefined || now - lastAlert >= this.cooldownMs;
  }

  private reserve(key: string, now: number): void {
    this.dedupCache.set(key, now);
    while (this.dedupCache.size > MAX_DEDUP_ENTRIES) {
      const oldest = this.dedupCache.keys().next().value as string | undefined;
      if (!oldest) break;
      if (oldest === key) {
        const keys = this.dedupCache.keys();
        keys.next();
        const next = keys.next().value as string | undefined;
        if (!next) break;
        this.dedupCache.delete(next);
      } else {
        this.dedupCache.delete(oldest);
      }
    }
  }

  private enqueue(alert: AircraftAlert): void {
    if (this.pending.length >= MAX_PENDING_ALERTS) {
      console.error(`AirRadar alert dropped: provider=${this.notifier.name} reason=queue_full`);
      return;
    }
    this.pending.push(alert);
    this.drain();
  }

  private drain(): void {
    while (this.activeDeliveries < MAX_CONCURRENT_DELIVERIES && this.pending.length) {
      const alert = this.pending.shift();
      if (!alert) return;
      this.activeDeliveries += 1;
      void this.deliver(alert).finally(() => {
        this.activeDeliveries -= 1;
        this.drain();
      });
    }
  }

  private async deliver(alert: AircraftAlert): Promise<void> {
    if (!this.notifier.enabled) return;
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await this.notifier.send(alert);
        this.deliveryError = false;
        console.info(`AirRadar alert sent: ruleCount=${alert.matchedRules.length} aircraft=${alert.aircraft.icaoHex}`);
        return;
      } catch (error) {
        lastError = error;
        const retryable = !(error && typeof error === "object" && "status" in error && typeof error.status === "number" && error.status < 500);
        if (attempt === 0 && retryable) continue;
      }
    }
    const status = lastError && typeof lastError === "object" && "status" in lastError && typeof lastError.status === "number"
      ? String(lastError.status)
      : "network";
    this.deliveryError = true;
    console.error(`AirRadar alert delivery failed: provider=${this.notifier.name} status=${status}`);
  }
}
