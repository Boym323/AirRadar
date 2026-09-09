import { join, resolve } from "node:path";

export const AIRRADAR_PRODUCTION_STATE_DIRECTORY = "/var/lib/airradar";

export type RuntimeStateFile = "alerts.json" | "alert-events.jsonl";

/**
 * Runtime state is deliberately separate from the source checkout in
 * production. Local development keeps the historical data/ location so the
 * demo remains self-contained; tests and production callers inject paths
 * into their stores instead of changing this resolver.
 */
export function getRuntimeStateDirectory(): string {
  return process.env.NODE_ENV === "production"
    ? AIRRADAR_PRODUCTION_STATE_DIRECTORY
    : resolve(process.cwd(), "data");
}

export function getRuntimeStatePath(file: RuntimeStateFile): string {
  return join(getRuntimeStateDirectory(), file);
}

/** The only legacy file eligible for the safe production migration. */
export function getLegacyRuntimeStatePath(file: "alerts.json"): string {
  return resolve(process.cwd(), "data", file);
}
