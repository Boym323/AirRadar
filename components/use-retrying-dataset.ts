"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

interface UseRetryingDatasetOptions<T> {
  url: string;
  enabled?: boolean;
  cache?: RequestCache;
  parse: (response: Response) => Promise<T>;
  itemCount?: (value: T) => number;
  retryDelaysMs?: number[];
}

const DEFAULT_RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000];

function initialState<T>(): DatasetState<T> {
  return {
    data: null,
    status: "idle",
    errorCategory: null,
    lastAttemptAt: null,
    lastSuccessAt: null,
    retryCount: 0,
    retryAfterMs: null,
    itemCount: 0,
  };
}

function retryAfterMs(response: Response): number | null {
  const value = response.headers.get("retry-after")?.trim();
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, 15 * 60_000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.min(Math.max(0, date - Date.now()), 15 * 60_000) : null;
}

function errorCategory(error: unknown): DatasetErrorCategory {
  if (error instanceof TypeError) return "network";
  if (error instanceof SyntaxError) return "malformed";
  return "malformed";
}

export function useRetryingDataset<T>({
  url,
  enabled = true,
  cache = "no-store",
  parse,
  itemCount = (value) => Array.isArray(value) ? value.length : 0,
  retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
}: UseRetryingDatasetOptions<T>): DatasetState<T> & { reload: () => void } {
  const [state, setState] = useState<DatasetState<T>>(initialState);
  const [generation, setGeneration] = useState(0);
  const parserRef = useRef(parse);
  parserRef.current = parse;
  const countRef = useRef(itemCount);
  countRef.current = itemCount;

  const reload = useCallback(() => setGeneration((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) {
      setState((previous) => ({ ...previous, status: previous.data ? "ready" : "idle", errorCategory: null, retryAfterMs: null }));
      return;
    }

    const controller = new AbortController();
    let active = true;
    let retryTimer: number | null = null;
    let attempt = 0;
    let currentData: T | null = null;

    const run = async () => {
      if (!active) return;
      const attemptedAt = new Date().toISOString();
      setState((previous) => ({
        ...previous,
        status: previous.data ? "stale" : attempt === 0 ? "loading" : "retrying",
        lastAttemptAt: attemptedAt,
        retryAfterMs: null,
      }));
      try {
        const response = await fetch(url, { cache, signal: controller.signal });
        if (!response.ok) {
          const retryMs = retryAfterMs(response);
          const error = new Error(`dataset request failed (${response.status})`);
          (error as Error & { status?: number; retryAfterMs?: number | null }).status = response.status;
          (error as Error & { status?: number; retryAfterMs?: number | null }).retryAfterMs = retryMs;
          throw error;
        }
        const value = await parserRef.current(response);
        if (!active) return;
        currentData = value;
        setState({
          data: value,
          status: "ready",
          errorCategory: null,
          lastAttemptAt: attemptedAt,
          lastSuccessAt: new Date().toISOString(),
          retryCount: 0,
          retryAfterMs: null,
          itemCount: Math.max(0, Math.trunc(countRef.current(value))),
        });
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : null;
        const category: DatasetErrorCategory = status === 429 ? "rate_limited" : status !== null && status >= 500 ? "server" : status !== null && status >= 400 ? "client" : errorCategory(error);
        const transient = category === "network" || category === "server" || category === "rate_limited" || category === "malformed";
        const serverRetryMs = typeof error === "object" && error !== null && "retryAfterMs" in error && typeof error.retryAfterMs === "number" ? error.retryAfterMs : null;
        const delay = serverRetryMs ?? retryDelaysMs[Math.min(attempt, Math.max(0, retryDelaysMs.length - 1))] ?? 60_000;
        attempt += 1;
        setState((previous) => ({
          ...previous,
          status: transient ? (currentData || previous.data ? "stale" : "retrying") : "unavailable",
          errorCategory: category,
          retryCount: attempt,
          retryAfterMs: transient ? delay : null,
        }));
        if (transient && delay >= 0) retryTimer = window.setTimeout(() => { retryTimer = null; void run(); }, delay);
      }
    };

    void run();
    return () => {
      active = false;
      controller.abort();
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [cache, enabled, generation, retryDelaysMs, url]);

  return { ...state, reload };
}

export function jsonDataset<T>(validator: (value: unknown) => value is T): (response: Response) => Promise<T> {
  return async (response) => {
    const value: unknown = await response.json();
    if (!validator(value)) throw new SyntaxError("malformed dataset response");
    return value;
  };
}
