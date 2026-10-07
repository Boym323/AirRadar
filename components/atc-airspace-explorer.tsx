"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AirspaceActivityResponse, PlannedAirspaceWindow } from "@/lib/airspace-activity/types";
import { formatNumber, t } from "@/lib/i18n";
import { EmptyState, MetricCard, MetricStrip, PageHeader, Panel, SectionHeader, StatusBadge } from "@/components/ui-primitives";
import { buildAirspaceInvestigation, investigationHref, parseAirspaceInvestigation } from "@/lib/investigation-links";
import styles from "./atc-airspace-explorer.module.css";

type TrafficLevel = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";

interface SectorTraffic {
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
    averageAltitude: number | null;
    averageGroundSpeed: number | null;
  };
  trafficLevel: TrafficLevel;
  frequencies: Array<{ channel: string; role: string }>;
}

interface SectorTrafficResponse {
  at: string;
  sectors: SectorTraffic[];
}

interface SectorTransition {
  fromSectorId: string;
  toSectorId: string;
  count: number;
}

interface SectorTransitionsResponse {
  at: string;
  windowMinutes: 1 | 5 | 15;
  transitions: SectorTransition[];
  totalTransitions: number;
}

interface SectorHistoryResponse {
  sectorId: string;
  from: string;
  to: string;
  bucket: string;
  points: Array<{ time: string; aircraftCount: number; entering: number; leaving: number }>;
  peakAircraftCount: number;
  peakAircraftAt: string | null;
  averageAircraftCount: number;
  totalEntries: number;
  totalExits: number;
}

function trafficVariant(level: TrafficLevel): "neutral" | "success" | "warning" | "danger" {
  if (level === "VERY_HIGH") return "danger";
  if (level === "HIGH") return "warning";
  if (level === "MEDIUM") return "success";
  return "neutral";
}

function compactSector(id: string): string {
  return id.startsWith("LKAA") ? id.slice(4) || id : id;
}

function formatTime(value: string | null): string {
  if (!value) return t.common.emptyValue;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? new Intl.DateTimeFormat(t.locale, { hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" }).format(parsed)
    : t.common.emptyValue;
}

function windowLabel(window: PlannedAirspaceWindow): string {
  return `${window.lowerLimit}–${window.upperLimit} · ${formatTime(window.startsAt)}–${formatTime(window.endsAt)}`;
}

export function AtcAirspaceExplorer() {
  const cs = t.locale.startsWith("cs");
  const copy = cs ? {
    title: "ATC & Airspace",
    subtitle: "Aktuální zatížení sektorů, přechody mezi sektory a publikovaný AUP/UUP plán v jednom provozním pohledu.",
    aircraftNow: "Letadla v sektorech",
    busySectors: "Vytížené sektory",
    transitions: "Přechody",
    plannedNow: "Plánováno nyní",
    sectors: "Sektory nyní",
    sectorsDescription: "Live kontext vychází z pozic AirRadar a publikovaných sektorových geometrií.",
    flows: "Přechody sektorů",
    flowsDescription: "Unikátní přechody pozorované v zadaném klouzavém okně.",
    airspace: "AUP / UUP airspace",
    airspaceDescription: "Plánované alokace nejsou potvrzenou real-time aktivací.",
    history: "Historie sektoru",
    historyDescription: "Posledních 60 minut v 5minutových bucketách z existujícího sector history API.",
    noTraffic: "Sektorová traffic data nejsou dostupná.",
    noFlows: "V tomto okně nebyly pozorovány žádné přechody.",
    noAirspace: "Pro aktuální plán nejsou dostupná žádná airspace okna.",
    loading: "Načítám provozní data…",
    sourceError: "Část provozních dat je dočasně nedostupná.",
    active: "PLANNED NOW",
    upcoming: "UPCOMING",
    aircraft: "letadel",
    entries: "vstupy",
    exits: "výstupy",
    average: "průměr",
    peak: "maximum",
    frequencies: "Frekvence",
    updated: "Aktualizováno",
    historicalActual: "Oficiální actual záznamy (zpožděné)",
  } : {
    title: "ATC & Airspace",
    subtitle: "Current sector load, inter-sector transitions and published AUP/UUP allocation in one operational view.",
    aircraftNow: "Aircraft in sectors",
    busySectors: "Busy sectors",
    transitions: "Transitions",
    plannedNow: "Planned now",
    sectors: "Sectors now",
    sectorsDescription: "Live context uses AirRadar positions and published sector geometry.",
    flows: "Sector transitions",
    flowsDescription: "Unique transitions observed in the selected rolling window.",
    airspace: "AUP / UUP airspace",
    airspaceDescription: "Planned allocation is not confirmed real-time activation.",
    history: "Sector history",
    historyDescription: "Last 60 minutes in 5-minute buckets from the existing sector history API.",
    noTraffic: "Sector traffic data is unavailable.",
    noFlows: "No sector transitions were observed in this window.",
    noAirspace: "No airspace windows are available for the current plan.",
    loading: "Loading operational data…",
    sourceError: "Some operational data is temporarily unavailable.",
    active: "PLANNED NOW",
    upcoming: "UPCOMING",
    aircraft: "aircraft",
    entries: "entries",
    exits: "exits",
    average: "average",
    peak: "peak",
    frequencies: "Frequencies",
    updated: "Updated",
    historicalActual: "Official actual records (delayed)",
  };

  const [traffic, setTraffic] = useState<SectorTrafficResponse | null>(null);
  const [activity, setActivity] = useState<AirspaceActivityResponse | null>(null);
  const [transitions, setTransitions] = useState<SectorTransitionsResponse | null>(null);
  const [windowMinutes, setWindowMinutes] = useState<1 | 5 | 15>(5);
  const [selectedSectorId, setSelectedSectorId] = useState<string | null>(null);
  const [history, setHistory] = useState<SectorHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [failedSources, setFailedSources] = useState(0);
  const [investigationUrlReady, setInvestigationUrlReady] = useState(false);
  const restoringInvestigationUrl = useRef(true);

  useEffect(() => {
    const restore = () => {
      const parsed = parseAirspaceInvestigation(window.location.search);
      setSelectedSectorId(parsed.sector);
      setWindowMinutes(parsed.windowMinutes);
    };
    restore();
    setInvestigationUrlReady(true);
    const onPopState = () => {
      restoringInvestigationUrl.current = true;
      restore();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!investigationUrlReady) return;
    const query = buildAirspaceInvestigation({ sector: selectedSectorId, windowMinutes });
    const href = investigationHref("/airspace", query);
    const currentHref = window.location.pathname + window.location.search;
    if (currentHref === href) {
      restoringInvestigationUrl.current = false;
      return;
    }
    if (restoringInvestigationUrl.current) {
      window.history.replaceState(null, "", href);
      restoringInvestigationUrl.current = false;
    } else {
      window.history.pushState(null, "", href);
    }
  }, [investigationUrlReady, selectedSectorId, windowMinutes]);

  useEffect(() => {
    const controller = new AbortController();
    let activeRequest = true;
    void Promise.allSettled([
      fetch("/api/atc/sectors/traffic", { cache: "no-store", signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error("traffic unavailable");
        return response.json() as Promise<SectorTrafficResponse>;
      }),
      fetch("/api/airspace/activity", { cache: "no-store", signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error("airspace unavailable");
        return response.json() as Promise<AirspaceActivityResponse>;
      }),
    ]).then(([trafficResult, activityResult]) => {
      if (!activeRequest) return;
      let failures = 0;
      if (trafficResult.status === "fulfilled") {
        setTraffic(trafficResult.value);
        setSelectedSectorId((current) => current && trafficResult.value.sectors.some((sector) => sector.sectorId === current) ? current : trafficResult.value.sectors[0]?.sectorId ?? null);
      } else failures += 1;
      if (activityResult.status === "fulfilled") setActivity(activityResult.value);
      else failures += 1;
      setFailedSources(failures);
    });
    return () => {
      activeRequest = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let activeRequest = true;
    void fetch(`/api/atc/sectors/transitions?window=${windowMinutes}m`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("transitions unavailable");
        return response.json() as Promise<SectorTransitionsResponse>;
      })
      .then((payload) => { if (activeRequest) setTransitions(payload); })
      .catch((error) => {
        if (activeRequest && (error as Error).name !== "AbortError") setTransitions(null);
      });
    return () => {
      activeRequest = false;
      controller.abort();
    };
  }, [windowMinutes]);

  useEffect(() => {
    if (!selectedSectorId) {
      setHistory(null);
      return;
    }
    const controller = new AbortController();
    const to = new Date();
    const from = new Date(to.getTime() - 60 * 60_000);
    setHistoryLoading(true);
    void fetch(
      `/api/atc/sectors/${encodeURIComponent(selectedSectorId)}/history?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}&bucket=5m`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("history unavailable");
        return response.json() as Promise<SectorHistoryResponse>;
      })
      .then(setHistory)
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setHistory(null);
      })
      .finally(() => setHistoryLoading(false));
    return () => controller.abort();
  }, [selectedSectorId]);

  const sectors = useMemo(
    () => [...(traffic?.sectors ?? [])].sort((a, b) => b.traffic.aircraftCount - a.traffic.aircraftCount || a.sectorId.localeCompare(b.sectorId)),
    [traffic?.sectors],
  );
  const selected = sectors.find((sector) => sector.sectorId === selectedSectorId) ?? sectors[0] ?? null;
  const aircraftNow = sectors.reduce((sum, sector) => sum + sector.traffic.aircraftCount, 0);
  const busySectors = sectors.filter((sector) => sector.trafficLevel === "HIGH" || sector.trafficLevel === "VERY_HIGH").length;
  const currentWindows = (activity?.planned.windows ?? []).filter((window) => window.plannedNow);
  const upcomingWindows = (activity?.planned.windows ?? [])
    .filter((window) => !window.plannedNow && Date.parse(window.startsAt) > Date.now())
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    .slice(0, 8);
  const airspaceWindows = [...currentWindows, ...upcomingWindows].slice(0, 14);

  return <main className={styles.page} data-testid="atc-airspace-explorer-v1">
    <PageHeader
      kicker="AIRRADAR / AIRSPACE"
      title={copy.title}
      description={copy.subtitle}
      actions={<div className={styles.headerMeta}>
        <StatusBadge variant={failedSources ? "warning" : traffic && activity ? "success" : "neutral"}>
          {failedSources ? copy.sourceError : traffic && activity ? "LIVE + PUBLISHED" : copy.loading}
        </StatusBadge>
        {traffic?.at ? <small>{copy.updated} {formatTime(traffic.at)}</small> : null}
      </div>}
    />

    <MetricStrip>
      <MetricCard value={formatNumber(aircraftNow)} label={copy.aircraftNow} />
      <MetricCard value={formatNumber(busySectors)} label={copy.busySectors} />
      <MetricCard value={formatNumber(transitions?.totalTransitions ?? 0)} label={copy.transitions} detail={`${windowMinutes} min`} />
      <MetricCard value={formatNumber(currentWindows.length)} label={copy.plannedNow} detail={activity ? `${copy.historicalActual}: ${formatNumber(activity.historicalActual.records.length)}` : undefined} />
    </MetricStrip>

    <div className={styles.grid}>
      <Panel className={styles.sectorPanel}>
        <SectionHeader kicker="AIRSPACE NOW" title={copy.sectors} description={copy.sectorsDescription} />
        {!traffic ? <EmptyState title={failedSources ? copy.noTraffic : copy.loading} /> : sectors.length ? <div className={styles.sectorList}>
          {sectors.map((sector) => <button
            type="button"
            key={sector.sectorId}
            className={sector.sectorId === selected?.sectorId ? styles.selected : undefined}
            aria-pressed={sector.sectorId === selected?.sectorId}
            onClick={() => setSelectedSectorId(sector.sectorId)}
          >
            <span>
              <strong>{sector.sectorId}</strong>
              <small>{sector.vertical.lower ?? "—"}–{sector.vertical.upper ?? "—"}</small>
            </span>
            <span className={styles.sectorNumbers}>
              <b>{formatNumber(sector.traffic.aircraftCount)} {copy.aircraft}</b>
              <StatusBadge variant={trafficVariant(sector.trafficLevel)}>{sector.trafficLevel}</StatusBadge>
            </span>
          </button>)}
        </div> : <EmptyState title={copy.noTraffic} />}
      </Panel>

      <Panel>
        <SectionHeader
          kicker="FLOW"
          title={copy.flows}
          description={copy.flowsDescription}
          actions={<div className={styles.windowButtons} role="group" aria-label={copy.flows}>
            {([1, 5, 15] as const).map((value) => <button key={value} type="button" aria-pressed={windowMinutes === value} onClick={() => setWindowMinutes(value)}>{value}m</button>)}
          </div>}
        />
        {transitions?.transitions.length ? <div className={styles.flowList}>
          {transitions.transitions.slice(0, 12).map((flow) => <div key={`${flow.fromSectorId}-${flow.toSectorId}`}>
            <span><strong>{compactSector(flow.fromSectorId)}</strong><i>→</i><strong>{compactSector(flow.toSectorId)}</strong></span>
            <b>{formatNumber(flow.count)}</b>
          </div>)}
        </div> : <EmptyState title={copy.noFlows} />}
      </Panel>

      <Panel className={styles.airspacePanel}>
        <SectionHeader kicker="AUP / UUP" title={copy.airspace} description={copy.airspaceDescription} />
        <div className={styles.sourceRow}>
          <StatusBadge variant={activity?.planned.status === "ok" ? "success" : activity?.planned.status === "stale" ? "stale" : "warning"}>
            {activity?.planned.status?.toUpperCase() ?? "LOADING"}
          </StatusBadge>
          {activity?.planned.uupCount !== undefined ? <small>UUP × {activity.planned.uupCount}</small> : null}
        </div>
        {airspaceWindows.length ? <div className={styles.airspaceList}>
          {airspaceWindows.map((window) => <article key={`${window.canonicalDesignator}-${window.sequence}-${window.startsAt}`}>
            <div>
              <strong>{window.canonicalDesignator || window.designator}</strong>
              <StatusBadge variant={window.plannedNow ? "warning" : "neutral"}>{window.plannedNow ? copy.active : copy.upcoming}</StatusBadge>
            </div>
            <span>{windowLabel(window)}</span>
            <small>{window.source}{window.activity ? ` · ${window.activity}` : ""}{window.responsibleUnit ? ` · ${window.responsibleUnit}` : ""}</small>
          </article>)}
        </div> : <EmptyState title={activity ? copy.noAirspace : copy.loading} />}
        {activity?.disclaimer ? <p className={styles.disclaimer}>{activity.disclaimer}</p> : null}
      </Panel>

      <Panel>
        <SectionHeader kicker={selected?.sectorId ?? "SECTOR"} title={copy.history} description={copy.historyDescription} />
        {selected ? <div className={styles.history}>
          <div className={styles.selectedSector}>
            <div><strong>{selected.name}</strong><span>{selected.sectorId}</span></div>
            <StatusBadge variant={trafficVariant(selected.trafficLevel)}>{selected.trafficLevel}</StatusBadge>
          </div>
          <dl className={styles.historyMetrics}>
            <div><dt>{copy.aircraft}</dt><dd>{formatNumber(selected.traffic.aircraftCount)}</dd></div>
            <div><dt>{copy.entries} · 5m</dt><dd>{formatNumber(selected.traffic.entering5m)}</dd></div>
            <div><dt>{copy.exits} · 5m</dt><dd>{formatNumber(selected.traffic.leaving5m)}</dd></div>
            <div><dt>{copy.average}</dt><dd>{historyLoading ? "…" : history ? history.averageAircraftCount.toLocaleString(t.locale, { maximumFractionDigits: 1 }) : t.common.emptyValue}</dd></div>
            <div><dt>{copy.peak}</dt><dd>{historyLoading ? "…" : history ? formatNumber(history.peakAircraftCount) : t.common.emptyValue}</dd></div>
          </dl>
          {selected.frequencies.length ? <p className={styles.frequencies}><span>{copy.frequencies}</span>{selected.frequencies.map((frequency) => <b key={`${frequency.channel}-${frequency.role}`}>{frequency.channel}</b>)}</p> : null}
          {history?.points.length ? <div className={styles.historyBuckets} aria-label={copy.history}>
            {history.points.slice(-12).map((point) => <span key={point.time} title={`${formatTime(point.time)} · ${point.aircraftCount}`} style={{ "--load": Math.min(1, point.aircraftCount / Math.max(1, history.peakAircraftCount)) } as CSSProperties} />)}
          </div> : null}
        </div> : <EmptyState title={copy.noTraffic} />}
      </Panel>
    </div>
  </main>;
}
