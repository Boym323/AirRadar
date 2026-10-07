"use client";

import Link from "next/link";
import type { Route } from "next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFavoriteAirports } from "@/components/pwa-register";
import { useAircraftStream } from "@/components/use-aircraft-stream";
import { EmptyState, MetricCard, MetricStrip, PageHeader, Panel, SectionHeader, StatusBadge } from "@/components/ui-primitives";
import type { PublicStateSnapshot, TrailPoint } from "@/lib/aircraft/types";
import { formatDateTime, formatNumber, t } from "@/lib/i18n";
import { isSpotterInteresting, scoreSpotterInterest } from "@/lib/spotter-interest";
import { SPOTTER_LOGBOOK_STORAGE_KEY, parseSpotterLogbook, spotterLogbookStats, type SpotterLogbookState } from "@/lib/spotter-logbook";
import styles from "./my-airradar-home.module.css";

type WatchlistPayload = { rules?: Array<{ id: string; name: string; enabled: boolean; currentState?: { status?: string; aircraft?: unknown[] } }> };
type AlertItem = { id: string; detectedAt: string; type: string; aircraft: { icaoHex: string; callsign: string | null; registration: string | null } };
type SavedSpot = { id: string; name: string; radiusMeters: number; ruleEnabled: boolean };
type AirportOperations = {
  activity: "QUIET" | "LIGHT" | "MODERATE" | "BUSY";
  likelyRunway: { designator: string } | null;
  arrivals: Array<{ flightId: number }>;
  departures: Array<{ flightId: number }>;
  terminalDemandHorizon?: { items?: Array<{ label: string; etaMinutes: number | null }> };
};

function uniqueFlights(items: readonly { flightId: number }[]): number {
  return new Set(items.map((item) => item.flightId)).size;
}

function activityVariant(value: AirportOperations["activity"] | undefined): "neutral" | "success" | "live" | "warning" {
  if (value === "BUSY") return "warning";
  if (value === "MODERATE") return "live";
  if (value === "LIGHT") return "success";
  return "neutral";
}

export function MyAirRadarHome() {
  const copy = t.myAirRadar;
  const [favorites] = useFavoriteAirports();
  const [snapshot, setSnapshot] = useState<PublicStateSnapshot | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistPayload | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [savedSpots, setSavedSpots] = useState<SavedSpot[]>([]);
  const [savedSpotLocked, setSavedSpotLocked] = useState(false);
  const [airportOperations, setAirportOperations] = useState<AirportOperations | null>(null);
  const [airportFailed, setAirportFailed] = useState(false);
  const [logbook, setLogbook] = useState<SpotterLogbookState>({ version: 2, entries: [] });
  const liveTrailsRef = useRef<Map<string, TrailPoint[]>>(new Map());
  const selectedHexRef = useRef<string | null>(null);
  const favoriteAirport = favorites[0] ?? null;

  const onSnapshot = useCallback((next: PublicStateSnapshot) => setSnapshot(next), []);
  const onSelectedAircraftRemoved = useCallback(() => undefined, []);
  const stream = useAircraftStream({
    activeCoverage: "local",
    liveTrailsRef,
    selectedHexRef,
    onSelectedAircraftRemoved,
    onSnapshot,
  });

  useEffect(() => {
    try {
      setLogbook(parseSpotterLogbook(window.localStorage.getItem(SPOTTER_LOGBOOK_STORAGE_KEY)));
    } catch {
      setLogbook({ version: 2, entries: [] });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/watchlist", { cache: "no-store", signal: controller.signal })
      .then((r) => r.ok ? r.json() as Promise<WatchlistPayload> : null)
      .then((v) => { if (v && !controller.signal.aborted) setWatchlist(v); })
      .catch(() => undefined);
    void fetch("/api/alerts?page=0&pageSize=8", { cache: "no-store", signal: controller.signal })
      .then((r) => r.ok ? r.json() as Promise<{ items?: AlertItem[] }> : null)
      .then((v) => { if (v?.items && !controller.signal.aborted) setAlerts(v.items); })
      .catch(() => undefined);
    void fetch("/api/admin/spotter/saved-spots", { cache: "no-store", signal: controller.signal })
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) { setSavedSpotLocked(true); return null; }
        return r.ok ? r.json() as Promise<{ spots?: SavedSpot[] }> : null;
      })
      .then((v) => { if (v?.spots && !controller.signal.aborted) setSavedSpots(v.spots); })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!favoriteAirport) { setAirportOperations(null); setAirportFailed(false); return; }
    const controller = new AbortController();
    setAirportFailed(false);
    void fetch("/api/airports/" + encodeURIComponent(favoriteAirport) + "/operations?period=24h", { cache: "no-store", signal: controller.signal })
      .then(async (r) => { if (!r.ok) throw new Error("airport"); return r.json() as Promise<AirportOperations>; })
      .then((v) => { if (!controller.signal.aborted) setAirportOperations(v); })
      .catch((e) => { if ((e as Error).name !== "AbortError") { setAirportOperations(null); setAirportFailed(true); } });
    return () => controller.abort();
  }, [favoriteAirport]);

  const interesting = useMemo(() => (snapshot?.aircraft ?? [])
    .map((aircraft) => ({ aircraft, interest: scoreSpotterInterest(aircraft) }))
    .filter((item) => isSpotterInteresting(item.interest))
    .sort((a, b) => b.interest.score - a.interest.score)
    .slice(0, 4), [snapshot?.aircraft]);

  const activeWatchlist = useMemo(() => (watchlist?.rules ?? [])
    .filter((rule) => rule.enabled && rule.currentState?.status === "matching"), [watchlist?.rules]);
  const logbookStats = useMemo(() => spotterLogbookStats(logbook), [logbook]);
  const nextArrival = airportOperations?.terminalDemandHorizon?.items?.find((item) => item.etaMinutes !== null) ?? null;

  return <main className={styles.page} data-testid="my-airradar-home-v1">
    <PageHeader kicker="AIRRADAR / PERSONAL" title={copy.title} description={copy.subtitle}
      actions={<StatusBadge variant={stream.connected ? "live" : snapshot ? "stale" : "neutral"}>{stream.connected ? copy.live : snapshot ? copy.stale : copy.connecting}</StatusBadge>} />

    <MetricStrip>
      <MetricCard value={formatNumber(snapshot?.aircraft.length ?? 0)} label={copy.localAircraft} />
      <MetricCard value={formatNumber(interesting.length)} label={copy.interestingNow} />
      <MetricCard value={formatNumber(activeWatchlist.length)} label={copy.activeWatchlist} />
      <MetricCard value={formatNumber(alerts.length)} label={copy.recentAlerts} />
    </MetricStrip>

    <div className={styles.grid}>
      <Panel>
        <SectionHeader kicker="MY SKY" title={copy.mySky} description={copy.mySkyDescription}
          actions={<Link className={styles.openLink} href={"/spotter" as Route}>{copy.openSpotter} →</Link>} />
        {interesting.length ? <div className={styles.list}>
          {interesting.map(({ aircraft, interest }) => <Link key={aircraft.icaoHex} href={("/aircraft/" + encodeURIComponent(aircraft.icaoHex)) as Route}>
            <span><strong>{aircraft.callsign ?? aircraft.registration ?? aircraft.icaoHex}</strong><small>{aircraft.aircraftType ?? aircraft.aircraftDescription ?? aircraft.icaoHex}</small></span>
            <span><b>{interest.score}</b><small>{copy.interest}</small></span>
          </Link>)}
        </div> : <EmptyState title={snapshot ? copy.noInteresting : copy.connecting} description={copy.mySkyPrivacy} />}
        <p className={styles.note}>{copy.mySkyPrivacy}</p>
      </Panel>

      <Panel>
        <SectionHeader kicker="AIRPORT" title={favoriteAirport ? copy.favoriteAirportCode(favoriteAirport) : copy.favoriteAirport}
          description={favoriteAirport ? copy.favoriteAirportDescription : copy.noFavoriteAirport}
          actions={<Link className={styles.openLink} href={favoriteAirport ? ("/airports/" + encodeURIComponent(favoriteAirport)) as Route : "/airports" as Route}>{copy.openAirport} →</Link>} />
        {!favoriteAirport ? <EmptyState title={copy.noFavoriteAirport} description={copy.addFavoriteAirport} />
          : airportFailed ? <EmptyState title={copy.airportUnavailable} />
          : !airportOperations ? <p className={styles.loading}>{t.common.loading}</p>
          : <div className={styles.airportBlock}>
              <div className={styles.statusRow}><StatusBadge variant={activityVariant(airportOperations.activity)}>{airportOperations.activity}</StatusBadge><strong>{airportOperations.likelyRunway ? "RWY " + airportOperations.likelyRunway.designator : copy.runwayUnknown}</strong></div>
              <div className={styles.metrics}>
                <div><small>{copy.arrivals}</small><strong>{formatNumber(uniqueFlights(airportOperations.arrivals))}</strong></div>
                <div><small>{copy.departures}</small><strong>{formatNumber(uniqueFlights(airportOperations.departures))}</strong></div>
                <div><small>{copy.nextArrival}</small><strong>{nextArrival?.label ?? "—"}</strong>{nextArrival?.etaMinutes !== null && nextArrival?.etaMinutes !== undefined ? <span>~{formatNumber(nextArrival.etaMinutes, 0)} min</span> : null}</div>
              </div>
            </div>}
      </Panel>

      <Panel>
        <SectionHeader kicker="WATCHLIST" title={copy.watchlist} description={copy.watchlistDescription}
          actions={<Link className={styles.openLink} href={"/watchlist" as Route}>{copy.openWatchlist} →</Link>} />
        {activeWatchlist.length ? <div className={styles.rows}>{activeWatchlist.slice(0, 5).map((rule) => <article key={rule.id}><span><strong>{rule.name}</strong><small>{rule.currentState?.aircraft?.length ?? 0} {copy.matches}</small></span><StatusBadge variant="live">{copy.active}</StatusBadge></article>)}</div>
          : <EmptyState title={copy.noActiveWatchlist} description={copy.noActiveWatchlistDescription} />}
      </Panel>

      <Panel>
        <SectionHeader kicker="NOTIFICATIONS" title={copy.alerts} description={copy.alertsDescription}
          actions={<Link className={styles.openLink} href={"/notifications" as Route}>{copy.openNotifications} →</Link>} />
        {alerts.length ? <div className={styles.list}>{alerts.slice(0, 5).map((item) => <Link key={item.id} href={("/aircraft/" + encodeURIComponent(item.aircraft.icaoHex)) as Route}>
          <span><strong>{item.aircraft.callsign ?? item.aircraft.registration ?? item.aircraft.icaoHex}</strong><small>{item.type.replaceAll("_", " ")}</small></span>
          <time dateTime={item.detectedAt}>{formatDateTime(item.detectedAt)}</time>
        </Link>)}</div> : <EmptyState title={copy.noRecentAlerts} />}
      </Panel>

      <Panel>
        <SectionHeader kicker="SPOTTER" title={copy.savedSpots} description={copy.savedSpotsDescription}
          actions={<Link className={styles.openLink} href={"/spotter" as Route}>{copy.manageSavedSpots} →</Link>} />
        {savedSpotLocked ? <EmptyState title={copy.savedSpotsLocked} description={copy.savedSpotsLockedDescription} />
          : savedSpots.length ? <div className={styles.rows}>{savedSpots.slice(0, 5).map((spot) => <article key={spot.id}><span><strong>{spot.name}</strong><small>{formatNumber(spot.radiusMeters / 1000, 1)} km</small></span><StatusBadge variant={spot.ruleEnabled ? "success" : "neutral"}>{spot.ruleEnabled ? copy.active : copy.inactive}</StatusBadge></article>)}</div>
          : <EmptyState title={copy.noSavedSpots} description={copy.noSavedSpotsDescription} />}
      </Panel>

      <Panel>
        <SectionHeader kicker="LOGBOOK" title={copy.logbook} description={copy.logbookDescription}
          actions={<Link className={styles.openLink} href={"/spotter" as Route}>{copy.openLogbook} →</Link>} />
        <div className={styles.metrics}>
          <div><small>{copy.sightings}</small><strong>{formatNumber(logbookStats.sightings)}</strong></div>
          <div><small>{copy.uniqueAircraft}</small><strong>{formatNumber(logbookStats.uniqueAircraft)}</strong></div>
          <div><small>{copy.uniqueTypes}</small><strong>{formatNumber(logbookStats.uniqueTypes)}</strong></div>
        </div>
        {logbook.entries[0] ? <p className={styles.latest}>{copy.lastSeen}: <strong>{logbook.entries[0].callsign ?? logbook.entries[0].registration ?? logbook.entries[0].icaoHex}</strong><span>{formatDateTime(logbook.entries[0].observedAt)}</span></p>
          : <p className={styles.note}>{copy.logbookEmpty}</p>}
      </Panel>
    </div>
  </main>;
}
