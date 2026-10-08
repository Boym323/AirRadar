"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatNumber, t } from "@/lib/i18n";
import { buildSectorDetailInvestigation, investigationHref, parseSectorDetailInvestigation } from "@/lib/investigation-links";
import {
  EmptyState,
  MetricCard,
  MetricStrip,
  PageHeader,
  Panel,
  SectionHeader,
  SegmentedControl,
  StatusBadge,
} from "@/components/ui-primitives";
import styles from "./atc-sector-detail.module.css";

type TrafficLevel = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
type HistoryHours = 1 | 6 | 24;

interface SectorTrafficContext {
  sectorId: string;
  name: string;
  at: string;
  vertical: { lower: string | null; upper: string | null };
  traffic: {
    aircraftCount: number;
    entering1m: number;
    entering5m: number;
    entering15m: number;
    leaving1m: number;
    leaving5m: number;
    leaving15m: number;
    climbing: number;
    descending: number;
    level: number;
    unknownAltitude: number;
    averageAltitude: number | null;
    medianAltitude: number | null;
    averageGroundSpeed: number | null;
  };
  trafficLevel: TrafficLevel;
  frequencies: Array<{
    channel: string;
    carrierHz: number | null;
    spacing: "KHZ_25" | "KHZ_8_33" | "UNKNOWN";
    role: "PRIMARY" | "RESERVE" | "OTHER";
  }>;
  source: { airspace: string; traffic: string };
}

interface SectorHistoryPoint {
  time: string;
  aircraftCount: number;
  entering: number;
  leaving: number;
  climbing: number;
  descending: number;
  level: number;
  averageAltitude: number | null;
  averageGroundSpeed: number | null;
}

interface SectorHistory {
  sectorId: string;
  from: string;
  to: string;
  bucket: "5m";
  points: SectorHistoryPoint[];
  peakAircraftCount: number;
  peakAircraftAt: string | null;
  averageAircraftCount: number;
  totalEntries: number;
  totalExits: number;
  busiestBucket: string | null;
  quietestBucket: string | null;
  averageGroundSpeed: number | null;
  averageAltitude: number | null;
  coverage: {
    complete: boolean;
    truncated: boolean;
    positionsProcessed: number;
  };
}

interface SectorTransition {
  fromSectorId: string;
  toSectorId: string;
  count: number;
}

interface SectorTransitionsResponse {
  at: string;
  windowMinutes: 15;
  transitions: SectorTransition[];
  totalTransitions: number;
}

const HISTORY_RANGES: HistoryHours[] = [1, 6, 24];
const MAX_HISTORY_POINTS = 48;
const MAX_TRANSITIONS = 16;

function formatUtc(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat(t.locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}

function trafficVariant(level: TrafficLevel): "neutral" | "success" | "warning" | "danger" {
  if (level === "VERY_HIGH") return "danger";
  if (level === "HIGH") return "warning";
  if (level === "MEDIUM") return "success";
  return "neutral";
}

function altitude(value: number | null): string {
  return value === null ? "—" : `${formatNumber(value)} ft`;
}

function speed(value: number | null): string {
  return value === null ? "—" : `${formatNumber(value)} kt`;
}

export function AtcSectorDetail({ sectorId }: { sectorId: string }) {
  const cs = t.locale.startsWith("cs");
  const copy = cs ? {
    title: "Detail ATC sektoru",
    subtitle: "Live receiver-observed traffic, publikovaný sektorový kontext, 15min přechody a bounded historický load.",
    back: "Zpět na Airspace",
    liveTraffic: "Aktuální provoz",
    entries: "Vstupy · 15m",
    exits: "Výstupy · 15m",
    avgAltitude: "Průměrná výška",
    avgSpeed: "Průměrná rychlost",
    movement: "Vertikální profil",
    movementDescription: "Aktuální receiver-observed letadla uvnitř publikovaného sektorového objemu.",
    climbing: "Stoupá",
    descending: "Klesá",
    level: "Level",
    unknown: "Neznámá výška",
    frequencies: "Frekvence",
    frequencyDescription: "Publikované kanály připojené k sektorovým metadatům.",
    history: "Historický load",
    historyDescription: "Bounded historie z existujícího sector history API v 5minutových bucketech.",
    average: "Průměr",
    peak: "Maximum",
    transitions: "Přechody sektoru",
    transitionsDescription: "Pozorované 15min přechody, ve kterých je sektor zdrojem nebo cílem.",
    from: "FROM",
    to: "TO",
    noTransitions: "V posledních 15 minutách nebyl pro sektor pozorován žádný přechod.",
    noHistory: "Pro toto období nejsou dostupné historické body.",
    unavailable: "Sektorový provoz je dočasně nedostupný nebo sektor neexistuje.",
    loading: "Načítám sektorová data…",
    source: "Zdroj",
    coverage: "History coverage",
    disclosure: "Traffic je receiver-observed analytický kontext nad publikovanou geometrií sektoru. Nejde o autoritativní ATC surveillance ani separation data. Historie používá existující bounded FlightPosition-backed API; tato stránka nepřidává nový scan ani persistence path.",
  } : {
    title: "ATC Sector Detail",
    subtitle: "Live receiver-observed traffic, published sector context, 15-minute transitions and bounded historical load.",
    back: "Back to Airspace",
    liveTraffic: "Current traffic",
    entries: "Entries · 15m",
    exits: "Exits · 15m",
    avgAltitude: "Average altitude",
    avgSpeed: "Average speed",
    movement: "Vertical profile",
    movementDescription: "Current receiver-observed aircraft inside the published sector volume.",
    climbing: "Climbing",
    descending: "Descending",
    level: "Level",
    unknown: "Unknown altitude",
    frequencies: "Frequencies",
    frequencyDescription: "Published channels attached to the sector metadata.",
    history: "Historical load",
    historyDescription: "Bounded history from the existing sector history API in 5-minute buckets.",
    average: "Average",
    peak: "Peak",
    transitions: "Sector transitions",
    transitionsDescription: "Observed 15-minute transitions where this sector is the source or destination.",
    from: "FROM",
    to: "TO",
    noTransitions: "No transition involving this sector was observed in the last 15 minutes.",
    noHistory: "No historical points are available for this period.",
    unavailable: "Sector traffic is temporarily unavailable or the sector does not exist.",
    loading: "Loading sector data…",
    source: "Source",
    coverage: "History coverage",
    disclosure: "Traffic is receiver-observed analytical context over published sector geometry. It is not authoritative ATC surveillance or separation data. History reuses the existing bounded FlightPosition-backed API; this page adds no new scan or persistence path.",
  };

  const [historyHours, setHistoryHours] = useState<HistoryHours>(6);

  useEffect(() => {
    const restore = () => {
      const state = parseSectorDetailInvestigation(window.location.search);
      setHistoryHours(state.historyHours);
      const pathname = `/airspace/sectors/${encodeURIComponent(sectorId)}`;
      const canonical = investigationHref(pathname, buildSectorDetailInvestigation(state));
      if (window.location.pathname + window.location.search !== canonical) {
        window.history.replaceState(null, "", canonical);
      }
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [sectorId]);

  function selectHistoryHours(hours: HistoryHours): void {
    setHistoryHours(hours);
    const pathname = `/airspace/sectors/${encodeURIComponent(sectorId)}`;
    const query = buildSectorDetailInvestigation({ historyHours: hours });
    window.history.pushState(null, "", investigationHref(pathname, query));
  }
  const [traffic, setTraffic] = useState<SectorTrafficContext | null>(null);
  const [history, setHistory] = useState<SectorHistory | null>(null);
  const [transitions, setTransitions] = useState<SectorTransitionsResponse | null>(null);
  const [trafficFailed, setTrafficFailed] = useState(false);
  const [historyFailed, setHistoryFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setTrafficFailed(false);
    void Promise.allSettled([
      fetch(`/api/atc/sectors/${encodeURIComponent(sectorId)}/traffic`, {
        cache: "no-store",
        signal: controller.signal,
      }).then(async (response) => {
        if (!response.ok) throw new Error("sector traffic unavailable");
        return response.json() as Promise<SectorTrafficContext>;
      }),
      fetch("/api/atc/sectors/transitions?window=15m", {
        cache: "no-store",
        signal: controller.signal,
      }).then(async (response) => {
        if (!response.ok) throw new Error("sector transitions unavailable");
        return response.json() as Promise<SectorTransitionsResponse>;
      }),
    ]).then(([trafficResult, transitionResult]) => {
      if (controller.signal.aborted) return;
      if (trafficResult.status === "fulfilled") setTraffic(trafficResult.value);
      else setTrafficFailed(true);
      if (transitionResult.status === "fulfilled") setTransitions(transitionResult.value);
      else setTransitions(null);
    });
    return () => controller.abort();
  }, [sectorId]);

  useEffect(() => {
    const controller = new AbortController();
    const to = new Date();
    const from = new Date(to.getTime() - historyHours * 60 * 60_000);
    setHistory(null);
    setHistoryFailed(false);
    void fetch(
      `/api/atc/sectors/${encodeURIComponent(sectorId)}/history?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}&bucket=5m`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("sector history unavailable");
        return response.json() as Promise<SectorHistory>;
      })
      .then((payload) => { if (!controller.signal.aborted) setHistory(payload); })
      .catch((error) => {
        if (!controller.signal.aborted && (error as Error).name !== "AbortError") setHistoryFailed(true);
      });
    return () => controller.abort();
  }, [historyHours, sectorId]);

  const sectorTransitions = (transitions?.transitions ?? [])
    .filter((item) => item.fromSectorId === sectorId || item.toSectorId === sectorId)
    .slice(0, MAX_TRANSITIONS);
  const historyPoints = (history?.points ?? []).slice(-MAX_HISTORY_POINTS);

  return (
    <main className={styles.page} data-testid="atc-sector-detail-v1">
      <PageHeader
        kicker={t.uiExtras.sectorHeading}
        title={traffic ? `${traffic.sectorId} · ${traffic.name}` : `${copy.title} · ${sectorId}`}
        description={copy.subtitle}
        backLink={<Link className="back-link" href="/airspace">{copy.back}</Link>}
        actions={traffic ? <StatusBadge variant={trafficVariant(traffic.trafficLevel)}>{traffic.trafficLevel}</StatusBadge> : undefined}
      />

      <MetricStrip className={styles.metrics}>
        <MetricCard value={traffic ? formatNumber(traffic.traffic.aircraftCount) : "—"} label={copy.liveTraffic} detail={traffic ? `${traffic.vertical.lower ?? "—"}–${traffic.vertical.upper ?? "—"}` : undefined} />
        <MetricCard value={traffic ? formatNumber(traffic.traffic.entering15m) : "—"} label={copy.entries} />
        <MetricCard value={traffic ? formatNumber(traffic.traffic.leaving15m) : "—"} label={copy.exits} />
        <MetricCard value={traffic ? altitude(traffic.traffic.averageAltitude) : "—"} label={copy.avgAltitude} />
        <MetricCard value={traffic ? speed(traffic.traffic.averageGroundSpeed) : "—"} label={copy.avgSpeed} />
      </MetricStrip>

      {trafficFailed ? <EmptyState title={copy.unavailable} /> : !traffic ? <p className={styles.status}>{copy.loading}</p> : (
        <div className={styles.grid}>
          <Panel>
            <SectionHeader kicker="NOW" title={copy.movement} description={copy.movementDescription} />
            <div className={styles.movementGrid}>
              <div><strong>{formatNumber(traffic.traffic.climbing)}</strong><span>{copy.climbing}</span></div>
              <div><strong>{formatNumber(traffic.traffic.descending)}</strong><span>{copy.descending}</span></div>
              <div><strong>{formatNumber(traffic.traffic.level)}</strong><span>{copy.level}</span></div>
              <div><strong>{formatNumber(traffic.traffic.unknownAltitude)}</strong><span>{copy.unknown}</span></div>
            </div>
            <p className={styles.source}>{copy.source}: {traffic.source.airspace} · {traffic.source.traffic} · {formatUtc(traffic.at)}</p>
          </Panel>

          <Panel>
            <SectionHeader kicker={t.uiExtras.comms} title={copy.frequencies} description={copy.frequencyDescription} />
            {traffic.frequencies.length ? <div className={styles.frequencyList}>
              {traffic.frequencies.map((frequency) => (
                <div key={`${frequency.channel}:${frequency.role}`}>
                  <strong>{frequency.channel}</strong>
                  <span>{frequency.role}</span>
                  <small>{frequency.spacing.replace("KHZ_", "").replace("_", ".")} kHz</small>
                </div>
              ))}
            </div> : <EmptyState title={t.uiExtras.noFrequencies} />}
          </Panel>

          <Panel className={styles.full}>
            <SectionHeader
              kicker={t.uiExtras.history}
              title={copy.history}
              description={copy.historyDescription}
              actions={<SegmentedControl role="tablist" aria-label={copy.history}>
                {HISTORY_RANGES.map((hours) => (
                  <button key={hours} type="button" role="tab" aria-selected={historyHours === hours} className={historyHours === hours ? "active" : ""} onClick={() => selectHistoryHours(hours)}>
                    {hours}h
                  </button>
                ))}
              </SegmentedControl>}
            />
            {historyFailed ? <EmptyState title={copy.noHistory} /> : !history ? <p className={styles.status}>{copy.loading}</p> : historyPoints.length ? (
              <>
                <div className={styles.historySummary}>
                  <span>{copy.average}: <strong>{formatNumber(history.averageAircraftCount, 1)}</strong></span>
                  <span>{copy.peak}: <strong>{formatNumber(history.peakAircraftCount)}</strong>{history.peakAircraftAt ? ` · ${formatUtc(history.peakAircraftAt)}` : ""}</span>
                  <span>{copy.entries}: <strong>{formatNumber(history.totalEntries)}</strong></span>
                  <span>{copy.exits}: <strong>{formatNumber(history.totalExits)}</strong></span>
                </div>
                <div className={styles.historyTable}>
                  <div className={styles.historyHeader}><span>UTC</span><span>ACFT</span><span>IN</span><span>OUT</span><span>ALT</span><span>GS</span></div>
                  {historyPoints.map((point) => (
                    <div className={styles.historyRow} key={point.time}>
                      <span>{formatUtc(point.time)}</span>
                      <strong>{formatNumber(point.aircraftCount, 1)}</strong>
                      <span>{formatNumber(point.entering)}</span>
                      <span>{formatNumber(point.leaving)}</span>
                      <span>{altitude(point.averageAltitude)}</span>
                      <span>{speed(point.averageGroundSpeed)}</span>
                    </div>
                  ))}
                </div>
                <p className={styles.source}>{copy.coverage}: {history.coverage.complete ? "COMPLETE" : "PARTIAL"} · {formatNumber(history.coverage.positionsProcessed)} positions{history.coverage.truncated ? " · TRUNCATED" : ""}</p>
              </>
            ) : <EmptyState title={copy.noHistory} />}
          </Panel>

          <Panel className={styles.full}>
            <SectionHeader kicker="15 MIN FLOW" title={copy.transitions} description={copy.transitionsDescription} />
            {sectorTransitions.length ? <div className={styles.transitionList}>
              {sectorTransitions.map((transition) => (
                <div key={`${transition.fromSectorId}:${transition.toSectorId}`}>
                  <span><small>{copy.from}</small><strong>{transition.fromSectorId}</strong></span>
                  <b>→</b>
                  <span><small>{copy.to}</small><strong>{transition.toSectorId}</strong></span>
                  <em>{formatNumber(transition.count)}</em>
                </div>
              ))}
            </div> : <EmptyState title={copy.noTransitions} />}
          </Panel>
        </div>
      )}

      <p className={styles.disclosure}>{copy.disclosure}</p>
    </main>
  );
}
