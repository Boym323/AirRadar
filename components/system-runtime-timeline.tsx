"use client";

import { useEffect, useMemo, useState } from "react";
import type { LocaleKey } from "@/lib/i18n";
import {
  Card,
  MetricCard,
  MetricStrip,
  SectionHeader,
  StatusBadge,
  type StatusBadgeVariant,
} from "@/components/ui-primitives";
import styles from "./system-runtime-timeline.module.css";

type DatabaseState = "ok" | "offline" | "disabled";
type LocalProviderState = "online" | "offline";
type NetworkProviderState =
  | "disabled"
  | "connecting"
  | "disconnected"
  | "degraded"
  | "online"
  | "stale"
  | "timeout"
  | "rate_limited"
  | "http_error"
  | "invalid_response";

interface RuntimeTelemetrySample {
  recordedAt: string;
  processRssBytes: number;
  heapUsedBytes: number;
  cgroupMemoryCurrentBytes: number | null;
  activeSseClients: number;
  aircraftCount: number | null;
  listenerCount: number | null;
  databaseState: DatabaseState;
  databaseLatencyMs: number | null;
  localProviderState: LocalProviderState;
  networkProviderState: NetworkProviderState;
}

interface RuntimeTelemetryHistory {
  schemaVersion: 1;
  intervalMs: number;
  retentionMs: number;
  samples: RuntimeTelemetrySample[];
  diagnostics: {
    file: string;
    loadedFromDisk: boolean;
    lastLoadError: string | null;
    lastSaveAt: string | null;
    lastSaveError: string | null;
  };
}

interface TimelineEvent {
  id: string;
  at: string;
  label: string;
  detail: string | null;
  variant: StatusBadgeVariant;
}

const WINDOW_MS = 60 * 60_000;
const DB_LATENCY_SPIKE_MIN_MS = 100;
const DB_LATENCY_SPIKE_FACTOR = 2;

function formatTime(value: string, locale: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(date)
    : "—";
}

function networkVariant(state: NetworkProviderState): StatusBadgeVariant {
  if (state === "online") return "success";
  if (state === "disabled") return "neutral";
  if (state === "connecting" || state === "stale" || state === "degraded") return "warning";
  return "danger";
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function buildEvents(samples: RuntimeTelemetrySample[], cs: boolean): TimelineEvent[] {
  if (!samples.length) return [];

  const events: TimelineEvent[] = [];
  const add = (
    sample: RuntimeTelemetrySample,
    key: string,
    label: string,
    detail: string | null,
    variant: StatusBadgeVariant,
  ) => {
    events.push({
      id: `${sample.recordedAt}-${key}`,
      at: sample.recordedAt,
      label,
      detail,
      variant,
    });
  };

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]!;
    const current = samples[index]!;

    if (current.localProviderState !== previous.localProviderState) {
      add(
        current,
        "receiver-state",
        current.localProviderState === "online"
          ? (cs ? "Lokální receiver online" : "Local receiver online")
          : (cs ? "Lokální receiver offline" : "Local receiver offline"),
        `${previous.localProviderState} → ${current.localProviderState}`,
        current.localProviderState === "online" ? "success" : "danger",
      );
    }

    if (current.databaseState !== previous.databaseState) {
      const labels = cs
        ? {
            ok: "Databáze healthy",
            offline: "Databáze offline",
            disabled: "Databáze disabled",
          }
        : {
            ok: "Database healthy",
            offline: "Database offline",
            disabled: "Database disabled",
          };
      add(
        current,
        "database-state",
        labels[current.databaseState],
        current.databaseLatencyMs === null ? null : `${current.databaseLatencyMs} ms`,
        current.databaseState === "ok"
          ? "success"
          : current.databaseState === "disabled"
            ? "neutral"
            : "danger",
      );
    }

    if (current.networkProviderState !== previous.networkProviderState) {
      add(
        current,
        "network-state",
        cs ? "Změna network feedu" : "Network feed changed",
        `${previous.networkProviderState} → ${current.networkProviderState}`,
        networkVariant(current.networkProviderState),
      );
    }
  }

  const aircraftSamples = samples.filter(
    (sample): sample is RuntimeTelemetrySample & { aircraftCount: number } => sample.aircraftCount !== null,
  );
  if (aircraftSamples.length) {
    const peak = aircraftSamples.reduce((best, sample) =>
      sample.aircraftCount > best.aircraftCount ? sample : best,
    );
    add(
      peak,
      "aircraft-peak",
      cs ? "Peak sledovaných letadel" : "Peak tracked aircraft",
      `${peak.aircraftCount} ${cs ? "letadel" : "aircraft"}`,
      "neutral",
    );
  }

  const latencySamples = samples.filter(
    (sample): sample is RuntimeTelemetrySample & { databaseLatencyMs: number } =>
      sample.databaseLatencyMs !== null,
  );
  if (latencySamples.length >= 2) {
    const baseline = median(latencySamples.map((sample) => sample.databaseLatencyMs));
    const maximum = latencySamples.reduce((best, sample) =>
      sample.databaseLatencyMs > best.databaseLatencyMs ? sample : best,
    );
    const threshold = Math.max(
      DB_LATENCY_SPIKE_MIN_MS,
      (baseline ?? 0) * DB_LATENCY_SPIKE_FACTOR,
    );

    if (maximum.databaseLatencyMs >= threshold) {
      add(
        maximum,
        "db-latency-spike",
        cs ? "Výrazný nárůst DB latence" : "Significant DB latency spike",
        baseline === null
          ? `${maximum.databaseLatencyMs} ms`
          : `${maximum.databaseLatencyMs} ms · median ${Math.round(baseline)} ms`,
        maximum.databaseLatencyMs >= 500 ? "danger" : "warning",
      );
    }
  }

  const latest = samples.at(-1)!;
  add(
    latest,
    "latest",
    cs ? "Poslední runtime vzorek" : "Latest runtime sample",
    [
      latest.aircraftCount === null
        ? null
        : `${latest.aircraftCount} ${cs ? "letadel" : "aircraft"}`,
      `DB ${latest.databaseState}`,
      `LOCAL ${latest.localProviderState}`,
      `NET ${latest.networkProviderState}`,
    ].filter(Boolean).join(" · "),
    latest.localProviderState === "online" && latest.databaseState === "ok"
      ? "success"
      : "warning",
  );

  const unique = new Map<string, TimelineEvent>();
  for (const event of events) unique.set(event.id, event);

  return [...unique.values()]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 24);
}

export function SystemRuntimeTimeline({ locale }: { locale: LocaleKey }) {
  const cs = locale.startsWith("cs");
  const copy = cs ? {
    title: "System & Receiver Timeline",
    subtitle: "Admin-only runtime historie za posledních 60 minut. Události vznikají pouze z uložených minutových telemetry vzorků.",
    samples: "Vzorky / 60 min",
    peakAircraft: "Peak aircraft",
    maxDbLatency: "Max DB latency",
    stateChanges: "Změny stavů",
    loading: "Načítám runtime historii…",
    unavailable: "Runtime historie není dostupná.",
    authRequired: "Autentizovaná admin session již není platná.",
    noEvents: "V posledních 60 minutách nejsou dostupné runtime vzorky.",
    resolution: "Rozlišení",
    retention: "Retence",
    source: "RUNTIME TELEMETRY",
  } : {
    title: "System & Receiver Timeline",
    subtitle: "Admin-only runtime history for the last 60 minutes. Events are derived only from persisted minute-level telemetry samples.",
    samples: "Samples / 60 min",
    peakAircraft: "Peak aircraft",
    maxDbLatency: "Max DB latency",
    stateChanges: "State changes",
    loading: "Loading runtime history…",
    unavailable: "Runtime history is unavailable.",
    authRequired: "The authenticated admin session is no longer valid.",
    noEvents: "No runtime samples are available for the last 60 minutes.",
    resolution: "Resolution",
    retention: "Retention",
    source: "RUNTIME TELEMETRY",
  };

  const [history, setHistory] = useState<RuntimeTelemetryHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"ok" | "auth" | "error">("ok");

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const load = async () => {
      try {
        const response = await fetch("/api/system/runtime-history", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.status === 401) {
          if (active) {
            setStatus("auth");
            setHistory(null);
          }
          return;
        }
        if (!response.ok) throw new Error("runtime history unavailable");

        const payload = await response.json() as RuntimeTelemetryHistory;
        if (active) {
          setHistory(payload);
          setStatus("ok");
        }
      } catch (error) {
        if (active && (error as Error).name !== "AbortError") {
          setStatus("error");
          setHistory(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    const timer = window.setInterval(() => { void load(); }, 60_000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, []);

  const samples = useMemo(() => {
    const cutoff = Date.now() - WINDOW_MS;
    return (history?.samples ?? []).filter(
      (sample) => Date.parse(sample.recordedAt) >= cutoff,
    );
  }, [history?.samples]);

  const events = useMemo(() => buildEvents(samples, cs), [samples, cs]);

  const peakAircraft = samples.reduce<number | null>(
    (best, sample) =>
      sample.aircraftCount === null
        ? best
        : best === null
          ? sample.aircraftCount
          : Math.max(best, sample.aircraftCount),
    null,
  );

  const maxDbLatency = samples.reduce<number | null>(
    (best, sample) =>
      sample.databaseLatencyMs === null
        ? best
        : best === null
          ? sample.databaseLatencyMs
          : Math.max(best, sample.databaseLatencyMs),
    null,
  );

  const stateChanges = samples.slice(1).reduce((count, sample, index) => {
    const previous = samples[index]!;
    return count
      + Number(sample.localProviderState !== previous.localProviderState)
      + Number(sample.networkProviderState !== previous.networkProviderState)
      + Number(sample.databaseState !== previous.databaseState);
  }, 0);

  return <Card className={styles.card} data-testid="system-runtime-timeline-v1">
    <SectionHeader
      kicker={t.locale.startsWith("cs") ? "POSLEDNÍCH 60 MINUT" : "LAST 60 MINUTES"}
      title={copy.title}
      description={copy.subtitle}
      actions={<StatusBadge
        variant={status === "ok" ? "success" : status === "auth" ? "warning" : "danger"}
      >
        {status === "ok" ? copy.source : status === "auth" ? (t.locale.startsWith("cs") ? "VYŽADOVÁNO PŘIHLÁŠENÍ" : "AUTH REQUIRED") : (t.locale.startsWith("cs") ? "NEDOSTUPNÉ" : "UNAVAILABLE")}
      </StatusBadge>}
    />

    {history ? <MetricStrip>
      <MetricCard
        value={String(samples.length)}
        label={copy.samples}
        detail={`${copy.resolution}: ${Math.round(history.intervalMs / 1000)} s`}
      />
      <MetricCard
        value={peakAircraft === null ? "—" : String(peakAircraft)}
        label={copy.peakAircraft}
      />
      <MetricCard
        value={maxDbLatency === null ? "—" : `${maxDbLatency} ms`}
        label={copy.maxDbLatency}
      />
      <MetricCard
        value={String(stateChanges)}
        label={copy.stateChanges}
        detail={`${copy.retention}: ${Math.round(history.retentionMs / 3_600_000)} h`}
      />
    </MetricStrip> : null}

    {loading && !history ? <p className={styles.message}>{copy.loading}</p> : null}
    {!loading && status === "auth" ? <p className={styles.message}>{copy.authRequired}</p> : null}
    {!loading && status === "error" ? <p className={styles.message}>{copy.unavailable}</p> : null}

    {events.length ? <ol className={styles.timeline}>
      {events.map((event) => <li key={event.id}>
        <time dateTime={event.at}>{formatTime(event.at, locale)}</time>
        <span className={styles.marker} aria-hidden="true" />
        <div>
          <strong>{event.label}</strong>
          {event.detail ? <small>{event.detail}</small> : null}
        </div>
        <StatusBadge variant={event.variant}>{event.variant.toUpperCase()}</StatusBadge>
      </li>)}
    </ol> : !loading && status === "ok"
      ? <p className={styles.message}>{copy.noEvents}</p>
      : null}

    {history?.diagnostics.lastSaveError
      ? <p className={styles.warning}>runtime telemetry save: {history.diagnostics.lastSaveError}</p>
      : null}
  </Card>;
}
