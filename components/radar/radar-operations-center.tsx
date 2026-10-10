"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type {
  LogbookInterestingReason,
  LogbookSummaryResponse,
} from "@/lib/aircraft/types";
import { formatDistance, formatTime, t } from "@/lib/i18n";
import {
  attentionOperationsCount,
  liveOperationsHighlights,
  OPERATIONS_CENTER_WINDOW_MS,
  predictiveOperationsIcaos,
  recentOperationsTimeline,
  relevantOperationsAirportIcaos,
} from "@/lib/intelligence/operations-center";
import type { FlightEventType } from "@/lib/intelligence/types";
import type { OperationalAttentionSummary } from "@/lib/operational-twin/operational-attention";
import type { RegionalSituationGraph } from "@/lib/operational-twin/regional-situation";
import type { RegionalFocusQueue } from "@/lib/operational-twin/regional-focus-queue";
import {
  REGIONAL_ATTENTION_MAP_FOCUS_EVENT,
  regionalAttentionHorizonForOffset,
  type RegionalAttentionHorizonMinutes,
  type RegionalAttentionMapFocusEventDetail,
} from "@/lib/operational-twin/regional-attention-ui";
import type { PredictiveOperationsResponse } from "@/lib/predictive-intelligence";
import { PREDICTIVE_OPERATIONS_STALE_AFTER_MS } from "@/lib/predictive-intelligence/operations-center";
import { RUNWAY_CHANGE_ADVISORY_EVENT_WINDOW_MS } from "@/lib/predictive-intelligence/runway-change-advisory";
import type { AlertHistoryEntry, AlertHistoryPage } from "@/lib/server/alert-history";
import type { AirportOperationsResponse } from "@/lib/server/airport-operations";
import { IconButton, Panel, StatusBadge, UiIcon } from "@/components/ui-primitives";
import { useIntelligenceStream } from "@/components/use-intelligence-stream";
import { OPEN_OPERATIONS_CENTER_EVENT } from "@/lib/search/command-palette";
import styles from "./radar-operations-center.module.css";

const CLOCK_REFRESH_INTERVAL_MS = 60_000;
const SUPPLEMENTARY_REFRESH_INTERVAL_MS = 120_000;
const AIRPORT_CONTEXT_REFRESH_INTERVAL_MS = 300_000;
const PREDICTIVE_REFRESH_INTERVAL_MS = 30_000;
const REGIONAL_REFRESH_INTERVAL_MS = 30_000;
const REGIONAL_STALE_AFTER_MS = 90_000;

type RegionalAttentionGraduationStatus = {
  version: "regional-attention-graduation-v1";
  decision: "PASS" | "WAIT" | "FAIL";
  graduated: boolean;
  scope: "REGIONAL_COPRESENCE_CONTEXT_ONLY";
};

type RegionalOperationsResponse = RegionalSituationGraph & {
  attention: OperationalAttentionSummary;
  focusQueue: RegionalFocusQueue;
  attentionGraduation: RegionalAttentionGraduationStatus;
};

type SupplementaryStatus = "idle" | "loading" | "ready" | "partial" | "unavailable";

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) throw new Error(`Operations Center request failed: ${response.status}`);
  return await response.json() as T;
}

function alertTitle(entry: AlertHistoryEntry): string {
  if (entry.type === "emergency_7500") return "Squawk 7500";
  if (entry.type === "emergency_7600") return "Squawk 7600";
  if (entry.type === "emergency_7700") return "Squawk 7700";
  if (entry.type === "emergency") return t.alerts.types.emergency;
  if (entry.type === "new_aircraft") return t.alerts.types.newAircraft;
  if (entry.type === "reception_record") {
    return entry.record?.scope === "lifetime" ? t.alerts.types.lifetimeRecord : t.alerts.types.dailyRecord;
  }
  if (entry.type === "aircraft_appeared") return t.intelligence.operationsWatchlistAppeared;
  if (entry.type === "entered_radius") return t.intelligence.operationsEnteredRadius;
  if (entry.type === "alert_v1") return entry.alertV1?.ruleName ?? t.alerts.v1.event;
  return t.alerts.types.watchlist;
}

function alertDetail(entry: AlertHistoryEntry): string | null {
  if (entry.record) return formatDistance(entry.record.distanceKm);
  if (entry.squawk) return `Squawk ${entry.squawk}`;
  const ruleName = entry.ruleNames[0] ?? entry.alertV1?.ruleName;
  if (ruleName) return `${t.alerts.v1.rule}: ${ruleName}`;
  return entry.aircraft.aircraftType;
}

function alertContext(entry: AlertHistoryEntry): string {
  const airport = entry.alertV1?.airportIcao ?? null;
  const runway = entry.alertV1?.runway ?? null;
  if (airport) return runway ? `${airport} · RWY ${runway}` : airport;
  if (entry.radiusKm !== null) return `${Math.round(entry.radiusKm)} km`;
  return entry.aircraft.icaoHex;
}

function highlightReasonLabel(reason: LogbookInterestingReason): string {
  return t.dashboard.reasons[reason];
}

function dispatchRegionalMapFocus(detail: RegionalAttentionMapFocusEventDetail): void {
  window.dispatchEvent(new CustomEvent<RegionalAttentionMapFocusEventDetail>(
    REGIONAL_ATTENTION_MAP_FOCUS_EVENT,
    { detail },
  ));
}

export function RadarOperationsCenter() {
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  // The map renders this component even when its panel is closed. Do not
  // open an intelligence SSE connection or consume a public API quota until
  // the user actually requests the Operations Center.
  const intelligenceEvents = useIntelligenceStream(open);
  const [now, setNow] = useState(() => Date.now());
  const [alerts, setAlerts] = useState<AlertHistoryEntry[]>([]);
  const [logbook, setLogbook] = useState<LogbookSummaryResponse | null>(null);
  const [airportOperations, setAirportOperations] = useState<AirportOperationsResponse[]>([]);
  const [supplementaryStatus, setSupplementaryStatus] = useState<SupplementaryStatus>("idle");
  const [predictiveOperations, setPredictiveOperations] = useState<PredictiveOperationsResponse | null>(null);
  const [predictiveStatus, setPredictiveStatus] = useState<SupplementaryStatus>("idle");
  const [predictiveNow, setPredictiveNow] = useState(() => Date.now());
  const [regionalSituation, setRegionalSituation] = useState<RegionalOperationsResponse | null>(null);
  const [regionalStatus, setRegionalStatus] = useState<SupplementaryStatus>("idle");
  const [regionalHorizon, setRegionalHorizon] = useState<RegionalAttentionHorizonMinutes>(30);
  const [regionalMapFocusId, setRegionalMapFocusId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (searchParams.get("operations") === "1") setOpen(true);
  }, [searchParams]);

  useEffect(() => {
    const openFromCommand = () => setOpen(true);
    window.addEventListener(OPEN_OPERATIONS_CENTER_EVENT, openFromCommand);
    return () => window.removeEventListener(OPEN_OPERATIONS_CENTER_EVENT, openFromCommand);
  }, []);

  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const controller = new AbortController();

    const loadSupplementary = async () => {
      setSupplementaryStatus((current) => current === "idle" ? "loading" : current);
      const results = await Promise.allSettled([
        fetchJson<AlertHistoryPage>("/api/alerts?page=0&pageSize=50&filter=all", controller.signal),
        fetchJson<LogbookSummaryResponse>("/api/logbook/summary", controller.signal),
      ]);
      if (!active) return;

      let loaded = 0;
      const [alertResult, logbookResult] = results;
      if (alertResult.status === "fulfilled") {
        setAlerts(alertResult.value.items);
        loaded += 1;
      }
      if (logbookResult.status === "fulfilled") {
        setLogbook(logbookResult.value);
        loaded += 1;
      }
      setSupplementaryStatus(loaded === 2 ? "ready" : loaded === 1 ? "partial" : "unavailable");
    };

    void loadSupplementary();
    const timer = window.setInterval(() => void loadSupplementary(), SUPPLEMENTARY_REFRESH_INTERVAL_MS);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [open]);

  const timeline = useMemo(
    () => recentOperationsTimeline(intelligenceEvents, alerts, now),
    [alerts, intelligenceEvents, now],
  );
  const highlights = useMemo(() => liveOperationsHighlights(logbook), [logbook]);
  const focusedAircraftHex = searchParams.get("aircraft")?.trim().toUpperCase() ?? null;
  const predictiveHexes = useMemo(
    () => predictiveOperationsIcaos(timeline, highlights, 6, focusedAircraftHex),
    [focusedAircraftHex, highlights, timeline],
  );
  const predictiveHexKey = predictiveHexes.join(",");
  const relevantAirportKey = useMemo(
    () => relevantOperationsAirportIcaos(timeline).join(","),
    [timeline],
  );

  useEffect(() => {
    if (!open) return;
    if (!predictiveHexKey) {
      setPredictiveOperations(null);
      setPredictiveStatus("idle");
      return;
    }

    let active = true;
    const controller = new AbortController();
    setPredictiveOperations(null);
    setPredictiveStatus("loading");
    setPredictiveNow(Date.now());
    const loadPredictive = async () => {
      try {
        const response = await fetchJson<PredictiveOperationsResponse>(
          `/api/operations/predictive?hexes=${encodeURIComponent(predictiveHexKey)}`,
          controller.signal,
        );
        if (!active) return;
        setPredictiveOperations(response);
        setPredictiveNow(Date.now());
        setPredictiveStatus("ready");
      } catch {
        if (!active || controller.signal.aborted) return;
        setPredictiveOperations(null);
        setPredictiveStatus("unavailable");
      }
    };

    void loadPredictive();
    const timer = window.setInterval(() => void loadPredictive(), PREDICTIVE_REFRESH_INTERVAL_MS);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [open, predictiveHexKey]);

  useEffect(() => {
    if (!open || !predictiveOperations) return;
    const expiresAt = predictiveOperations.items.flatMap((item) => [
      item.etaAdvisory?.evaluatedAt,
      item.runwayAdvisory?.evaluatedAt,
      item.runwayChangeAdvisory?.evaluatedAt,
      item.trajectoryAdvisory?.evaluatedAt,
      item.etaAdminPreview?.state === "available" ? item.etaAdminPreview.evaluatedAt : null,
      item.runwayAdminPreview?.state === "available" ? item.runwayAdminPreview.evaluatedAt : null,
      item.runwayChangeAdminPreview?.state === "available" ? item.runwayChangeAdminPreview.evaluatedAt : null,
      item.trajectoryAdminPreview?.state === "available" ? item.trajectoryAdminPreview.evaluatedAt : null,
    ]).flatMap((value) => {
      if (!value) return [];
      const evaluatedAt = Date.parse(value);
      return Number.isFinite(evaluatedAt) ? [evaluatedAt + PREDICTIVE_OPERATIONS_STALE_AFTER_MS] : [];
    }).filter((value) => value > predictiveNow);

    const changeExpiresAt = predictiveOperations.items.flatMap((item) => [
      item.runwayChangeAdvisory?.changedAt,
      item.runwayChangeAdminPreview?.state === "available" ? item.runwayChangeAdminPreview.changedAt : null,
    ]).flatMap((value) => {
      if (!value) return [];
      const changedAt = Date.parse(value);
      return Number.isFinite(changedAt) ? [changedAt + RUNWAY_CHANGE_ADVISORY_EVENT_WINDOW_MS] : [];
    }).filter((value) => value > predictiveNow);

    const allExpiresAt = [...expiresAt, ...changeExpiresAt];
    const nextExpiry = allExpiresAt.length ? Math.min(...allExpiresAt) : null;
    if (nextExpiry === null) return;
    const timer = window.setTimeout(
      () => setPredictiveNow(Date.now()),
      Math.max(250, nextExpiry - Date.now() + 100),
    );
    return () => window.clearTimeout(timer);
  }, [open, predictiveNow, predictiveOperations]);

  useEffect(() => {
    if (!open) return;
    if (!relevantAirportKey) {
      setAirportOperations((current) => current.length ? [] : current);
      return;
    }
    let active = true;
    const controller = new AbortController();
    const icaos = relevantAirportKey.split(",").filter(Boolean);
    setAirportOperations((current) => current.filter((operation) => icaos.includes(operation.airport.icao)));

    const loadAirports = async () => {
      const results = await Promise.allSettled(
        icaos.map((icao) =>
          fetchJson<AirportOperationsResponse>(
            `/api/airports/${encodeURIComponent(icao)}/operations?period=24h`,
            controller.signal,
          ),
        ),
      );
      if (!active) return;
      setAirportOperations(
        results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []),
      );
    };

    void loadAirports();
    const timer = window.setInterval(() => void loadAirports(), AIRPORT_CONTEXT_REFRESH_INTERVAL_MS);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [open, relevantAirportKey]);


  useEffect(() => {
    if (!open) return;
    let active = true;
    const controller = new AbortController();
    setRegionalStatus((current) => current === "idle" ? "loading" : current);

    const loadRegionalSituation = async () => {
      try {
        const response = await fetchJson<RegionalOperationsResponse>("/api/operations/situation", controller.signal);
        if (!active) return;
        setRegionalSituation(response);
        setRegionalStatus("ready");
      } catch {
        if (!active || controller.signal.aborted) return;
        setRegionalStatus((current) => current === "ready" ? "partial" : "unavailable");
      }
    };

    void loadRegionalSituation();
    const timer = window.setInterval(() => void loadRegionalSituation(), REGIONAL_REFRESH_INTERVAL_MS);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [open]);

  const predictiveItems = useMemo(() => {
    if (!predictiveOperations) return [];
    return predictiveOperations.items.flatMap((item) => {
      const etaPublic = item.etaAdvisory
        && Date.parse(item.etaAdvisory.evaluatedAt) + PREDICTIVE_OPERATIONS_STALE_AFTER_MS >= predictiveNow
        ? item.etaAdvisory
        : null;
      const runwayPublic = item.runwayAdvisory
        && Date.parse(item.runwayAdvisory.evaluatedAt) + PREDICTIVE_OPERATIONS_STALE_AFTER_MS >= predictiveNow
        ? item.runwayAdvisory
        : null;
      const runwayChangePublic = item.runwayChangeAdvisory
        && Date.parse(item.runwayChangeAdvisory.evaluatedAt) + PREDICTIVE_OPERATIONS_STALE_AFTER_MS >= predictiveNow
        && Date.parse(item.runwayChangeAdvisory.changedAt) + RUNWAY_CHANGE_ADVISORY_EVENT_WINDOW_MS >= predictiveNow
        ? item.runwayChangeAdvisory
        : null;
      const trajectoryPublic = item.trajectoryAdvisory
        && Date.parse(item.trajectoryAdvisory.evaluatedAt) + PREDICTIVE_OPERATIONS_STALE_AFTER_MS >= predictiveNow
        ? item.trajectoryAdvisory
        : null;
      const etaPreview = item.etaAdminPreview;
      const runwayPreview = item.runwayAdminPreview;
      const runwayChangePreview = item.runwayChangeAdminPreview;
      const trajectoryPreview = item.trajectoryAdminPreview;
      if (!etaPublic && !runwayPublic && !runwayChangePublic && !trajectoryPublic && !etaPreview && !runwayPreview && !runwayChangePreview && !trajectoryPreview) return [];
      return [{
        ...item,
        etaAdvisory: etaPublic,
        runwayAdvisory: runwayPublic,
        runwayChangeAdvisory: runwayChangePublic,
        trajectoryAdvisory: trajectoryPublic,
      }];
    });
  }, [predictiveNow, predictiveOperations]);

  const attentionCount = attentionOperationsCount(timeline);
  const regionalNodes = useMemo(
    () => new Map(regionalSituation?.nodes.map((node) => [node.icaoHex, node]) ?? []),
    [regionalSituation],
  );
  const regionalGeneratedAt = regionalSituation ? Date.parse(regionalSituation.generatedAt) : Number.NaN;
  const regionalStale = regionalSituation !== null
    && (!Number.isFinite(regionalGeneratedAt) || regionalGeneratedAt + REGIONAL_STALE_AFTER_MS < now);
  const regionalAttentionCount = regionalSituation?.attention.attention ?? 0;
  const totalAttentionCount = attentionCount + regionalAttentionCount;
  const regionalItems = useMemo(
    () => (regionalSituation?.attention.items ?? []).filter((item) =>
      item.type !== "REGIONAL_COPRESENCE"
      || item.projectedOffsetMinutes === null
      || item.projectedOffsetMinutes <= regionalHorizon
    ),
    [regionalHorizon, regionalSituation],
  );
  const regionalGraduated = regionalSituation?.attentionGraduation.graduated === true;
  const evidenceTypes = t.intelligence.evidenceTypes as Record<string, string>;
  const loadingSupplementary = supplementaryStatus === "loading" || supplementaryStatus === "idle";

  useEffect(() => {
    if (!regionalMapFocusId) return;
    const activeItem = regionalSituation?.attention.items.find((item) => item.id === regionalMapFocusId);
    if (
      !open
      || !regionalGraduated
      || !activeItem
      || activeItem.type !== "REGIONAL_COPRESENCE"
      || activeItem.aircraft.length !== 2
    ) {
      setRegionalMapFocusId(null);
      dispatchRegionalMapFocus(null);
    }
  }, [open, regionalGraduated, regionalMapFocusId, regionalSituation]);

  const focusRegionalItem = (item: OperationalAttentionSummary["items"][number]) => {
    if (
      !regionalGraduated
      || item.type !== "REGIONAL_COPRESENCE"
      || item.aircraft.length !== 2
    ) return;
    const horizon = regionalAttentionHorizonForOffset(item.projectedOffsetMinutes);
    if (!horizon) return;
    setRegionalMapFocusId(item.id);
    dispatchRegionalMapFocus({
      graduated: true,
      itemId: item.id,
      aircraft: [item.aircraft[0]!, item.aircraft[1]!],
      horizonMinutes: horizon,
      projectedDistanceNm: item.projectedDistanceNm,
    });
  };

  const clearRegionalMapFocus = () => {
    setRegionalMapFocusId(null);
    dispatchRegionalMapFocus(null);
  };

  return (
    <>
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ""}`}
        aria-expanded={open}
        aria-controls="radar-operations-center"
        aria-label={open ? t.intelligence.operationsClose : t.intelligence.operationsOpen}
        data-testid="operations-center-trigger"
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.liveDot} aria-hidden="true" />
        <span>{t.intelligence.operationsNow}</span>
        <strong>{timeline.length}</strong>
      </button>

      {open ? (
        <Panel
          id="radar-operations-center"
          className={styles.panel}
          aria-labelledby="radar-operations-center-title"
          data-testid="operations-center-panel"
        >
          <header className={styles.header}>
            <div>
              <span className={styles.kicker}>{t.intelligence.operationsNow}</span>
              <h2 id="radar-operations-center-title">{t.intelligence.operationsCenter}</h2>
              <p>{t.intelligence.operationsRecent}</p>
            </div>
            <div className={styles.headerActions}>
              <StatusBadge variant={totalAttentionCount > 0 ? "warning" : "live"}>
                {totalAttentionCount > 0
                  ? t.intelligence.operationsAttention(totalAttentionCount)
                  : t.intelligence.operationsQuiet}
              </StatusBadge>
              <IconButton
                className={styles.close}
                onClick={() => setOpen(false)}
                aria-label={t.intelligence.operationsClose}
              >
                <UiIcon name="close" />
              </IconButton>
            </div>
          </header>

          <div className={styles.scrollArea}>
            {(regionalSituation || regionalStatus === "loading" || regionalStatus === "unavailable") ? (
              <section className={styles.regional} aria-labelledby="operations-regional-title" data-testid="regional-operations-center">
                <div className={styles.sectionHeading}>
                  <span id="operations-regional-title">{t.intelligence.operationsRegionalTitle}</span>
                  <small>
                    {regionalStale
                      ? t.intelligence.operationsRegionalStale
                      : t.intelligence.operationsRegionalHint}
                  </small>
                </div>
                {regionalSituation ? (
                  <div className={styles.regionalToolbar}>
                    <div
                      className={styles.regionalHorizons}
                      role="group"
                      aria-label={t.intelligence.operationsRegionalHorizon}
                    >
                      {([5, 15, 30] as const).map((horizon) => (
                        <button
                          type="button"
                          className={regionalHorizon === horizon ? styles.regionalHorizonActive : ""}
                          aria-pressed={regionalHorizon === horizon}
                          key={horizon}
                          onClick={() => setRegionalHorizon(horizon)}
                        >
                          {horizon} min
                        </button>
                      ))}
                    </div>
                    <StatusBadge
                      variant={regionalGraduated
                        ? "live"
                        : regionalSituation.attentionGraduation.decision === "FAIL"
                          ? "danger"
                          : "warning"}
                    >
                      {regionalGraduated
                        ? t.intelligence.operationsRegionalGraduated
                        : t.intelligence.operationsRegionalCalibration(
                          regionalSituation.attentionGraduation.decision,
                        )}
                    </StatusBadge>
                  </div>
                ) : null}
                {regionalStatus === "loading" && !regionalSituation ? (
                  <small className={styles.regionalUnavailable}>{t.common.loading}</small>
                ) : null}
                {regionalSituation?.focusQueue.items.length ? (
                  <div className={styles.focusQueue} data-testid="regional-focus-queue">
                    <div className={styles.focusQueueHeader}>
                      <strong>{t.intelligence.operationsFocusQueueTitle}</strong>
                      <small>{t.intelligence.operationsFocusQueueSummary(
                        regionalSituation.focusQueue.attention,
                        regionalSituation.focusQueue.watch,
                      )}</small>
                    </div>
                    <div className={styles.focusQueueList}>
                      {regionalSituation.focusQueue.items.slice(0, 8).map((item) => (
                        <Link
                          className={styles.focusQueueItem}
                          href={`/?operations=1&aircraft=${encodeURIComponent(item.icaoHex)}`}
                          key={item.icaoHex}
                        >
                          <span>
                            <strong>{item.label}</strong>
                            <small>{item.types.map((type) => t.intelligence.operationsFocusQueueTypes[type]).join(" · ")}</small>
                          </span>
                          <span>
                            <StatusBadge variant={item.level === "ATTENTION" ? "warning" : "neutral"}>
                              {item.level === "ATTENTION"
                                ? t.intelligence.operationsRegionalAttention
                                : t.intelligence.operationsRegionalWatch}
                            </StatusBadge>
                            <small>{item.earliestProjectedOffsetMinutes === null
                              ? t.intelligence.operationsFocusQueueCurrent
                              : t.intelligence.operationsFocusQueueEta(item.earliestProjectedOffsetMinutes)}</small>
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
                {regionalItems.length ? (
                  <div className={styles.regionalList}>
                    {regionalItems.map((item) => {
                      const labels = item.aircraft.map((hex) => regionalNodes.get(hex)?.label ?? hex);
                      const detail = item.type === "DESTINATION_CLUSTER"
                        ? t.intelligence.operationsRegionalDestinationCluster(labels.length, item.destination ?? t.common.emptyValue)
                        : t.intelligence.operationsRegionalCopresence(
                          item.projectedOffsetMinutes ?? 0,
                          item.projectedDistanceNm === null ? t.common.emptyValue : item.projectedDistanceNm.toFixed(1),
                        );
                      const canHighlight = regionalGraduated
                        && item.type === "REGIONAL_COPRESENCE"
                        && item.aircraft.length === 2
                        && regionalAttentionHorizonForOffset(item.projectedOffsetMinutes) !== null;
                      const focused = regionalMapFocusId === item.id;
                      return (
                        <article className={styles.regionalItem} key={item.id}>
                          <div className={styles.regionalItemHeader}>
                            <strong>{detail}</strong>
                            <StatusBadge variant={item.level === "ATTENTION" ? "warning" : "neutral"}>
                              {item.level === "ATTENTION"
                                ? t.intelligence.operationsRegionalAttention
                                : t.intelligence.operationsRegionalWatch}
                            </StatusBadge>
                          </div>
                          <div className={styles.regionalAircraft}>
                            {item.aircraft.map((hex) => (
                              <Link
                                href={`/?operations=1&aircraft=${encodeURIComponent(hex)}`}
                                key={hex}
                              >
                                {regionalNodes.get(hex)?.label ?? hex}
                              </Link>
                            ))}
                          </div>
                          {item.destination ? <small>{t.intelligence.operationsRegionalDestination(item.destination)}</small> : null}
                          <details className={styles.regionalEvidence}>
                            <summary>{t.intelligence.operationsRegionalEvidence}</summary>
                            <ul>
                              <li>{t.intelligence.operationsRegionalContextEvidence}</li>
                              {item.projectedDistanceNm !== null ? (
                                <li>{t.intelligence.operationsRegionalProjectedDistance(item.projectedDistanceNm.toFixed(1))}</li>
                              ) : null}
                              {item.projectedOffsetMinutes !== null ? (
                                <li>{t.intelligence.operationsRegionalProjectedTime(item.projectedOffsetMinutes)}</li>
                              ) : null}
                            </ul>
                          </details>
                          {item.type === "REGIONAL_COPRESENCE" ? (
                            <div className={styles.regionalActions}>
                              {canHighlight ? (
                                <button
                                  type="button"
                                  className={focused ? styles.regionalMapActive : ""}
                                  aria-pressed={focused}
                                  onClick={() => focused ? clearRegionalMapFocus() : focusRegionalItem(item)}
                                >
                                  {focused
                                    ? t.intelligence.operationsRegionalClearMap
                                    : t.intelligence.operationsRegionalHighlightMap}
                                </button>
                              ) : (
                                <small>{t.intelligence.operationsRegionalMapLocked}</small>
                              )}
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                ) : regionalSituation && regionalStatus !== "unavailable" ? (
                  <small className={styles.regionalUnavailable}>{t.intelligence.operationsRegionalNoHorizon(regionalHorizon)}</small>
                ) : null}
                {regionalStatus === "unavailable" || regionalStatus === "partial" ? (
                  <small className={styles.regionalUnavailable}>{t.intelligence.operationsRegionalUnavailable}</small>
                ) : null}
              </section>
            ) : null}

            {timeline.length > 0 ? (
              <div className={styles.events} role="feed" aria-label={t.intelligence.operationsRecent}>
                {timeline.map((item) => {
                  if (item.source === "intelligence" && item.intelligence) {
                    const event = item.intelligence;
                    const location = [
                      event.airportIcao,
                      event.runway ? `RWY ${event.runway}` : null,
                      event.sectorId,
                    ].filter(Boolean).join(" · ") || t.intelligence.noLocation;
                    const firstEvidence = event.evidence[0]
                      ? evidenceTypes[event.evidence[0]] ?? event.evidence[0]
                      : null;

                    return (
                      <Link
                        className={`${styles.event} ${styles[item.tone]}`}
                        href={`/aircraft/${event.icaoHex}`}
                        key={item.key}
                      >
                        <span className={styles.eventMarker} aria-hidden="true" />
                        <span className={styles.eventBody}>
                          <span className={styles.eventMeta}>
                            <time dateTime={event.occurredAt}>{formatTime(event.occurredAt)}</time>
                            <span>{t.intelligence.operationsSourceIntelligence} · {t.intelligence.confidence[event.confidenceLevel]}</span>
                          </span>
                          <strong>{t.intelligence.types[event.type as FlightEventType]}</strong>
                          <span className={styles.aircraft}>
                            {event.callsign || event.registration || event.icaoHex}
                            <small>{location}</small>
                          </span>
                          {firstEvidence ? <small className={styles.evidence}>{firstEvidence}</small> : null}
                        </span>
                      </Link>
                    );
                  }

                  const entry = item.alert;
                  if (!entry) return null;
                  const detail = alertDetail(entry);
                  return (
                    <Link
                      className={`${styles.event} ${styles[item.tone]}`}
                      href={`/aircraft/${encodeURIComponent(entry.aircraft.icaoHex)}`}
                      key={item.key}
                    >
                      <span className={styles.eventMarker} aria-hidden="true" />
                      <span className={styles.eventBody}>
                        <span className={styles.eventMeta}>
                          <time dateTime={entry.detectedAt}>{formatTime(entry.detectedAt)}</time>
                          <span>{t.intelligence.operationsSourceAlert}</span>
                        </span>
                        <strong>{alertTitle(entry)}</strong>
                        <span className={styles.aircraft}>
                          {entry.aircraft.callsign || entry.aircraft.registration || entry.aircraft.icaoHex}
                          <small>{alertContext(entry)}</small>
                        </span>
                        {detail ? <small className={styles.evidence}>{detail}</small> : null}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : highlights.length === 0 ? (
              <div className={styles.empty}>
                <strong>{loadingSupplementary ? t.common.loading : t.intelligence.operationsNoRecent}</strong>
                {!loadingSupplementary ? <span>{t.intelligence.emptyHint}</span> : null}
              </div>
            ) : null}

            {highlights.length > 0 ? (
              <section className={styles.highlights} aria-labelledby="operations-live-highlights">
                <div className={styles.sectionHeading}>
                  <span id="operations-live-highlights">{t.intelligence.operationsLiveHighlights}</span>
                  <small>{t.intelligence.operationsLiveHighlightsHint}</small>
                </div>
                <div className={styles.highlightList}>
                  {highlights.map((aircraft) => (
                    <Link
                      className={styles.highlight}
                      href={`/aircraft/${encodeURIComponent(aircraft.icaoHex)}`}
                      key={aircraft.icaoHex}
                    >
                      <span>
                        <strong>{aircraft.callsign || aircraft.registration || aircraft.icaoHex}</strong>
                        <small>{aircraft.aircraftType ?? aircraft.icaoHex}{aircraft.distanceKm !== null ? ` · ${formatDistance(aircraft.distanceKm)}` : ""}</small>
                      </span>
                      <span className={styles.reasonList}>
                        {aircraft.reasons.slice(0, 3).map((reason) => (
                          <small className={styles.reason} key={reason}>{highlightReasonLabel(reason)}</small>
                        ))}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}

            {predictiveHexKey && (predictiveItems.length > 0 || predictiveOperations?.adminReadiness || predictiveStatus === "loading" || predictiveStatus === "unavailable") ? (
              <section className={styles.predictive} aria-labelledby="operations-predictive-title" data-testid="predictive-operations-center">
                <div className={styles.sectionHeading}>
                  <span id="operations-predictive-title">{t.intelligence.operationsPredictiveTitle}</span>
                  <small>{t.intelligence.operationsPredictiveHint}</small>
                </div>
                {predictiveOperations?.adminReadiness ? (
                  <div className={styles.predictiveReadiness} data-testid="predictive-operations-readiness">
                    <span>{t.intelligence.operationsPredictiveReadiness}</span>
                    <StatusBadge variant={predictiveOperations.adminReadiness.ETA.decision === "PASS" ? "live" : predictiveOperations.adminReadiness.ETA.decision === "FAIL" ? "danger" : "warning"}>
                      ETA {predictiveOperations.adminReadiness.ETA.decision}
                    </StatusBadge>
                    <StatusBadge variant={predictiveOperations.adminReadiness.RUNWAY.decision === "PASS" ? "live" : predictiveOperations.adminReadiness.RUNWAY.decision === "FAIL" ? "danger" : "warning"}>
                      RWY {predictiveOperations.adminReadiness.RUNWAY.decision}
                    </StatusBadge>
                    <StatusBadge variant={predictiveOperations.adminReadiness.RUNWAY_CHANGE.decision === "PASS" ? "live" : predictiveOperations.adminReadiness.RUNWAY_CHANGE.decision === "FAIL" ? "danger" : "warning"}>
                      RWY Δ {predictiveOperations.adminReadiness.RUNWAY_CHANGE.decision}
                    </StatusBadge>
                    <StatusBadge variant={predictiveOperations.adminReadiness.TRAJECTORY.decision === "PASS" ? "live" : predictiveOperations.adminReadiness.TRAJECTORY.decision === "FAIL" ? "danger" : "warning"}>
                      TRJ {predictiveOperations.adminReadiness.TRAJECTORY.decision}
                    </StatusBadge>
                  </div>
                ) : null}
                {predictiveStatus === "loading" && !predictiveOperations ? <small className={styles.predictiveUnavailable}>{t.common.loading}</small> : null}
                <div className={styles.predictiveList}>
                  {predictiveItems.map((item) => {
                    const eta = item.etaAdvisory ?? item.etaAdminPreview ?? null;
                    const runway = item.runwayAdvisory ?? item.runwayAdminPreview ?? null;
                    const runwayChange = item.runwayChangeAdvisory ?? item.runwayChangeAdminPreview ?? null;
                    const trajectory = item.trajectoryAdvisory ?? item.trajectoryAdminPreview ?? null;
                    const etaPreviewOnly = !item.etaAdvisory && Boolean(item.etaAdminPreview);
                    const runwayPreviewOnly = !item.runwayAdvisory && Boolean(item.runwayAdminPreview);
                    const runwayChangePreviewOnly = !item.runwayChangeAdvisory && Boolean(item.runwayChangeAdminPreview);
                    const trajectoryPreviewOnly = !item.trajectoryAdvisory && Boolean(item.trajectoryAdminPreview);
                    const etaEvaluatedAt = eta?.evaluatedAt ? Date.parse(eta.evaluatedAt) : Number.NaN;
                    const runwayEvaluatedAt = runway?.evaluatedAt ? Date.parse(runway.evaluatedAt) : Number.NaN;
                    const etaStale = etaPreviewOnly && Number.isFinite(etaEvaluatedAt)
                      && etaEvaluatedAt + PREDICTIVE_OPERATIONS_STALE_AFTER_MS < predictiveNow;
                    const runwayStale = runwayPreviewOnly && Number.isFinite(runwayEvaluatedAt)
                      && runwayEvaluatedAt + PREDICTIVE_OPERATIONS_STALE_AFTER_MS < predictiveNow;
                    const runwayChangeEvaluatedAt = runwayChange?.evaluatedAt ? Date.parse(runwayChange.evaluatedAt) : Number.NaN;
                    const runwayChangeChangedAt = runwayChange?.changedAt ? Date.parse(runwayChange.changedAt) : Number.NaN;
                    const runwayChangeState = runwayChangePreviewOnly && (
                      (Number.isFinite(runwayChangeEvaluatedAt) && runwayChangeEvaluatedAt + PREDICTIVE_OPERATIONS_STALE_AFTER_MS < predictiveNow)
                        ? t.intelligence.stale
                        : (Number.isFinite(runwayChangeChangedAt) && runwayChangeChangedAt + RUNWAY_CHANGE_ADVISORY_EVENT_WINDOW_MS < predictiveNow)
                          ? t.aircraft.predictiveStateExpired
                          : null
                    );
                    const trajectoryEvaluatedAt = trajectory?.evaluatedAt ? Date.parse(trajectory.evaluatedAt) : Number.NaN;
                    const trajectoryStale = trajectoryPreviewOnly && Number.isFinite(trajectoryEvaluatedAt)
                      && trajectoryEvaluatedAt + PREDICTIVE_OPERATIONS_STALE_AFTER_MS < predictiveNow;
                    return (
                      <Link
                        className={styles.predictiveItem}
                        href={`/aircraft/${encodeURIComponent(item.icaoHex)}`}
                        key={item.icaoHex}
                      >
                        <span className={styles.predictiveIdentity}>
                          <strong>{item.label}</strong>
                          <small>{item.destination ? `${item.icaoHex} · → ${item.destination}` : item.icaoHex}</small>
                        </span>
                        <span className={styles.predictiveValues}>
                          {eta ? <span>
                            <small>{t.intelligence.operationsPredictiveEta}{etaPreviewOnly ? ` · ${t.intelligence.operationsPredictiveShadow}` : ""}</small>
                            <strong>{etaStale ? t.intelligence.stale : "estimatedArrivalAt" in eta && eta.estimatedArrivalAt ? formatTime(eta.estimatedArrivalAt) : t.common.emptyValue}</strong>
                          </span> : null}
                          {runway ? <span>
                            <small>{t.intelligence.operationsPredictiveRunway}{runwayPreviewOnly ? ` · ${t.intelligence.operationsPredictiveShadow}` : ""}</small>
                            <strong>{runwayStale ? t.intelligence.stale : runway.runway ?? t.common.emptyValue}</strong>
                          </span> : null}
                          {runwayChange ? <span>
                            <small>{t.intelligence.operationsPredictiveRunwayChange}{runwayChangePreviewOnly ? ` · ${t.intelligence.operationsPredictiveShadow}` : ""}</small>
                            <strong>{runwayChangeState ?? (runwayChange.changedFrom && runwayChange.runway ? `${runwayChange.changedFrom}→${runwayChange.runway}` : t.common.emptyValue)}</strong>
                          </span> : null}
                          {trajectory ? <span>
                            <small>{t.intelligence.operationsPredictiveTrajectory}{trajectoryPreviewOnly ? ` · ${t.intelligence.operationsPredictiveShadow}` : ""}</small>
                            <strong>{trajectoryStale ? t.intelligence.stale : t.intelligence.operationsPredictiveTrajectoryStates[trajectory.trajectoryState]}</strong>
                          </span> : null}
                        </span>
                      </Link>
                    );
                  })}
                </div>
                {predictiveStatus === "unavailable" ? <small className={styles.predictiveUnavailable}>{t.intelligence.operationsPredictiveUnavailable}</small> : null}
              </section>
            ) : null}

            {airportOperations.length > 0 ? (
              <section className={styles.airportContext} aria-labelledby="operations-airport-context">
                <div className={styles.sectionHeading}>
                  <span id="operations-airport-context">{t.intelligence.operationsAirportContext}</span>
                  <small>{t.intelligence.operationsAirportInferred}</small>
                </div>
                <div className={styles.airportList}>
                  {airportOperations.map((operation) => {
                    const details = [
                      operation.likelyRunway ? `${t.intelligence.operationsAirportRunway} ${operation.likelyRunway.designator}` : null,
                      operation.goArounds.length > 0 ? `${operation.goArounds.length}× ${t.intelligence.operationsAirportGoAround}` : null,
                      operation.holding.length > 0 ? `${operation.holding.length}× ${t.intelligence.operationsAirportHolding}` : null,
                    ].filter(Boolean).join(" · ");
                    return (
                      <Link
                        className={styles.airport}
                        href={`/airports/${encodeURIComponent(operation.airport.icao)}`}
                        key={operation.airport.icao}
                      >
                        <span>
                          <strong>{operation.airport.icao}</strong>
                          <small>{operation.airport.name}</small>
                        </span>
                        <span>
                          <strong>{t.intelligence.operationsAirportActivity[operation.activity]}</strong>
                          <small>{details || t.intelligence.operationsAirportNoSpecial}</small>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </div>

          <footer className={styles.footer}>
            <span title={supplementaryStatus === "partial" || supplementaryStatus === "unavailable" ? t.intelligence.operationsSupplementaryUnavailable : undefined}>
              {t.intelligence.operationsWindow(Math.round(OPERATIONS_CENTER_WINDOW_MS / 60_000))}
            </span>
            <span className={styles.footerLinks}>
              <Link href="/intelligence">{t.intelligence.operationsViewAll}</Link>
              <Link href="/alerts">{t.intelligence.operationsViewAlerts}</Link>
            </span>
          </footer>
        </Panel>
      ) : null}
    </>
  );
}
