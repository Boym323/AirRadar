"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState, MetricCard, MetricStrip, PageHeader, Panel, SectionHeader, StatusBadge } from "@/components/ui-primitives";
import { useAircraftStream } from "@/components/use-aircraft-stream";
import type { LogbookLabel, LogbookSummaryResponse, PublicStateSnapshot, TrailPoint } from "@/lib/aircraft/types";
import { formatAltitude, formatDateTime, formatDistance, formatNumber, formatTrack, t } from "@/lib/i18n";
import { filterSpotterAircraft, type SpotterDiscoveryFilter } from "@/lib/spotter";
import styles from "./mobile-spotter-mode.module.css";

export function MobileSpotterMode() {
  const cs = t.locale.startsWith("cs");
  const copy = cs ? {
    title: "Spotter mód",
    subtitle: "Mobilní živý přehled letadel skutečně pozorovaných LOCAL přijímačem.",
    liveNearby: "Živě v dosahu",
    newToday: "Nová dnes",
    rareToday: "Vzácná dnes",
    receptionRecord: "Dnešní rekord",
    aircraft: "Letadla v dosahu",
    aircraftDescription: "Pouze LOCAL receiver evidence, řazeno od nejbližšího letadla.",
    distance: "Max. vzdálenost",
    altitude: "Max. výška",
    type: "Typ letadla",
    discovery: "Discovery",
    all: "Vše",
    live: "LIVE · LOCAL",
    stale: "STALE · LOCAL",
    unavailable: "LOCAL feed nedostupný",
    loading: "Připojování k LOCAL feedu…",
    noAircraft: "Pro zvolené filtry není v LOCAL dosahu žádné letadlo.",
    detail: "Detail",
    radar: "Radar",
    watch: "Watchlist",
    bearing: "Směr",
    track: "Trať",
    updated: "Aktualizováno",
  } : {
    title: "Spotter Mode",
    subtitle: "Mobile live view of aircraft actually observed by the LOCAL receiver.",
    liveNearby: "Live nearby",
    newToday: "New today",
    rareToday: "Rare today",
    receptionRecord: "Today's record",
    aircraft: "Aircraft in range",
    aircraftDescription: "LOCAL receiver evidence only, sorted by nearest aircraft first.",
    distance: "Max distance",
    altitude: "Max altitude",
    type: "Aircraft type",
    discovery: "Discovery",
    all: "All",
    live: "LIVE · LOCAL",
    stale: "STALE · LOCAL",
    unavailable: "LOCAL feed unavailable",
    loading: "Connecting to LOCAL feed…",
    noAircraft: "No aircraft in LOCAL range match the selected filters.",
    detail: "Detail",
    radar: "Radar",
    watch: "Watchlist",
    bearing: "Bearing",
    track: "Track",
    updated: "Updated",
  };

  const liveTrailsRef = useRef<Map<string, TrailPoint[]>>(new Map());
  const selectedHexRef = useRef<string | null>(null);
  const [snapshot, setSnapshot] = useState<PublicStateSnapshot | null>(null);
  const [discovery, setDiscovery] = useState<LogbookSummaryResponse | null>(null);
  const [discoveryFailed, setDiscoveryFailed] = useState(false);
  const [maxDistanceKm, setMaxDistanceKm] = useState<number | null>(null);
  const [maxAltitudeFt, setMaxAltitudeFt] = useState<number | null>(null);
  const [discoveryFilter, setDiscoveryFilter] = useState<SpotterDiscoveryFilter>("all");
  const [aircraftType, setAircraftType] = useState("");

  const onSnapshot = useCallback((next: PublicStateSnapshot) => setSnapshot(next), []);
  const onSelectedAircraftRemoved = useCallback(() => undefined, []);
  const { connected } = useAircraftStream({
    activeCoverage: "local",
    liveTrailsRef,
    selectedHexRef,
    onSelectedAircraftRemoved,
    onSnapshot,
  });

  useEffect(() => {
    let active = true;
    const load = () => {
      const controller = new AbortController();
      void fetch("/api/logbook/summary", { cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("spotter discovery unavailable");
          return await response.json() as LogbookSummaryResponse;
        })
        .then((next) => {
          if (!active) return;
          setDiscovery(next);
          setDiscoveryFailed(false);
        })
        .catch((error) => {
          if (active && (error as Error).name !== "AbortError") setDiscoveryFailed(true);
        });
      return controller;
    };
    let controller = load();
    const timer = window.setInterval(() => {
      controller.abort();
      controller = load();
    }, 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
      controller.abort();
    };
  }, []);

  const labelsByHex = useMemo(() => new Map<string, readonly LogbookLabel[]>(
    (discovery?.interestingAircraft ?? []).map((item) => [item.icaoHex, item.labels]),
  ), [discovery?.interestingAircraft]);

  const localAircraft = useMemo(
    () => filterSpotterAircraft(snapshot?.aircraft ?? [], {
      maxDistanceKm: null,
      maxAltitudeFt: null,
      discovery: "all",
      aircraftType: "",
    }),
    [snapshot?.aircraft],
  );

  const visibleAircraft = useMemo(
    () => filterSpotterAircraft(snapshot?.aircraft ?? [], {
      maxDistanceKm,
      maxAltitudeFt,
      discovery: discoveryFilter,
      aircraftType,
    }, labelsByHex),
    [aircraftType, discoveryFilter, labelsByHex, maxAltitudeFt, maxDistanceKm, snapshot?.aircraft],
  );

  const feedState = snapshot
    ? connected && snapshot.sourceOnline ? "live" : "stale"
    : connected ? "loading" : "unavailable";

  return <main className={styles.page} data-testid="mobile-spotter-mode-v1">
    <PageHeader
      kicker="AIRRADAR / SPOTTER"
      title={copy.title}
      description={copy.subtitle}
      actions={<div className={styles.headerStatus}>
        <StatusBadge variant={feedState === "live" ? "live" : feedState === "stale" ? "stale" : feedState === "unavailable" ? "danger" : "neutral"}>
          {feedState === "live" ? copy.live : feedState === "stale" ? copy.stale : feedState === "unavailable" ? copy.unavailable : copy.loading}
        </StatusBadge>
        {snapshot ? <small>{copy.updated} {formatDateTime(snapshot.fetchedAt, t)}</small> : null}
      </div>}
    />

    <MetricStrip className={styles.metrics}>
      <MetricCard value={snapshot ? formatNumber(localAircraft.length) : "—"} label={copy.liveNearby} />
      <MetricCard value={discovery ? formatNumber(discovery.newAircraftToday) : "—"} label={copy.newToday} />
      <MetricCard value={discovery ? formatNumber(discovery.rareAircraftToday) : "—"} label={copy.rareToday} />
      <MetricCard value={discovery?.todayReceptionRecord ? formatDistance(discovery.todayReceptionRecord.distanceKm) : "—"} label={copy.receptionRecord} />
    </MetricStrip>

    <Panel className={styles.filters}>
      <label>
        <span>{copy.distance}</span>
        <select value={maxDistanceKm ?? ""} onChange={(event) => setMaxDistanceKm(event.target.value ? Number(event.target.value) : null)}>
          <option value="">{copy.all}</option>
          <option value="25">25 km</option>
          <option value="50">50 km</option>
          <option value="100">100 km</option>
          <option value="200">200 km</option>
        </select>
      </label>
      <label>
        <span>{copy.altitude}</span>
        <select value={maxAltitudeFt ?? ""} onChange={(event) => setMaxAltitudeFt(event.target.value ? Number(event.target.value) : null)}>
          <option value="">{copy.all}</option>
          <option value="5000">5 000 ft</option>
          <option value="10000">10 000 ft</option>
          <option value="30000">30 000 ft</option>
        </select>
      </label>
      <label>
        <span>{copy.discovery}</span>
        <select value={discoveryFilter} onChange={(event) => setDiscoveryFilter(event.target.value as SpotterDiscoveryFilter)}>
          <option value="all">{copy.all}</option>
          <option value="new">NEW</option>
          <option value="rare">RARE</option>
        </select>
      </label>
      <label>
        <span>{copy.type}</span>
        <input value={aircraftType} maxLength={32} onChange={(event) => setAircraftType(event.target.value)} placeholder="A320 / B738" />
      </label>
    </Panel>

    <Panel>
      <SectionHeader kicker="LOCAL RECEIVER" title={copy.aircraft} description={copy.aircraftDescription} />
      {feedState === "unavailable" && !snapshot ? <EmptyState title={copy.unavailable} />
        : !snapshot ? <p className={styles.loading}>{copy.loading}</p>
        : visibleAircraft.length ? <div className={styles.list}>
          {visibleAircraft.map((aircraft) => {
            const labels = labelsByHex.get(aircraft.icaoHex) ?? [];
            const identity = aircraft.callsign ?? aircraft.registration ?? aircraft.icaoHex;
            return <article className={styles.card} key={aircraft.icaoHex}>
              <div className={styles.cardHead}>
                <div>
                  <strong>{identity}</strong>
                  <span>{aircraft.registration ?? aircraft.icaoHex}{aircraft.aircraftType ? ` · ${aircraft.aircraftType}` : ""}</span>
                </div>
                <div className={styles.badges}>
                  <StatusBadge variant={feedState === "live" ? "live" : "stale"}>LOCAL</StatusBadge>
                  {labels.includes("new") ? <span>NEW</span> : null}
                  {labels.includes("rare") ? <span>RARE</span> : null}
                  {labels.includes("returning") ? <span>RETURNING</span> : null}
                </div>
              </div>
              <dl>
                <div><dt>{copy.distance}</dt><dd>{formatDistance(aircraft.distanceKm)}</dd></div>
                <div><dt>{copy.altitude}</dt><dd>{formatAltitude(aircraft.altitude)}</dd></div>
                <div><dt>{copy.bearing}</dt><dd>{formatTrack(aircraft.bearing)}</dd></div>
                <div><dt>{copy.track}</dt><dd>{formatTrack(aircraft.track)}</dd></div>
              </dl>
              <div className={styles.actions}>
                <Link href={`/aircraft/${encodeURIComponent(aircraft.icaoHex)}` as Route}>{copy.detail}</Link>
                <Link href={`/?aircraft=${encodeURIComponent(aircraft.icaoHex)}` as Route}>{copy.radar}</Link>
                <Link href={{
                  pathname: "/watchlist",
                  query: {
                    icaoHex: aircraft.icaoHex,
                    ...(aircraft.registration ? { registration: aircraft.registration } : {}),
                  },
                }}>{copy.watch}</Link>
              </div>
            </article>;
          })}
        </div> : <EmptyState title={copy.noAircraft} />}
      {discoveryFailed ? <p className={styles.discoveryWarning}>{cs ? "Discovery badge mohou být dočasně neúplné." : "Discovery badges may be temporarily incomplete."}</p> : null}
    </Panel>
  </main>;
}
