"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, EmptyState, MetricCard, MetricStrip, PageHeader, Panel, SectionHeader, SegmentedControl, StatusBadge } from "@/components/ui-primitives";
import type { LogbookLabel, LogbookSummaryResponse, PublicStateSnapshot, TrailPoint } from "@/lib/aircraft/types";
import { formatAltitude, formatDateTime, formatDistance, formatNumber, formatTrack, t } from "@/lib/i18n";
import { filterSpotterAircraft, type SpotterDiscoveryFilter } from "@/lib/spotter";
import { observerFromGeolocation, observerGeometry, type SpotterObserverPosition } from "@/lib/spotter-location";
import styles from "./mobile-spotter-mode.module.css";

type SpotterDistanceOrigin = "receiver" | "observer";
type ObserverState = "idle" | "requesting" | "ready" | "denied" | "unavailable" | "error";

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
    aircraftDescription: "Pouze LOCAL receiver evidence. V režimu Moje poloha se vzdálenost a směr počítají pouze v tomto prohlížeči.",
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
    distanceOrigin: "Výchozí bod",
    receiver: "Přijímač",
    myLocation: "Moje poloha",
    locationPrivate: "Poloha zůstává pouze v tomto prohlížeči a neposílá se AirRadaru.",
    locationRequesting: "Zjišťuji polohu…",
    locationReady: "Poloha aktivní",
    locationDenied: "Přístup k poloze byl zamítnut.",
    locationUnavailable: "Geolokace není v tomto prohlížeči dostupná.",
    locationError: "Polohu se nepodařilo získat.",
    accuracy: "přesnost",
    distanceFromReceiver: "od přijímače",
    distanceFromYou: "od tebe",
    bearingFromYou: "směr od tebe",
  } : {
    title: "Spotter Mode",
    subtitle: "Mobile live view of aircraft actually observed by the LOCAL receiver.",
    liveNearby: "Live nearby",
    newToday: "New today",
    rareToday: "Rare today",
    receptionRecord: "Today's record",
    aircraft: "Aircraft in range",
    aircraftDescription: "LOCAL receiver evidence only. In My location mode, distance and bearing are calculated only in this browser.",
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
    distanceOrigin: "Reference point",
    receiver: "Receiver",
    myLocation: "My location",
    locationPrivate: "Your location stays in this browser and is not sent to AirRadar.",
    locationRequesting: "Getting your location…",
    locationReady: "Location active",
    locationDenied: "Location permission was denied.",
    locationUnavailable: "Geolocation is unavailable in this browser.",
    locationError: "Your location could not be determined.",
    accuracy: "accuracy",
    distanceFromReceiver: "from receiver",
    distanceFromYou: "from you",
    bearingFromYou: "bearing from you",
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
  const [distanceOrigin, setDistanceOrigin] = useState<SpotterDistanceOrigin>("receiver");
  const [observer, setObserver] = useState<SpotterObserverPosition | null>(null);
  const [observerState, setObserverState] = useState<ObserverState>("idle");

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
    if (distanceOrigin !== "observer") return;
    if (!("geolocation" in navigator)) {
      setObserver(null);
      setObserverState("unavailable");
      return;
    }
    setObserverState("requesting");
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setObserver(observerFromGeolocation(position));
        setObserverState("ready");
      },
      (error) => {
        setObserver(null);
        setObserverState(error.code === error.PERMISSION_DENIED ? "denied" : "error");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 15_000,
        timeout: 10_000,
      },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [distanceOrigin]);

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

  const filteredAircraft = useMemo(
    () => filterSpotterAircraft(snapshot?.aircraft ?? [], {
      maxDistanceKm: distanceOrigin === "receiver" ? maxDistanceKm : null,
      maxAltitudeFt,
      discovery: discoveryFilter,
      aircraftType,
    }, labelsByHex),
    [aircraftType, discoveryFilter, distanceOrigin, labelsByHex, maxAltitudeFt, maxDistanceKm, snapshot?.aircraft],
  );

  const visibleAircraft = useMemo(() => {
    if (distanceOrigin === "receiver") {
      return filteredAircraft.map((aircraft) => ({ aircraft, geometry: null }));
    }
    if (!observer) return [];
    return filteredAircraft
      .map((aircraft) => ({ aircraft, geometry: observerGeometry(aircraft, observer) }))
      .filter((item) => item.geometry !== null)
      .filter((item) => maxDistanceKm === null || item.geometry!.horizontalDistanceKm <= maxDistanceKm)
      .sort((a, b) => a.geometry!.horizontalDistanceKm - b.geometry!.horizontalDistanceKm
        || a.aircraft.icaoHex.localeCompare(b.aircraft.icaoHex));
  }, [distanceOrigin, filteredAircraft, maxDistanceKm, observer]);

  const feedState = snapshot
    ? connected && snapshot.sourceOnline ? "live" : "stale"
    : connected ? "loading" : "unavailable";

  const observerMessage = observerState === "requesting" ? copy.locationRequesting
    : observerState === "ready" ? copy.locationReady
    : observerState === "denied" ? copy.locationDenied
    : observerState === "unavailable" ? copy.locationUnavailable
    : observerState === "error" ? copy.locationError
    : copy.locationPrivate;

  return <main className={styles.page} data-testid="mobile-spotter-mode-v2">
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

    <Panel className={styles.locationMode}>
      <SectionHeader
        kicker="MY SKY"
        title={copy.distanceOrigin}
        description={distanceOrigin === "observer" ? observerMessage : copy.locationPrivate}
        actions={<SegmentedControl>
          <Button
            size="compact"
            variant={distanceOrigin === "receiver" ? "primary" : "ghost"}
            aria-pressed={distanceOrigin === "receiver"}
            onClick={() => setDistanceOrigin("receiver")}
          >{copy.receiver}</Button>
          <Button
            size="compact"
            variant={distanceOrigin === "observer" ? "primary" : "ghost"}
            aria-pressed={distanceOrigin === "observer"}
            onClick={() => setDistanceOrigin("observer")}
          >{copy.myLocation}</Button>
        </SegmentedControl>}
      />
      {distanceOrigin === "observer" && observer?.accuracyMeters !== null && observer?.accuracyMeters !== undefined
        ? <small className={styles.locationAccuracy}>{copy.accuracy}: ±{formatNumber(observer.accuracyMeters)} m</small>
        : null}
    </Panel>

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
        : distanceOrigin === "observer" && observerState !== "ready"
          ? <EmptyState title={observerMessage} description={copy.locationPrivate} />
          : visibleAircraft.length ? <div className={styles.list}>
          {visibleAircraft.map(({ aircraft, geometry }) => {
            const labels = labelsByHex.get(aircraft.icaoHex) ?? [];
            const identity = aircraft.callsign ?? aircraft.registration ?? aircraft.icaoHex;
            const displayedDistance = geometry?.horizontalDistanceKm ?? aircraft.distanceKm;
            const displayedBearing = geometry?.bearingDeg ?? aircraft.bearing;
            return <article className={styles.card} key={aircraft.icaoHex}>
              <div className={styles.cardHead}>
                <div>
                  <strong>{identity}</strong>
                  <span>{aircraft.registration ?? aircraft.icaoHex}{aircraft.aircraftType ? " · " + aircraft.aircraftType : ""}</span>
                </div>
                <div className={styles.badges}>
                  <StatusBadge variant={feedState === "live" ? "live" : "stale"}>LOCAL</StatusBadge>
                  {labels.includes("new") ? <span data-spotter-label>NEW</span> : null}
                  {labels.includes("rare") ? <span data-spotter-label>RARE</span> : null}
                  {labels.includes("returning") ? <span data-spotter-label>RETURNING</span> : null}
                </div>
              </div>
              <dl>
                <div>
                  <dt>{distanceOrigin === "observer" ? copy.distanceFromYou : copy.distanceFromReceiver}</dt>
                  <dd>{formatDistance(displayedDistance)}</dd>
                </div>
                <div><dt>{copy.altitude}</dt><dd>{formatAltitude(aircraft.altitude)}</dd></div>
                <div>
                  <dt>{distanceOrigin === "observer" ? copy.bearingFromYou : copy.bearing}</dt>
                  <dd>{formatTrack(displayedBearing)}</dd>
                </div>
                <div><dt>{copy.track}</dt><dd>{formatTrack(aircraft.track)}</dd></div>
              </dl>
              <div className={styles.actions}>
                <Link href={("/aircraft/" + encodeURIComponent(aircraft.icaoHex)) as Route}>{copy.detail}</Link>
                <Link href={("/?aircraft=" + encodeURIComponent(aircraft.icaoHex)) as Route}>{copy.radar}</Link>
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
