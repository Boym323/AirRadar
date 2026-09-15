import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { getRuntimeStatePath } from "@/lib/server/runtime-state";

export type FlightAwareEndpointClass = "flight" | "route" | "accountUsage";
export const FLIGHTAWARE_COST_POLICY: Record<FlightAwareEndpointClass, { paid: boolean; usdPerResultSet: number }> = {
  flight: { paid: true, usdPerResultSet: 0.005 },
  route: { paid: true, usdPerResultSet: 0.010 },
  accountUsage: { paid: false, usdPerResultSet: 0 },
};
export interface FlightAwareUsageEntry { timestamp: string; endpointClass: FlightAwareEndpointClass; requestCount: number; resultSetsEstimated: number; estimatedCostUsd: number; success: boolean; httpStatusCategory: string; }
const MAX_ENTRIES = 10_000;

export class FlightAwareUsageLedger {
  private entries: FlightAwareUsageEntry[] = [];
  private healthy = true;
  private writeChain: Promise<void> = Promise.resolve();
  constructor(private readonly path = getRuntimeStatePath("flightaware-usage.json")) { this.load(); }
  private load(): void { try { const value = JSON.parse(readFileSync(this.path, "utf8")) as unknown; if (!Array.isArray(value)) throw new Error("invalid ledger"); this.entries = value.filter((x): x is FlightAwareUsageEntry => Boolean(x && typeof x === "object" && typeof (x as FlightAwareUsageEntry).timestamp === "string" && typeof (x as FlightAwareUsageEntry).endpointClass === "string")).slice(-MAX_ENTRIES); } catch { this.entries = []; this.healthy = !readFileSyncSafe(this.path); } }
  append(entry: FlightAwareUsageEntry): void { this.entries.push(entry); if (this.entries.length > MAX_ENTRIES) this.entries = this.entries.slice(-MAX_ENTRIES); const snapshot = JSON.stringify(this.entries); this.writeChain = this.writeChain.then(() => { const dir = dirname(this.path); const tmp = join(dir, `.${basename(this.path)}.${process.pid}.tmp`); try { mkdirSync(dir, { recursive: true }); writeFileSync(tmp, `${snapshot}\n`, { encoding: "utf8", mode: 0o600 }); renameSync(tmp, this.path); this.healthy = true; } catch { this.healthy = false; } }); }
  isHealthy(): boolean { return this.healthy; }
  state(): "healthy" | "missing-first-start" | "corrupted" | "unreadable" { return this.healthy ? (readFileSyncSafe(this.path) ? "healthy" : "missing-first-start") : (readFileSyncSafe(this.path) ? "corrupted" : "unreadable"); }
  entriesSince(since: number): FlightAwareUsageEntry[] { return this.entries.filter((e) => Date.parse(e.timestamp) >= since); }
  async flush(): Promise<void> { await this.writeChain; }
  sum(since: number): number { return this.entries.filter((e) => Date.parse(e.timestamp) >= since).reduce((sum, e) => sum + e.estimatedCostUsd, 0); }
  count(since: number): number { return this.entries.filter((e) => Date.parse(e.timestamp) >= since).reduce((sum, e) => sum + e.requestCount, 0); }
}

export interface FlightAwareReportedUsage { totalCalls: number; totalPages: number; totalCost: number; totalDiscountCost: number; successfulCalls: number; failedCalls: number; }
let accountUsageCache: { expiresAt: number; value: FlightAwareReportedUsage } | null = null;
let accountUsageInFlight: Promise<FlightAwareReportedUsage | null> | null = null;
export async function getFlightAwareAccountUsage(apiKey: string): Promise<FlightAwareReportedUsage | null> {
  if (accountUsageCache && accountUsageCache.expiresAt > Date.now()) return accountUsageCache.value;
  if (accountUsageInFlight) return accountUsageInFlight;
  accountUsageInFlight = (async () => {
    const response = await fetch("https://aeroapi.flightaware.com/aeroapi/account/usage", { headers: { "x-apikey": apiKey, Accept: "application/json" }, cache: "no-store" });
    if (!response.ok) return null;
    const raw = await response.json() as Record<string, unknown>;
    const fields = ["total_calls", "total_pages", "total_cost", "total_discount_cost", "total_successful_calls", "total_failed_calls"];
    if (!fields.every((field) => typeof raw[field] === "number" && Number.isFinite(raw[field]))) return null;
    const value = { totalCalls: raw.total_calls as number, totalPages: raw.total_pages as number, totalCost: raw.total_cost as number, totalDiscountCost: raw.total_discount_cost as number, successfulCalls: raw.total_successful_calls as number, failedCalls: raw.total_failed_calls as number };
    accountUsageCache = { value, expiresAt: Date.now() + 15 * 60_000 };
    return value;
  })().catch(() => null).finally(() => { accountUsageInFlight = null; });
  return accountUsageInFlight;
}

function readFileSyncSafe(path: string): boolean { try { readFileSync(path); return true; } catch { return false; } }
