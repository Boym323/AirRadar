import type { RawReadsbAircraft, RawReadsbAircraftResponse } from "@/lib/aircraft/normalize";
import { normalizeAircraftIdentifier } from "@/lib/aircraft/identity";
import { normalizeNetworkAircraftResponse } from "@/lib/aircraft/normalize";
import { isFreshPosition } from "@/lib/aircraft/source-merge";
import type { Aircraft, NetworkProviderDiagnostics, NetworkProviderStatus, ReceiverPosition } from "@/lib/aircraft/types";
import type { NetworkAircraftProvider, NetworkAircraftSnapshot } from "@/lib/server/provider";
import {
  getAdsbLolBaseUrl,
  getAdsbLolMaxAircraft,
  getAdsbLolMaxRetryIntervalMs,
  getAdsbLolPollIntervalMs,
  getAdsbLolRadiusNm,
  getAdsbLolRequestTimeoutMs,
  getAdsbLolStaleAfterMs,
  isAdsbLolEnabled,
} from "@/lib/server/config";

export class AdsbLolProviderError extends Error {
  readonly status: NetworkProviderStatus;
  readonly retryAfterMs: number | null;

  constructor(status: NetworkProviderStatus, message: string, retryAfterMs: number | null = null) {
    super(message);
    this.name = "AdsbLolProviderError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function validCoordinate(value: unknown, minimum: number, maximum: number): boolean {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed >= minimum && parsed <= maximum;
}

function validRawAircraft(value: unknown): value is RawReadsbAircraft {
  if (!isRecord(value)) return false;
  if (!normalizeAircraftIdentifier(value.hex)) return false;
  const latProvided = value.lat !== null && value.lat !== undefined;
  const lonProvided = value.lon !== null && value.lon !== undefined;
  if (latProvided !== lonProvided) return false;
  if (latProvided && (!validCoordinate(value.lat, -90, 90) || !validCoordinate(value.lon, -180, 180))) return false;
  const seen = finiteNumber(value.seen);
  if (seen === null || seen < 0 || seen > 86_400) return false;
  if (value.seen_pos !== null && value.seen_pos !== undefined) {
    const seenPos = finiteNumber(value.seen_pos);
    if (seenPos === null || seenPos < 0 || seenPos > 86_400) return false;
  }
  for (const key of ["alt_baro", "alt_geom", "gs", "track", "baro_rate", "geom_rate", "rssi", "messages"]) {
    const candidate = value[key];
    if (candidate === null || candidate === undefined || candidate === "ground") continue;
    if (finiteNumber(candidate) === null) return false;
  }
  return true;
}

function retryAfterMilliseconds(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

function responseNow(value: unknown, fallback: number): number {
  const numeric = finiteNumber(value);
  if (numeric === null) throw new AdsbLolProviderError("invalid_response", "invalid response timestamp");
  const milliseconds = numeric > 100_000_000_000 ? numeric : numeric * 1000;
  if (!Number.isFinite(milliseconds) || milliseconds < 946_684_800_000 || milliseconds > fallback + 15 * 60_000) {
    throw new AdsbLolProviderError("invalid_response", "invalid response timestamp");
  }
  return milliseconds;
}

function endpoint(baseUrl: string, receiver: ReceiverPosition, radiusNm: number): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL(`v2/lat/${receiver.lat}/lon/${receiver.lon}/dist/${radiusNm}`, base);
  return url.toString();
}

function diagnosticsSnapshot(value: NetworkProviderDiagnostics): NetworkProviderDiagnostics {
  return { ...value };
}

export class AdsbLolProvider implements NetworkAircraftProvider {
  readonly name = "adsb.lol" as const;
  private readonly enabled: boolean;
  private readonly baseUrl: string;
  private readonly radiusNm: number;
  private readonly pollIntervalMs: number;
  private readonly requestTimeoutMs: number;
  private readonly staleAfterMs: number;
  private readonly maxRetryIntervalMs: number;
  private readonly maxAircraft: number;
  private running = false;
  private stopped = false;
  private nextPollAt = 0;
  private inFlight: Promise<NetworkAircraftSnapshot> | null = null;
  private controller: AbortController | null = null;
  private networkAircraft: Aircraft[] = [];
  private lastSuccessAt: string | null = null;
  private lastAttemptAt: string | null = null;
  private latencyMs: number | null = null;
  private consecutiveFailures = 0;
  private retryAfterMs: number | null = null;
  private status: NetworkProviderStatus;
  private loggedFailure = false;

  constructor(
    private readonly receiver: ReceiverPosition,
    options: {
      enabled?: boolean;
      baseUrl?: string;
      radiusNm?: number;
      pollIntervalMs?: number;
      requestTimeoutMs?: number;
      staleAfterMs?: number;
      maxRetryIntervalMs?: number;
      maxAircraft?: number;
    } = {},
  ) {
    this.enabled = options.enabled ?? isAdsbLolEnabled();
    this.baseUrl = options.baseUrl ?? getAdsbLolBaseUrl();
    this.radiusNm = options.radiusNm ?? getAdsbLolRadiusNm();
    this.pollIntervalMs = options.pollIntervalMs ?? getAdsbLolPollIntervalMs();
    this.requestTimeoutMs = options.requestTimeoutMs ?? getAdsbLolRequestTimeoutMs();
    this.staleAfterMs = options.staleAfterMs ?? getAdsbLolStaleAfterMs();
    this.maxRetryIntervalMs = options.maxRetryIntervalMs ?? getAdsbLolMaxRetryIntervalMs();
    this.maxAircraft = options.maxAircraft ?? getAdsbLolMaxAircraft();
    this.status = this.enabled ? "stale" : "disabled";
  }

  start(): void {
    if (!this.enabled || this.running) return;
    this.stopped = false;
    this.running = true;
    this.nextPollAt = 0;
    console.info(`[adsb.lol] provider started radius=${this.radiusNm}nm poll=${this.pollIntervalMs}ms maxAircraft=${this.maxAircraft}`);
  }

  async getSnapshot(): Promise<NetworkAircraftSnapshot> {
    if (!this.enabled) return this.snapshot();
    if (this.stopped) return this.snapshot();
    if (!this.running) this.start();
    const now = Date.now();
    if (this.inFlight) return this.inFlight;
    if (now < this.nextPollAt) return this.snapshot();
    this.inFlight = this.fetchSnapshot()
      .catch((error: unknown) => {
        this.handleFailure(error);
        return this.snapshot();
      })
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight;
  }

  getDiagnostics(): NetworkProviderDiagnostics {
    const now = Date.now();
    const active = this.networkAircraft.filter((item) => this.isFresh(item, now));
    const positioned = active.filter((item) => isFreshPosition(item, this.staleAfterMs, now));
    const mlat = active.filter((item) => item.source === "MLAT");
    const lastSuccess = this.lastSuccessAt ? Date.parse(this.lastSuccessAt) : Number.NaN;
    const status = this.status === "online" && Number.isFinite(lastSuccess) && now - lastSuccess > this.staleAfterMs
      ? "stale"
      : this.status;
    return diagnosticsSnapshot({
      enabled: this.enabled,
      status,
      lastAttemptAt: this.lastAttemptAt,
      lastSuccessAt: this.lastSuccessAt,
      latencyMs: this.latencyMs,
      consecutiveFailures: this.consecutiveFailures,
      aircraftCount: active.length,
      positionedAircraftCount: positioned.length,
      mlatAircraftCount: mlat.length,
      radiusNm: this.radiusNm,
      pollIntervalMs: this.pollIntervalMs,
      retryAfterMs: this.retryAfterMs,
    });
  }

  getNextPollDelayMs(): number {
    if (!this.enabled) return this.pollIntervalMs;
    return Math.max(0, this.nextPollAt - Date.now());
  }

  async stop(): Promise<void> {
    this.running = false;
    this.stopped = true;
    this.nextPollAt = Number.POSITIVE_INFINITY;
    this.controller?.abort();
    this.controller = null;
    await this.inFlight?.catch(() => undefined);
    this.inFlight = null;
  }

  private snapshot(): NetworkAircraftSnapshot {
    const now = Date.now();
    return {
      aircraft: this.networkAircraft.filter((item) => this.isFresh(item, now)),
      fetchedAt: this.lastSuccessAt,
      provider: this.name,
    };
  }

  private isFresh(aircraft: Aircraft, now: number): boolean {
    const lastSeen = Date.parse(aircraft.lastSeen);
    return Number.isFinite(lastSeen) && now - lastSeen <= this.staleAfterMs;
  }

  private async fetchSnapshot(): Promise<NetworkAircraftSnapshot> {
    const attemptedAt = Date.now();
    this.lastAttemptAt = new Date(attemptedAt).toISOString();
    this.retryAfterMs = null;
    const controller = new AbortController();
    this.controller = controller;
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      const response = await fetch(endpoint(this.baseUrl, this.receiver, this.radiusNm), {
        cache: "no-store",
        signal: controller.signal,
      });
      if (response.status === 429) {
        throw new AdsbLolProviderError("rate_limited", "rate limited", retryAfterMilliseconds(response.headers.get("retry-after")));
      }
      if (!response.ok) throw new AdsbLolProviderError("http_error", `HTTP ${response.status}`);
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new AdsbLolProviderError("invalid_response", "invalid JSON response");
      }
      const parsed = this.validateResponse(payload, attemptedAt);
      const startedAt = Date.now();
      const aircraft = normalizeNetworkAircraftResponse(parsed, this.receiver, new Date(responseNow(parsed.now, attemptedAt)))
        .slice(0, this.maxAircraft);
      const recoveredAfterFailures = this.consecutiveFailures > 0;
      this.networkAircraft = aircraft;
      this.lastSuccessAt = new Date(startedAt).toISOString();
      this.latencyMs = Math.max(0, startedAt - attemptedAt);
      this.consecutiveFailures = 0;
      this.status = "online";
      this.loggedFailure = false;
      this.nextPollAt = startedAt + this.pollIntervalMs;
      if (recoveredAfterFailures) {
        console.info(`[adsb.lol] recovered aircraft=${aircraft.length} latency=${this.latencyMs}ms`);
      }
      return this.snapshot();
    } catch (error) {
      if (error instanceof AdsbLolProviderError) throw error;
      if (controller.signal.aborted) throw new AdsbLolProviderError("timeout", "request timeout");
      throw new AdsbLolProviderError("http_error", "network request failed");
    } finally {
      clearTimeout(timeout);
      if (this.controller === controller) this.controller = null;
    }
  }

  private validateResponse(value: unknown, now: number): RawReadsbAircraftResponse {
    if (!isRecord(value) || !Array.isArray(value.ac)) {
      throw new AdsbLolProviderError("invalid_response", "invalid aircraft response");
    }
    responseNow(value.now, now);
    for (const key of ["ctime", "ptime"] as const) {
      const timestamp = finiteNumber(value[key]);
      if (value[key] !== undefined && (timestamp === null || timestamp < 0)) {
        throw new AdsbLolProviderError("invalid_response", "invalid response timing");
      }
    }
    const total = finiteNumber(value.total);
    if (value.total !== undefined && (total === null || total < 0 || !Number.isInteger(total))) {
      throw new AdsbLolProviderError("invalid_response", "invalid response total");
    }
    const rows = value.ac.slice(0, this.maxAircraft).filter(validRawAircraft);
    return { ac: rows, now: value.now };
  }

  private handleFailure(error: unknown): void {
    const failure = error instanceof AdsbLolProviderError
      ? error
      : new AdsbLolProviderError("http_error", "network request failed");
    this.consecutiveFailures += 1;
    this.status = failure.status;
    this.retryAfterMs = failure.retryAfterMs;
    const backoff = Math.min(this.maxRetryIntervalMs, this.pollIntervalMs * 2 ** Math.min(this.consecutiveFailures - 1, 4));
    const retryDelay = Math.max(backoff, failure.retryAfterMs ?? 0);
    this.nextPollAt = Date.now() + retryDelay;
    if (!this.loggedFailure || failure.status === "rate_limited") {
      const suffix = failure.retryAfterMs === null ? "" : ` retryAfter=${failure.retryAfterMs}ms`;
      console.warn(`[adsb.lol] ${failure.status}${suffix}`);
      this.loggedFailure = true;
    }
  }
}
