"use client";

import { useQuery } from "@tanstack/react-query";

export type DatasetStatus = "idle" | "loading" | "ready" | "stale" | "retrying" | "unavailable";
export type DatasetErrorCategory = "network" | "server" | "rate_limited" | "malformed" | "client" | null;

export interface DatasetState<T> {
  data: T | null;
  status: DatasetStatus;
  errorCategory: DatasetErrorCategory;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  retryCount: number;
  retryAfterMs: number | null;
  itemCount: number;
}

interface DatasetQueryOptions<T> {
  url: string;
  enabled?: boolean;
  cache?: RequestCache;
  parse: (response: Response) => Promise<T>;
  itemCount?: (value: T) => number;
}

function retryAfterMs(response: Response): number | null {
  const value = response.headers.get("retry-after")?.trim();
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, 15 * 60_000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.min(Math.max(0, date - Date.now()), 15 * 60_000) : null;
}

export function datasetErrorCategory(error: unknown): DatasetErrorCategory {
  const status = error && typeof error === "object" && "status" in error ? Number(error.status) : null;
  if (status === 429) return "rate_limited";
  if (status !== null && status >= 500) return "server";
  if (status !== null && status >= 400) return "client";
  if (error instanceof TypeError) return "network";
  return "malformed";
}

export function shouldRetryDataset(failureCount: number, error: unknown): boolean {
  const kind = datasetErrorCategory(error);
  return (kind === "network" || kind === "server" || kind === "rate_limited" || kind === "malformed") && failureCount < 4;
}

export function datasetRetryDelayMs(attemptIndex: number, error: unknown): number {
  const serverDelay = error && typeof error === "object" && "retryAfterMs" in error && typeof error.retryAfterMs === "number"
    ? error.retryAfterMs
    : null;
  return serverDelay ?? [5_000, 15_000, 30_000, 60_000][Math.min(Math.max(0, Math.trunc(attemptIndex)), 3)];
}

export function useDatasetQuery<T>({ url, enabled = true, cache = "no-store", parse, itemCount = (value) => Array.isArray(value) ? value.length : 0 }: DatasetQueryOptions<T>): DatasetState<T> & { reload: () => void } {
  const query = useQuery({
    queryKey: ["dataset", url, cache],
    enabled,
    queryFn: async ({ signal }) => {
      const response = await fetch(url, { cache, signal });
      if (!response.ok) {
        const error = Object.assign(new Error(`dataset request failed (${response.status})`), {
          status: response.status,
          retryAfterMs: retryAfterMs(response),
        });
        throw error;
      }
      return parse(response);
    },
    staleTime: cache === "force-cache" ? Infinity : 0,
    retry: shouldRetryDataset,
    retryDelay: datasetRetryDelayMs,
  });
  const data = query.data ?? null;
  const isStale = query.isFetching && data !== null;
  const status: DatasetStatus = !enabled ? (data ? "ready" : "idle") : query.isPending ? "loading" : isStale ? "stale" : query.isError ? "unavailable" : "ready";
  const error = query.error;
  return {
    data,
    status,
    errorCategory: query.isError ? datasetErrorCategory(error) : null,
    lastAttemptAt: null,
    lastSuccessAt: query.dataUpdatedAt ? new Date(query.dataUpdatedAt).toISOString() : null,
    retryCount: query.failureCount,
    retryAfterMs: error && typeof error === "object" && "retryAfterMs" in error && typeof error.retryAfterMs === "number" ? error.retryAfterMs : null,
    itemCount: data === null ? 0 : Math.max(0, Math.trunc(itemCount(data))),
    reload: () => { void query.refetch(); },
  };
}

export function jsonDataset<T>(validator: (value: unknown) => value is T): (response: Response) => Promise<T> {
  return async (response) => {
    const value: unknown = await response.json();
    if (!validator(value)) throw new SyntaxError("malformed dataset response");
    return value;
  };
}
