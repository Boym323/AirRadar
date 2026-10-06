"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { t } from "@/lib/i18n";
import type {
  NavigationIntegrityAnomaly,
  NavigationIntegrityAuditCategory,
  NavigationIntegrityConfidence,
  NavigationIntegrityCurrentResponse,
} from "@/lib/navigation-integrity/types";
import {
  Button,
  EmptyState,
  MetricCard,
  MetricStrip,
  PageHeader,
  Panel,
  SectionHeader,
  SegmentedControl,
  StatusBadge,
} from "@/components/ui-primitives";
import styles from "./navigation-integrity-center.module.css";

type WindowRange = "5m" | "15m" | "30m" | "60m";
type SourceFilter = "ALL" | "LOCAL" | "NETWORK";
type SeverityFilter = "ALL" | NavigationIntegrityAnomaly["severity"];
type ConfidenceFilter = "ALL" | NavigationIntegrityConfidence;
type HistoryRange = "24h" | "7d" | "30d";

interface HistoryResponse {
  from: string;
  to: string;
  anomalies: NavigationIntegrityAnomaly[];
}

const WINDOWS: WindowRange[] = ["5m", "15m", "30m", "60m"];
const HISTORY_RANGES: HistoryRange[] = ["24h", "7d", "30d"];
const ALTITUDE_PRESETS = [
  { label: "ALL", min: "", max: "" },
  { label: "< FL100", min: "", max: "9999" },
  { label: "FL100-200", min: "10000", max: "19999" },
  { label: "FL200-300", min: "20000", max: "29999" },
  { label: "FL300-400", min: "30000", max: "39999" },
  { label: ">= FL400", min: "40000", max: "" },
] as const;

function historyRangeStart(range: HistoryRange): Date {
  const days = range === "30d" ? 30 : range === "7d" ? 7 : 1;
  return new Date(Date.now() - days * 24 * 60 * 60_000);
}

function altitudeBandRange(band: number): { min: number | null; max: number | null } {
  if (band === 0) return { min: null, max: 9_999 };
  if (band === 1) return { min: 10_000, max: 19_999 };
  if (band === 2) return { min: 20_000, max: 29_999 };
  if (band === 3) return { min: 30_000, max: 39_999 };
  if (band === 4) return { min: 40_000, max: null };
  return { min: null, max: null };
}

function matchesAltitude(anomaly: NavigationIntegrityAnomaly, minAltitude: string, maxAltitude: string): boolean {
  const min = minAltitude === "" ? null : Number(minAltitude);
  const max = maxAltitude === "" ? null : Number(maxAltitude);
  if (min === null && max === null) return true;
  return anomaly.altitudeBands.some((band) => {
    const range = altitudeBandRange(band);
    const lower = range.min ?? Number.NEGATIVE_INFINITY;
    const upper = range.max ?? Number.POSITIVE_INFINITY;
    return (min === null || upper >= min) && (max === null || lower <= max);
  });
}

function matchesSource(anomaly: NavigationIntegrityAnomaly, source: SourceFilter): boolean {
  if (source === "ALL") return true;
  return source === "LOCAL" ? anomaly.evidence.localAircraft > 0 : anomaly.evidence.networkAircraft > 0;
}

function severityVariant(severity: NavigationIntegrityAnomaly["severity"]): "warning" | "danger" {
  return severity === "SEVERE" ? "danger" : "warning";
}

function confidenceVariant(confidence: NavigationIntegrityConfidence): "success" | "warning" | "neutral" {
  if (confidence === "HIGH") return "success";
  if (confidence === "MEDIUM") return "warning";
  return "neutral";
}

function durationLabel(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 60) return String(Math.max(0, Math.round(seconds))) + " s";
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? String(minutes) + " min" : (minutes / 60).toFixed(1) + " h";
}

function altitudeBandsLabel(bands: number[]): string {
  if (!bands.length) return "—";
  return bands.map((band) => {
    if (band === 0) return "< FL100";
    if (band === 1) return "FL100-200";
    if (band === 2) return "FL200-300";
    if (band === 3) return "FL300-400";
    if (band === 4) return ">= FL400";
    return "UNKNOWN";
  }).join(", ");
}

function categoryLabel(value: NavigationIntegrityAuditCategory): string {
  return value.replaceAll("_", " ");
}

function anomalyTitle(anomaly: NavigationIntegrityAnomaly): string {
  const category = anomaly.evidence.structured.auditCategories[0];
  if (category && category !== "UNKNOWN") return categoryLabel(category);
  return anomaly.evidence.structured.likelyExplanation || "NAVIGATION INTEGRITY ANOMALY";
}

function timeLabel(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat(t.locale, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}

export function NavigationIntegrityCenter() {
  const cs = t.locale.startsWith("cs");
  const copy = cs ? {
    title: "Navigation Integrity",
    subtitle: "Provozní přehled integrity navigačních dat nad existujícím detektorem AirRadar.",
    back: "Zpět na radar",
    window: "Okno",
    source: "Zdroj",
    altitude: "Výška",
    severity: "Závažnost",
    confidence: "Důvěra",
    category: "Typ",
    observedAircraft: "Pozorovaná letadla",
    activeAnomalies: "Aktivní anomálie",
    reducedAircraft: "Snížená integrita",
    populatedCells: "Aktivní buňky",
    localAnomalies: "LOCAL anomálie",
    networkAnomalies: "NETWORK anomálie",
    currentTitle: "Aktuální anomálie",
    currentDescription: "Aktivní detekce ve zvoleném okně. Zdroj a výška filtrují pozorování; anomálie se filtrují také podle jejich důkazů.",
    cellsTitle: "Nejhorší buňky",
    cellsDescription: "Buňky mimo stav NORMAL, seřazené podle závažnosti.",
    historyTitle: "Historie",
    historyDescription: "Persistované anomálie až 30 dní zpět; API vrací nejvýše 200 záznamů.",
    affected: "Dotčená letadla",
    samples: "Vzorky",
    duration: "Trvání",
    bands: "Výšková pásma",
    started: "Začátek",
    ended: "Konec",
    ongoing: "probíhá",
    noActive: "Pro zvolené filtry nejsou aktivní anomálie.",
    noHistory: "Pro zvolené filtry není v historii žádná anomálie.",
    noCells: "V aktuálním okně nejsou degradované buňky.",
    loading: "Načítám data integrity…",
    unavailable: "Navigation Integrity data jsou dočasně nedostupná.",
    refresh: "Obnovit",
    reset: "Reset filtrů",
    updated: "Aktualizováno",
  } : {
    title: "Navigation Integrity",
    subtitle: "Operational view over AirRadar's existing navigation-integrity detector.",
    back: "Back to radar",
    window: "Window",
    source: "Source",
    altitude: "Altitude",
    severity: "Severity",
    confidence: "Confidence",
    category: "Type",
    observedAircraft: "Observed aircraft",
    activeAnomalies: "Active anomalies",
    reducedAircraft: "Reduced integrity",
    populatedCells: "Populated cells",
    localAnomalies: "LOCAL anomalies",
    networkAnomalies: "NETWORK anomalies",
    currentTitle: "Current anomalies",
    currentDescription: "Active detections in the selected window. Source and altitude filter observations; anomalies are also filtered by their evidence.",
    cellsTitle: "Worst cells",
    cellsDescription: "Non-NORMAL cells ordered by severity.",
    historyTitle: "History",
    historyDescription: "Persisted anomalies over a bounded range of up to 30 days; the API returns at most 200 records.",
    affected: "Affected aircraft",
    samples: "Samples",
    duration: "Duration",
    bands: "Altitude bands",
    started: "Started",
    ended: "Ended",
    ongoing: "ongoing",
    noActive: "No active anomalies match the selected filters.",
    noHistory: "No historical anomalies match the selected filters.",
    noCells: "There are no degraded cells in the selected window.",
    loading: "Loading integrity data…",
    unavailable: "Navigation Integrity data is temporarily unavailable.",
    refresh: "Refresh",
    reset: "Reset filters",
    updated: "Updated",
  };

  const [windowRange, setWindowRange] = useState<WindowRange>("15m");
  const [source, setSource] = useState<SourceFilter>("ALL");
  const [minAltitude, setMinAltitude] = useState("");
  const [maxAltitude, setMaxAltitude] = useState("");
  const [severity, setSeverity] = useState<SeverityFilter>("ALL");
  const [confidence, setConfidence] = useState<ConfidenceFilter>("ALL");
  const [category, setCategory] = useState<NavigationIntegrityAuditCategory | "ALL">("ALL");
  const [historyRange, setHistoryRange] = useState<HistoryRange>("24h");
  const [current, setCurrent] = useState<NavigationIntegrityCurrentResponse | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [loadingCurrent, setLoadingCurrent] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [currentFailed, setCurrentFailed] = useState(false);
  const [historyFailed, setHistoryFailed] = useState(false);
  const [revision, setRevision] = useState(0);

  const loadCurrent = useCallback(async (signal?: AbortSignal) => {
    const params = new URLSearchParams({ window: windowRange });
    if (source !== "ALL") params.set("source", source);
    if (minAltitude !== "") params.set("minAltitude", minAltitude);
    if (maxAltitude !== "") params.set("maxAltitude", maxAltitude);
    setLoadingCurrent(true);
    try {
      const response = await fetch("/api/navigation-integrity/current?" + params.toString(), { cache: "no-store", signal });
      if (!response.ok) throw new Error("current integrity unavailable");
      setCurrent(await response.json() as NavigationIntegrityCurrentResponse);
      setCurrentFailed(false);
    } catch {
      if (!signal?.aborted) setCurrentFailed(true);
    } finally {
      if (!signal?.aborted) setLoadingCurrent(false);
    }
  }, [maxAltitude, minAltitude, source, windowRange]);

  const loadHistory = useCallback(async (signal?: AbortSignal) => {
    const params = new URLSearchParams({
      from: historyRangeStart(historyRange).toISOString(),
      to: new Date().toISOString(),
    });
    setLoadingHistory(true);
    try {
      const response = await fetch("/api/navigation-integrity/history?" + params.toString(), { cache: "no-store", signal });
      if (!response.ok) throw new Error("history integrity unavailable");
      setHistory(await response.json() as HistoryResponse);
      setHistoryFailed(false);
    } catch {
      if (!signal?.aborted) setHistoryFailed(true);
    } finally {
      if (!signal?.aborted) setLoadingHistory(false);
    }
  }, [historyRange]);

  useEffect(() => {
    const controller = new AbortController();
    void loadCurrent(controller.signal);
    return () => controller.abort();
  }, [loadCurrent, revision]);

  useEffect(() => {
    const controller = new AbortController();
    void loadHistory(controller.signal);
    return () => controller.abort();
  }, [loadHistory, revision]);

  useEffect(() => {
    const timer = window.setInterval(() => setRevision((value) => value + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const categories = useMemo(() => {
    const values = new Set<NavigationIntegrityAuditCategory>();
    for (const anomaly of current?.activeAnomalies ?? []) {
      anomaly.evidence.structured.auditCategories.forEach((item) => values.add(item));
    }
    for (const anomaly of history?.anomalies ?? []) {
      anomaly.evidence.structured.auditCategories.forEach((item) => values.add(item));
    }
    return [...values].sort();
  }, [current, history]);

  const filterAnomaly = useCallback((anomaly: NavigationIntegrityAnomaly) => {
    return matchesSource(anomaly, source)
      && matchesAltitude(anomaly, minAltitude, maxAltitude)
      && (severity === "ALL" || anomaly.severity === severity)
      && (confidence === "ALL" || anomaly.confidence === confidence)
      && (category === "ALL" || anomaly.evidence.structured.auditCategories.includes(category));
  }, [category, confidence, maxAltitude, minAltitude, severity, source]);

  const activeAnomalies = useMemo(() => (current?.activeAnomalies ?? []).filter(filterAnomaly), [current, filterAnomaly]);
  const historyAnomalies = useMemo(() => (history?.anomalies ?? []).filter(filterAnomaly), [history, filterAnomaly]);
  const localActive = activeAnomalies.filter((item) => item.evidence.localAircraft > 0).length;
  const networkActive = activeAnomalies.filter((item) => item.evidence.networkAircraft > 0).length;

  const degradedCells = useMemo(() => {
    const weight: Record<string, number> = { SEVERE: 4, DEGRADED: 3, REDUCED: 2, UNKNOWN: 1, NORMAL: 0 };
    return [...(current?.cells ?? [])]
      .filter((cell) => cell.state !== "NORMAL")
      .sort((a, b) => (weight[b.state] ?? 0) - (weight[a.state] ?? 0) || b.affectedAircraftCount - a.affectedAircraftCount)
      .slice(0, 12);
  }, [current]);

  function resetFilters(): void {
    setWindowRange("15m");
    setSource("ALL");
    setMinAltitude("");
    setMaxAltitude("");
    setSeverity("ALL");
    setConfidence("ALL");
    setCategory("ALL");
    setHistoryRange("24h");
  }

  const altitudePresetIndex = Math.max(0, ALTITUDE_PRESETS.findIndex((item) => item.min === minAltitude && item.max === maxAltitude));
  const updatedAt = current?.generatedAt ?? history?.to ?? null;

  return (
    <main className={styles.page}>
      <PageHeader
        className={styles.header}
        backLink={<Link className="back-link" href="/">{copy.back}</Link>}
        kicker="AIRRADAR · INTEGRITY"
        title={copy.title}
        description={copy.subtitle}
        actions={<div className={styles.headerActions}>
          {updatedAt ? <span>{copy.updated}: {timeLabel(updatedAt)}</span> : null}
          <Button size="compact" onClick={() => setRevision((value) => value + 1)}>{copy.refresh}</Button>
        </div>}
      />

      <Panel className={styles.filters}>
        <div className={styles.filterBlock}>
          <span>{copy.window}</span>
          <SegmentedControl role="tablist" aria-label={copy.window}>
            {WINDOWS.map((item) => <button key={item} type="button" role="tab" aria-selected={windowRange === item} className={windowRange === item ? "active" : ""} onClick={() => setWindowRange(item)}>{item}</button>)}
          </SegmentedControl>
        </div>
        <div className={styles.filterBlock}>
          <span>{copy.source}</span>
          <SegmentedControl role="tablist" aria-label={copy.source}>
            {(["ALL", "LOCAL", "NETWORK"] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={source === item} className={source === item ? "active" : ""} onClick={() => setSource(item)}>{item}</button>)}
          </SegmentedControl>
        </div>
        <label className={styles.selectLabel}>
          <span>{copy.altitude}</span>
          <select value={altitudePresetIndex} onChange={(event) => {
            const preset = ALTITUDE_PRESETS[Number(event.target.value)] ?? ALTITUDE_PRESETS[0];
            setMinAltitude(preset.min);
            setMaxAltitude(preset.max);
          }}>
            {ALTITUDE_PRESETS.map((item, index) => <option key={item.label} value={index}>{item.label}</option>)}
          </select>
        </label>
        <label className={styles.selectLabel}>
          <span>{copy.severity}</span>
          <select value={severity} onChange={(event) => setSeverity(event.target.value as SeverityFilter)}>
            <option value="ALL">ALL</option>
            <option value="REDUCED">REDUCED</option>
            <option value="DEGRADED">DEGRADED</option>
            <option value="SEVERE">SEVERE</option>
          </select>
        </label>
        <label className={styles.selectLabel}>
          <span>{copy.confidence}</span>
          <select value={confidence} onChange={(event) => setConfidence(event.target.value as ConfidenceFilter)}>
            <option value="ALL">ALL</option>
            <option value="LOW">LOW</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HIGH">HIGH</option>
          </select>
        </label>
        <label className={styles.selectLabel}>
          <span>{copy.category}</span>
          <select value={category} onChange={(event) => setCategory(event.target.value as NavigationIntegrityAuditCategory | "ALL")}>
            <option value="ALL">ALL</option>
            {categories.map((item) => <option key={item} value={item}>{categoryLabel(item)}</option>)}
          </select>
        </label>
        <Button size="compact" variant="ghost" onClick={resetFilters}>{copy.reset}</Button>
      </Panel>

      {currentFailed ? <div className={styles.error} role="alert">{copy.unavailable}</div> : null}
      <MetricStrip className={styles.metrics}>
        <MetricCard value={loadingCurrent && !current ? "…" : current?.summary.aircraft ?? "—"} label={copy.observedAircraft} detail={windowRange} />
        <MetricCard value={loadingCurrent && !current ? "…" : activeAnomalies.length} label={copy.activeAnomalies} detail={source + " · " + severity} />
        <MetricCard value={loadingCurrent && !current ? "…" : current?.summary.reducedAircraft ?? "—"} label={copy.reducedAircraft} detail={windowRange} />
        <MetricCard value={loadingCurrent && !current ? "…" : current?.summary.cells ?? "—"} label={copy.populatedCells} />
        <MetricCard value={localActive} label={copy.localAnomalies} />
        <MetricCard value={networkActive} label={copy.networkAnomalies} />
      </MetricStrip>

      <Panel className={styles.section}>
        <SectionHeader title={copy.currentTitle} description={copy.currentDescription} />
        {loadingCurrent && !current ? <p className={styles.status}>{copy.loading}</p> : activeAnomalies.length === 0 ? (
          <EmptyState title={copy.noActive} />
        ) : (
          <div className={styles.anomalyGrid}>
            {activeAnomalies.map((anomaly) => (
              <article className={styles.anomalyCard} key={anomaly.id}>
                <div className={styles.anomalyHead}>
                  <div>
                    <strong>{anomalyTitle(anomaly)}</strong>
                    <span>{timeLabel(anomaly.startedAt)} · {anomaly.evidence.structured.likelyExplanation}</span>
                  </div>
                  <div className={styles.badges}>
                    <StatusBadge variant={severityVariant(anomaly.severity)}>{anomaly.severity}</StatusBadge>
                    <StatusBadge variant={confidenceVariant(anomaly.confidence)}>{anomaly.confidence}</StatusBadge>
                  </div>
                </div>
                <dl className={styles.anomalyFacts}>
                  <div><dt>{copy.affected}</dt><dd>{anomaly.affectedAircraftCount}</dd></div>
                  <div><dt>{copy.samples}</dt><dd>{anomaly.sampleCount}</dd></div>
                  <div><dt>LOCAL</dt><dd>{anomaly.evidence.localAircraft}</dd></div>
                  <div><dt>NETWORK</dt><dd>{anomaly.evidence.networkAircraft}</dd></div>
                  <div><dt>{copy.duration}</dt><dd>{durationLabel(anomaly.evidence.durationSeconds)}</dd></div>
                  <div><dt>Cells</dt><dd>{anomaly.cellKeys.length}</dd></div>
                </dl>
                <div className={styles.anomalyFoot}>
                  <span>{copy.bands}: {altitudeBandsLabel(anomaly.altitudeBands)}</span>
                  <span>{anomaly.evidence.structured.auditCategories.map(categoryLabel).join(" · ")}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>

      <Panel className={styles.section}>
        <SectionHeader title={copy.cellsTitle} description={copy.cellsDescription} />
        {degradedCells.length === 0 ? <EmptyState title={copy.noCells} /> : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>Cell</th><th>State</th><th>Confidence</th><th>{copy.affected}</th><th>{copy.samples}</th><th>LOCAL</th><th>NETWORK</th><th>NIC / NACp / NACv</th></tr>
              </thead>
              <tbody>
                {degradedCells.map((cell) => (
                  <tr key={cell.cellKey}>
                    <td><code>{cell.cellKey}</code></td>
                    <td><StatusBadge variant={cell.state === "SEVERE" ? "danger" : "warning"}>{cell.state}</StatusBadge></td>
                    <td>{cell.confidence}</td>
                    <td>{cell.affectedAircraftCount}</td>
                    <td>{cell.sampleCount}</td>
                    <td>{cell.localAircraftCount}</td>
                    <td>{cell.networkAircraftCount}</td>
                    <td>{cell.medianNic ?? "—"} / {cell.medianNacP ?? "—"} / {cell.medianNacV ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel className={styles.section}>
        <SectionHeader
          title={copy.historyTitle}
          description={copy.historyDescription}
          actions={<SegmentedControl role="tablist" aria-label={copy.historyTitle}>
            {HISTORY_RANGES.map((item) => <button key={item} type="button" role="tab" aria-selected={historyRange === item} className={historyRange === item ? "active" : ""} onClick={() => setHistoryRange(item)}>{item}</button>)}
          </SegmentedControl>}
        />
        {historyFailed ? <div className={styles.error} role="alert">{copy.unavailable}</div> : loadingHistory && !history ? <p className={styles.status}>{copy.loading}</p> : historyAnomalies.length === 0 ? (
          <EmptyState title={copy.noHistory} />
        ) : (
          <div className={styles.historyList}>
            {historyAnomalies.map((anomaly) => (
              <article className={styles.historyRow} key={anomaly.id + ":" + anomaly.startedAt}>
                <div>
                  <strong>{anomalyTitle(anomaly)}</strong>
                  <span>{copy.started}: {timeLabel(anomaly.startedAt)} · {copy.ended}: {anomaly.endedAt ? timeLabel(anomaly.endedAt) : copy.ongoing}</span>
                </div>
                <span>{anomaly.affectedAircraftCount} {copy.affected.toLowerCase()}</span>
                <span>{altitudeBandsLabel(anomaly.altitudeBands)}</span>
                <div className={styles.badges}>
                  <StatusBadge variant={severityVariant(anomaly.severity)}>{anomaly.severity}</StatusBadge>
                  <StatusBadge variant={confidenceVariant(anomaly.confidence)}>{anomaly.confidence}</StatusBadge>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>
    </main>
  );
}
