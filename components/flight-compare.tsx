"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { HistoryFlightDetail, HistoryFlightSummary } from "@/lib/server/history";
import { formatNumber, t } from "@/lib/i18n";
import { EmptyState, PageHeader, Panel, SectionHeader, StatusBadge } from "@/components/ui-primitives";
import { buildFlightCompareInvestigation, investigationHref, parseFlightCompareInvestigation } from "@/lib/investigation-links";
import styles from "./flight-compare.module.css";

interface HistoryListResponse {
  flights: HistoryFlightSummary[];
}

interface CompareMetrics {
  durationMinutes: number | null;
  maxAltitude: number | null;
  maxSpeed: number | null;
  distanceNm: number | null;
  trackLabel: string;
  samples: number;
  events: number;
}

function parseFlightId(value: string | null): number | null {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

function flightLabel(flight: HistoryFlightSummary): string {
  const identity = flight.callsign || flight.registration || flight.icaoHex;
  const route = flight.origin && flight.destination ? `${flight.origin}→${flight.destination}` : "—";
  return `#${flight.id} · ${identity} · ${route}`;
}

function durationMinutes(detail: HistoryFlightDetail): number | null {
  const start = Date.parse(detail.flight.startTime);
  const end = Date.parse(detail.flight.endTime ?? detail.flight.lastSeenAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return (end - start) / 60_000;
}

function haversineKm(a: HistoryFlightDetail["positions"][number], b: HistoryFlightDetail["positions"][number]): number {
  const radius = 6371.0088;
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

function trackDistanceNm(detail: HistoryFlightDetail): number | null {
  if (detail.positions.length < 2) return null;
  let km = 0;
  for (let index = 1; index < detail.positions.length; index += 1) {
    km += haversineKm(detail.positions[index - 1]!, detail.positions[index]!);
  }
  return km / 1.852;
}

function trackLabel(detail: HistoryFlightDetail): string {
  const tracks = detail.positions.map((position) => position.track).filter((value): value is number => value !== null && Number.isFinite(value));
  if (!tracks.length) return t.common.emptyValue;
  const first = Math.round(tracks[0]!) % 360;
  const last = Math.round(tracks.at(-1)!) % 360;
  return `${String(first).padStart(3, "0")}° → ${String(last).padStart(3, "0")}°`;
}

function metrics(detail: HistoryFlightDetail): CompareMetrics {
  const speedValues = detail.positions.map((position) => position.groundSpeed).filter((value): value is number => value !== null && Number.isFinite(value));
  return {
    durationMinutes: durationMinutes(detail),
    maxAltitude: detail.flight.maxAltitude,
    maxSpeed: speedValues.length ? Math.max(...speedValues) : null,
    distanceNm: trackDistanceNm(detail),
    trackLabel: trackLabel(detail),
    samples: detail.positions.length,
    events: detail.events.length,
  };
}

function durationLabel(value: number | null): string {
  if (value === null) return t.common.emptyValue;
  const total = Math.max(0, Math.round(value));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return hours ? `${hours}h ${String(minutes).padStart(2, "0")}m` : `${minutes}m`;
}

function numberLabel(value: number | null, suffix: string, digits = 0): string {
  return value === null ? t.common.emptyValue : `${value.toLocaleString(t.locale, { maximumFractionDigits: digits })} ${suffix}`;
}

function deltaLabel(a: number | null, b: number | null, suffix: string, digits = 0): string {
  if (a === null || b === null) return t.common.emptyValue;
  const delta = b - a;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toLocaleString(t.locale, { maximumFractionDigits: digits })} ${suffix}`;
}

export function FlightCompare() {
  const cs = t.locale.startsWith("cs");
  const copy = cs ? {
    title: "Porovnání letů",
    subtitle: "Dva historické Flight záznamy vedle sebe, bez nové analytické vrstvy — metriky se počítají z existujících bounded detailů.",
    flightA: "Let A",
    flightB: "Let B",
    choose: "Vyberte let",
    recent: "Recent lety",
    recentDescription: "Výběr načítá až 100 posledních Flight instancí za 7 dní. Detail každého letu používá canonical history endpoint.",
    comparison: "Srovnání",
    metric: "Metrika",
    difference: "B − A",
    aircraft: "Letadlo",
    route: "Trasa",
    duration: "Délka",
    maxAltitude: "Max altitude",
    maxSpeed: "Max speed ve vzorku",
    distance: "Track distance",
    track: "Track start → end",
    samples: "Vrácené body",
    events: "Události",
    started: "Začátek",
    open: "Otevřít Flight Story",
    loading: "Načítám historické lety…",
    unavailable: "Historická data jsou dočasně nedostupná.",
    selectTwo: "Vyberte dva různé lety pro porovnání.",
    sampled: "SAMPLED",
    full: "FULL",
    distanceNote: "Track distance je odhad z vrácených plausible pozic; při sampling režimu může být nižší než skutečná dráha.",
  } : {
    title: "Flight Compare",
    subtitle: "Two historical Flight records side by side, with metrics derived from existing bounded details rather than a new analytics layer.",
    flightA: "Flight A",
    flightB: "Flight B",
    choose: "Choose flight",
    recent: "Recent flights",
    recentDescription: "The selector loads up to 100 recent Flight instances from 7 days. Each comparison detail uses the canonical history endpoint.",
    comparison: "Comparison",
    metric: "Metric",
    difference: "B − A",
    aircraft: "Aircraft",
    route: "Route",
    duration: "Duration",
    maxAltitude: "Max altitude",
    maxSpeed: "Max speed in sample",
    distance: "Track distance",
    track: "Track start → end",
    samples: "Returned points",
    events: "Events",
    started: "Started",
    open: "Open Flight Story",
    loading: "Loading historical flights…",
    unavailable: "Historical data is temporarily unavailable.",
    selectTwo: "Choose two different flights to compare.",
    sampled: "SAMPLED",
    full: "FULL",
    distanceNote: "Track distance is estimated from returned plausible positions; sampled histories may understate the actual flown path.",
  };

  const [recent, setRecent] = useState<HistoryFlightSummary[]>([]);
  const [flightAId, setFlightAId] = useState<number | null>(null);
  const [flightBId, setFlightBId] = useState<number | null>(null);
  const [detailA, setDetailA] = useState<HistoryFlightDetail | null>(null);
  const [detailB, setDetailB] = useState<HistoryFlightDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [investigationUrlReady, setInvestigationUrlReady] = useState(false);
  const restoringInvestigationUrl = useRef(true);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setFailed(false);
    void fetch("/api/history/flights?range=7d&limit=100", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("history unavailable");
        return response.json() as Promise<HistoryListResponse>;
      })
      .then((payload) => {
        if (!active) return;
        setRecent(payload.flights);
        const parsed = parseFlightCompareInvestigation(window.location.search);
        const requestedA = parsed.a;
        const requestedB = parsed.b;
        const ids = new Set(payload.flights.map((flight) => flight.id));
        const a = requestedA && ids.has(requestedA) ? requestedA : payload.flights[0]?.id ?? null;
        const b = requestedB && ids.has(requestedB) && requestedB !== a
          ? requestedB
          : payload.flights.find((flight) => flight.id !== a)?.id ?? null;
        setFlightAId(a);
        setFlightBId(b);
        restoringInvestigationUrl.current = true;
        setInvestigationUrlReady(true);
      })
      .catch((error) => {
        if (!active || (error as Error).name === "AbortError") return;
        setFailed(true);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!investigationUrlReady) return;
    const ids = new Set(recent.map((flight) => flight.id));
    const restore = () => {
      const parsed = parseFlightCompareInvestigation(window.location.search);
      if (!parsed.a || !parsed.b || !ids.has(parsed.a) || !ids.has(parsed.b) || parsed.a === parsed.b) return;
      restoringInvestigationUrl.current = true;
      setFlightAId(parsed.a);
      setFlightBId(parsed.b);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [investigationUrlReady, recent]);

  useEffect(() => {
    if (!investigationUrlReady || !flightAId || !flightBId || flightAId === flightBId) return;
    const query = buildFlightCompareInvestigation({ a: flightAId, b: flightBId });
    const href = investigationHref("/compare/flights", query);
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
  }, [flightAId, flightBId, investigationUrlReady]);

  useEffect(() => {
    if (!flightAId || !flightBId || flightAId === flightBId) {
      setDetailA(null);
      setDetailB(null);
      return;
    }
    const controller = new AbortController();
    let active = true;
    setLoadingDetails(true);
    setFailed(false);
    void Promise.all([
      fetch(`/api/history/flights/${flightAId}`, { cache: "no-store", signal: controller.signal }),
      fetch(`/api/history/flights/${flightBId}`, { cache: "no-store", signal: controller.signal }),
    ]).then(async ([a, b]) => {
      if (!a.ok || !b.ok) throw new Error("flight detail unavailable");
      return Promise.all([a.json() as Promise<HistoryFlightDetail>, b.json() as Promise<HistoryFlightDetail>]);
    }).then(([a, b]) => {
      if (!active) return;
      setDetailA(a);
      setDetailB(b);
    }).catch((error) => {
      if (!active || (error as Error).name === "AbortError") return;
      setFailed(true);
      setDetailA(null);
      setDetailB(null);
    }).finally(() => {
      if (active) setLoadingDetails(false);
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [flightAId, flightBId]);

  const metricsA = useMemo(() => detailA ? metrics(detailA) : null, [detailA]);
  const metricsB = useMemo(() => detailB ? metrics(detailB) : null, [detailB]);

  const rows = detailA && detailB && metricsA && metricsB ? [
    { label: copy.aircraft, a: `${detailA.flight.registration || detailA.flight.icaoHex} · ${detailA.flight.aircraftType || t.common.emptyValue}`, b: `${detailB.flight.registration || detailB.flight.icaoHex} · ${detailB.flight.aircraftType || t.common.emptyValue}`, delta: t.common.emptyValue },
    { label: copy.route, a: `${detailA.flight.origin || "—"} → ${detailA.flight.destination || "—"}`, b: `${detailB.flight.origin || "—"} → ${detailB.flight.destination || "—"}`, delta: t.common.emptyValue },
    { label: copy.duration, a: durationLabel(metricsA.durationMinutes), b: durationLabel(metricsB.durationMinutes), delta: deltaLabel(metricsA.durationMinutes, metricsB.durationMinutes, "min") },
    { label: copy.maxAltitude, a: numberLabel(metricsA.maxAltitude === null ? null : metricsA.maxAltitude / 100, "FL"), b: numberLabel(metricsB.maxAltitude === null ? null : metricsB.maxAltitude / 100, "FL"), delta: deltaLabel(metricsA.maxAltitude === null ? null : metricsA.maxAltitude / 100, metricsB.maxAltitude === null ? null : metricsB.maxAltitude / 100, "FL") },
    { label: copy.maxSpeed, a: numberLabel(metricsA.maxSpeed, "kt"), b: numberLabel(metricsB.maxSpeed, "kt"), delta: deltaLabel(metricsA.maxSpeed, metricsB.maxSpeed, "kt") },
    { label: copy.distance, a: numberLabel(metricsA.distanceNm, "NM", 1), b: numberLabel(metricsB.distanceNm, "NM", 1), delta: deltaLabel(metricsA.distanceNm, metricsB.distanceNm, "NM", 1) },
    { label: copy.track, a: metricsA.trackLabel, b: metricsB.trackLabel, delta: t.common.emptyValue },
    { label: copy.samples, a: formatNumber(metricsA.samples), b: formatNumber(metricsB.samples), delta: deltaLabel(metricsA.samples, metricsB.samples, "") },
    { label: copy.events, a: formatNumber(metricsA.events), b: formatNumber(metricsB.events), delta: deltaLabel(metricsA.events, metricsB.events, "") },
  ] : [];

  function selector(label: string, value: number | null, other: number | null, onChange: (id: number | null) => void) {
    return <label className={styles.selector}>
      <span>{label}</span>
      <select value={value ?? ""} onChange={(event) => onChange(parseFlightId(event.target.value))}>
        <option value="">{copy.choose}</option>
        {recent.map((flight) => <option key={flight.id} value={flight.id} disabled={flight.id === other}>{flightLabel(flight)}</option>)}
      </select>
    </label>;
  }

  return <main className={styles.page} data-testid="flight-compare-v1">
    <PageHeader
      kicker="AIRRADAR / HISTORY / COMPARE"
      title={copy.title}
      description={copy.subtitle}
      actions={<StatusBadge variant={failed ? "warning" : detailA && detailB ? "success" : "neutral"}>
        {failed ? copy.unavailable : loadingDetails ? copy.loading : detailA && detailB ? "2 FLIGHTS" : copy.choose}
      </StatusBadge>}
    />

    <Panel>
      <SectionHeader kicker="SELECT" title={copy.recent} description={copy.recentDescription} />
      <div className={styles.selectors}>
        {selector(copy.flightA, flightAId, flightBId, setFlightAId)}
        {selector(copy.flightB, flightBId, flightAId, setFlightBId)}
      </div>
    </Panel>

    {detailA && detailB && metricsA && metricsB ? <>
      <div className={styles.flightHeaders}>
        {[{ detail: detailA, label: copy.flightA }, { detail: detailB, label: copy.flightB }].map(({ detail, label }) => <Panel key={label}>
          <div className={styles.flightHeader}>
            <span>{label}</span>
            <strong>{detail.flight.callsign || detail.flight.registration || detail.flight.icaoHex}</strong>
            <b>{detail.flight.origin || "—"} → {detail.flight.destination || "—"}</b>
            <small>{new Intl.DateTimeFormat(t.locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(detail.flight.startTime))}</small>
            <div><StatusBadge variant={detail.truncated ? "warning" : "neutral"}>{detail.truncated ? copy.sampled : copy.full}</StatusBadge><Link href={`/flights/${detail.flight.id}`}>{copy.open} →</Link></div>
          </div>
        </Panel>)}
      </div>

      <Panel>
        <SectionHeader kicker="A / B" title={copy.comparison} description={copy.distanceNote} />
        <div className={styles.tableWrap}>
          <table className={styles.compareTable}>
            <thead><tr><th>{copy.metric}</th><th>{copy.flightA}</th><th>{copy.flightB}</th><th>{copy.difference}</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.label}><th>{row.label}</th><td>{row.a}</td><td>{row.b}</td><td>{row.delta}</td></tr>)}</tbody>
          </table>
        </div>
      </Panel>
    </> : <EmptyState title={failed ? copy.unavailable : recent.length < 2 ? copy.selectTwo : copy.loading} />}
  </main>;
}
