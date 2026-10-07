"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, EmptyState, MetricCard, MetricStrip, PageHeader, Panel, SectionHeader, SegmentedControl, StatusBadge } from "@/components/ui-primitives";
import { useAircraftStream } from "@/components/use-aircraft-stream";
import type { LogbookLabel, LogbookSummaryResponse, PublicStateSnapshot, TrailPoint } from "@/lib/aircraft/types";
import type { HistoricalAircraftTrack } from "@/lib/time-machine/playback";
import { formatAltitude, formatDateTime, formatDistance, formatNumber, formatTrack, t } from "@/lib/i18n";
import { filterSpotterAircraft, type SpotterDiscoveryFilter } from "@/lib/spotter";
import { findRecentObserverPasses } from "@/lib/spotter-history";
import { isSpotterInteresting, scoreSpotterInterest, type SpotterInterestReasonCode } from "@/lib/spotter-interest";
import { DEFAULT_SPOTTER_ALERT_PREFERENCES, readSpotterAlertPreferences, shouldTriggerSpotterAlert, spotterAlertTag, writeSpotterAlertPreferences, type SpotterAlertPreferences } from "@/lib/spotter-alerts";
import { headingFromDeviceOrientation, skyFinderDirection, type SkyFinderTurn } from "@/lib/spotter-sky-finder";
import { buildSpotterSkyStory, verticalTrend } from "@/lib/spotter-story";
import { buildPrgArrivalContext } from "@/lib/spotter-arrival-context";
import { rankUpcomingSky } from "@/lib/spotter-upcoming";
import { observerFromGeolocation, observerGeometry, predictClosestApproach, type SpotterObserverPosition } from "@/lib/spotter-location";
import styles from "./mobile-spotter-mode.module.css";

type SpotterDistanceOrigin = "receiver" | "observer";
type ObserverState = "idle" | "requesting" | "ready" | "denied" | "unavailable" | "error";

export function MobileSpotterMode() {
  const copy = t.spotter;

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
  const [historyTracks, setHistoryTracks] = useState<HistoricalAircraftTrack[]>([]);
  const [historyState, setHistoryState] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const [historyTruncated, setHistoryTruncated] = useState(false);
  const [alertPreferences, setAlertPreferences] = useState<SpotterAlertPreferences>(DEFAULT_SPOTTER_ALERT_PREFERENCES);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("default");
  const alertedTagsRef = useRef<Map<string, number>>(new Map());
  const [skyFinderEnabled, setSkyFinderEnabled] = useState(false);
  const [deviceHeading, setDeviceHeading] = useState<number | null>(null);
  const [orientationState, setOrientationState] = useState<"idle" | "waiting" | "ready" | "denied" | "unavailable">("idle");

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
    if (!skyFinderEnabled) {
      setDeviceHeading(null);
      if (orientationState === "ready" || orientationState === "waiting") setOrientationState("idle");
      return;
    }
    const onOrientation = (event: DeviceOrientationEvent) => {
      const heading = headingFromDeviceOrientation(event as DeviceOrientationEvent & { webkitCompassHeading?: number });
      if (heading === null) return;
      setDeviceHeading(heading);
      setOrientationState("ready");
    };
    window.addEventListener("deviceorientationabsolute", onOrientation as EventListener, true);
    window.addEventListener("deviceorientation", onOrientation, true);
    return () => {
      window.removeEventListener("deviceorientationabsolute", onOrientation as EventListener, true);
      window.removeEventListener("deviceorientation", onOrientation, true);
    };
  }, [orientationState, skyFinderEnabled]);

  useEffect(() => {
    setAlertPreferences(readSpotterAlertPreferences());
    setNotificationPermission("Notification" in window && "serviceWorker" in navigator
      ? Notification.permission
      : "unsupported");
  }, []);

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

  useEffect(() => {
    if (distanceOrigin !== "observer" || observerState !== "ready") {
      setHistoryTracks([]);
      setHistoryState("idle");
      setHistoryTruncated(false);
      return;
    }
    let active = true;
    let controller: AbortController | null = null;
    const load = () => {
      controller?.abort();
      controller = new AbortController();
      const to = new Date();
      const from = new Date(to.getTime() - 20 * 60_000);
      const query = new URLSearchParams({
        from: from.toISOString(),
        to: to.toISOString(),
        mode: "event-replay",
      });
      setHistoryState("loading");
      void fetch("/api/time-machine/window?" + query.toString(), { cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("spotter history unavailable");
          return await response.json() as { aircraft: HistoricalAircraftTrack[]; truncated: boolean };
        })
        .then((next) => {
          if (!active) return;
          setHistoryTracks(next.aircraft);
          setHistoryTruncated(next.truncated);
          setHistoryState("ready");
        })
        .catch((error) => {
          if (active && (error as Error).name !== "AbortError") setHistoryState("failed");
        });
    };
    load();
    const timer = window.setInterval(load, 5 * 60_000);
    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(timer);
    };
  }, [distanceOrigin, observerState]);

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

  const upcomingPasses = useMemo(() => {
    if (distanceOrigin !== "observer" || !observer) return [];
    return visibleAircraft
      .map((item) => ({
        ...item,
        closestApproach: predictClosestApproach(item.aircraft, observer),
      }))
      .filter((item) => item.closestApproach?.phase === "approaching"
        && item.closestApproach.secondsUntilClosest <= 10 * 60)
      .sort((a, b) => a.closestApproach!.secondsUntilClosest - b.closestApproach!.secondsUntilClosest
        || a.closestApproach!.closestHorizontalDistanceKm - b.closestApproach!.closestHorizontalDistanceKm)
      .slice(0, 5);
  }, [distanceOrigin, observer, visibleAircraft]);

  const interestingAircraft = useMemo(() => {
    if (distanceOrigin !== "observer" || !observer) return [];
    const recordHex = discovery?.todayReceptionRecord?.icaoHex ?? null;
    return visibleAircraft
      .map((item) => {
        const closestApproach = predictClosestApproach(item.aircraft, observer);
        const interest = scoreSpotterInterest(
          item.aircraft,
          labelsByHex.get(item.aircraft.icaoHex) ?? [],
          closestApproach?.closestHorizontalDistanceKm ?? null,
          recordHex,
        );
        return { ...item, closestApproach, interest };
      })
      .filter((item) => isSpotterInteresting(item.interest))
      .sort((a, b) => b.interest.score - a.interest.score
        || (a.closestApproach?.secondsUntilClosest ?? Number.POSITIVE_INFINITY)
          - (b.closestApproach?.secondsUntilClosest ?? Number.POSITIVE_INFINITY))
      .slice(0, 5);
  }, [discovery?.todayReceptionRecord?.icaoHex, distanceOrigin, labelsByHex, observer, visibleAircraft]);

  const toggleSkyFinder = async () => {
    if (skyFinderEnabled) {
      setSkyFinderEnabled(false);
      setOrientationState("idle");
      return;
    }
    if (!("DeviceOrientationEvent" in window)) {
      setOrientationState("unavailable");
      return;
    }
    const OrientationEvent = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    if (typeof OrientationEvent.requestPermission === "function") {
      try {
        const permission = await OrientationEvent.requestPermission();
        if (permission !== "granted") {
          setOrientationState("denied");
          return;
        }
      } catch {
        setOrientationState("denied");
        return;
      }
    }
    setOrientationState("waiting");
    setSkyFinderEnabled(true);
  };

  const updateAlertPreferences = (next: SpotterAlertPreferences) => {
    setAlertPreferences(next);
    writeSpotterAlertPreferences(next);
  };

  const toggleSpotterAlerts = async () => {
    if (alertPreferences.enabled) {
      updateAlertPreferences({ ...alertPreferences, enabled: false });
      return;
    }
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setNotificationPermission("unsupported");
      return;
    }
    const permission = Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission === "granted") {
      updateAlertPreferences({ ...alertPreferences, enabled: true });
    }
  };

  const toggleAlertReason = (reason: SpotterInterestReasonCode) => {
    const reasons = alertPreferences.reasons.includes(reason)
      ? alertPreferences.reasons.filter((item) => item !== reason)
      : [...alertPreferences.reasons, reason];
    updateAlertPreferences({ ...alertPreferences, reasons });
  };

  const upcomingSky = useMemo(
    () => distanceOrigin === "observer" && observer
      ? rankUpcomingSky(
          visibleAircraft.map((item) => item.aircraft),
          observer,
          labelsByHex,
          discovery?.todayReceptionRecord?.icaoHex ?? null,
        )
      : [],
    [discovery?.todayReceptionRecord?.icaoHex, distanceOrigin, labelsByHex, observer, visibleAircraft],
  );

  const skyStory = useMemo(() => {
    if (distanceOrigin !== "observer" || !observer || !visibleAircraft.length) return null;
    const aircraft = interestingAircraft[0]?.aircraft
      ?? upcomingPasses[0]?.aircraft
      ?? visibleAircraft[0]?.aircraft;
    if (!aircraft) return null;
    const closestApproach = predictClosestApproach(aircraft, observer);
    const interest = scoreSpotterInterest(
      aircraft,
      labelsByHex.get(aircraft.icaoHex) ?? [],
      closestApproach?.closestHorizontalDistanceKm ?? null,
      discovery?.todayReceptionRecord?.icaoHex ?? null,
    );
    return {
      aircraft,
      story: buildSpotterSkyStory(aircraft, interest, closestApproach),
    };
  }, [discovery?.todayReceptionRecord?.icaoHex, distanceOrigin, interestingAircraft, labelsByHex, observer, upcomingPasses, visibleAircraft]);

  const prgArrival = useMemo(
    () => skyStory ? buildPrgArrivalContext(skyStory.aircraft, skyStory.story) : null,
    [skyStory],
  );

  const skyTarget = useMemo(() => {
    if (distanceOrigin !== "observer" || !observer || !visibleAircraft.length) return null;
    const preferred = interestingAircraft[0]
      ?? upcomingPasses[0]
      ?? visibleAircraft[0];
    const geometry = preferred.geometry ?? observerGeometry(preferred.aircraft, observer);
    if (!geometry) return null;
    const direction = deviceHeading === null
      ? null
      : skyFinderDirection(geometry.bearingDeg, deviceHeading);
    return {
      aircraft: preferred.aircraft,
      geometry,
      direction,
    };
  }, [deviceHeading, distanceOrigin, interestingAircraft, observer, upcomingPasses, visibleAircraft]);

  const recentPasses = useMemo(
    () => observer ? findRecentObserverPasses(historyTracks, observer, 10, 8) : [],
    [historyTracks, observer],
  );

  useEffect(() => {
    if (
      distanceOrigin !== "observer"
      || notificationPermission !== "granted"
      || !alertPreferences.enabled
      || !("serviceWorker" in navigator)
    ) return;

    const now = Date.now();
    for (const [tag, at] of alertedTagsRef.current) {
      if (now - at > 60 * 60_000) alertedTagsRef.current.delete(tag);
    }

    for (const item of interestingAircraft) {
      const route = item.aircraft.enrichment?.route;
      const candidate = {
        icaoHex: item.aircraft.icaoHex,
        identity: item.aircraft.callsign ?? item.aircraft.registration ?? item.aircraft.icaoHex,
        aircraftType: item.aircraft.aircraftType ?? item.aircraft.enrichment?.metadata?.icaoTypeCode ?? null,
        routeLabel: route?.origin || route?.destination
          ? (route?.origin ?? "—") + " → " + (route?.destination ?? "—")
          : null,
        interest: item.interest,
        closestApproach: item.closestApproach,
      };
      if (!shouldTriggerSpotterAlert(candidate, alertPreferences)) continue;
      const tag = spotterAlertTag(candidate);
      if (alertedTagsRef.current.has(tag)) continue;
      alertedTagsRef.current.set(tag, now);
      if (alertedTagsRef.current.size > 100) {
        const oldest = [...alertedTagsRef.current.entries()].sort((a, b) => a[1] - b[1])[0];
        if (oldest) alertedTagsRef.current.delete(oldest[0]);
      }

      const leadMinutes = Math.max(1, Math.round((candidate.closestApproach?.secondsUntilClosest ?? 0) / 60));
      const bodyParts = [
        candidate.aircraftType,
        candidate.routeLabel,
        candidate.closestApproach ? formatDistance(candidate.closestApproach.closestHorizontalDistanceKm) : null,
        copy.inPrefix + " " + leadMinutes + " min",
      ].filter(Boolean);
      void navigator.serviceWorker.ready
        .then((registration) => registration.showNotification(candidate.identity + " · " + copy.lookUp, {
          body: bodyParts.join(" · "),
          icon: "/icon.svg",
          badge: "/icon.svg",
          tag,
          data: { url: "/?aircraft=" + encodeURIComponent(candidate.icaoHex) },
        }))
        .catch(() => undefined);
    }
  }, [alertPreferences, copy.inPrefix, copy.lookUp, distanceOrigin, interestingAircraft, notificationPermission]);

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

    {distanceOrigin === "observer" && observerState === "ready" && skyStory ? <Panel className={styles.skyStoryPanel}>
      <SectionHeader kicker="MY SKY / STORY" title={copy.skyCardTitle} description={copy.skyCardDescription} />
      <article className={styles.skyStory}>
        <div className={styles.skyStoryTop}>
          <div>
            <span className={styles.skyStoryEyebrow}>{skyStory.story.operator ?? "LOCAL"}</span>
            <strong className={styles.skyStoryIdentity}>{skyStory.story.identity}</strong>
            <span>{skyStory.story.registration ?? skyStory.aircraft.icaoHex}</span>
          </div>
          <div className={styles.skyStoryScore}>
            <strong>{skyStory.story.interest.score}</strong>
            <span>{copy.interestScore}</span>
          </div>
        </div>
        <div className={styles.skyStoryRoute}>
          {skyStory.story.origin || skyStory.story.destination
            ? <>
              <div><strong>{skyStory.story.origin ?? "—"}</strong><small>{skyStory.story.originName ?? ""}</small></div>
              <span aria-hidden="true">→</span>
              <div><strong>{skyStory.story.destination ?? "—"}</strong><small>{skyStory.story.destinationName ?? ""}</small></div>
            </>
            : <span>{copy.routeUnknown}</span>}
        </div>
        <dl className={styles.skyStoryMetrics}>
          <div><dt>{copy.aircraftInfo}</dt><dd>{skyStory.story.aircraftType ?? "—"}</dd></div>
          <div><dt>{copy.closestPass}</dt><dd>{formatDistance(skyStory.story.closestApproachKm)}</dd></div>
          <div><dt>{copy.altitude}</dt><dd>{formatAltitude(skyStory.story.altitudeFt)}</dd></div>
          <div><dt>{copy.speed}</dt><dd>{skyStory.story.groundSpeedKt === null ? "—" : formatNumber(skyStory.story.groundSpeedKt) + " kt"}</dd></div>
          <div><dt>{copy.elevation}</dt><dd>{skyStory.story.elevationAtClosestDeg === null ? "—" : formatNumber(skyStory.story.elevationAtClosestDeg) + "°"}</dd></div>
          <div><dt>{copy.verticalTrend}</dt><dd>{copy.verticalTrends[verticalTrend(skyStory.story.verticalRateFpm)]}</dd></div>
          {skyStory.story.estimatedArrival ? <div><dt>{copy.eta}</dt><dd>{formatDateTime(skyStory.story.estimatedArrival, t)}</dd></div> : null}
        </dl>
        <div className={styles.interestReasons}>
          {skyStory.story.interest.reasons.map((reason) => <span key={reason.code}>
            {copy.interestReasons[reason.code as SpotterInterestReasonCode]} +{reason.points}
          </span>)}
        </div>
        <div className={styles.actions}>
          <Link href={("/aircraft/" + encodeURIComponent(skyStory.aircraft.icaoHex)) as Route}>{copy.detail}</Link>
          <Link href={("/?aircraft=" + encodeURIComponent(skyStory.aircraft.icaoHex)) as Route}>{copy.radar}</Link>
        </div>
      </article>
    </Panel> : null}

    {prgArrival ? <Panel>
      <SectionHeader kicker="PRG / ARRIVAL" title={copy.prgArrivalTitle} description={copy.prgArrivalDescription} />
      <dl className={styles.arrivalContext}>
        {prgArrival.estimatedArrival ? <div><dt>{copy.eta}</dt><dd>{formatDateTime(prgArrival.estimatedArrival, t)}</dd></div> : null}
        <div><dt>{copy.verticalTrend}</dt><dd>{copy.verticalTrends[prgArrival.verticalTrend]}</dd></div>
        {prgArrival.runway ? <div><dt>{copy.runway}</dt><dd>{prgArrival.runway}</dd></div> : null}
        {prgArrival.terminal ? <div><dt>{copy.terminal}</dt><dd>{prgArrival.terminal}</dd></div> : null}
        {prgArrival.gate ? <div><dt>{copy.gate}</dt><dd>{prgArrival.gate}</dd></div> : null}
        {prgArrival.progressPercent !== null ? <div><dt>{copy.progress}</dt><dd>{formatNumber(prgArrival.progressPercent)}%</dd></div> : null}
        {prgArrival.approachMode !== null ? <div><dt>{copy.approachMode}</dt><dd>{prgArrival.approachMode ? copy.yes : copy.no}</dd></div> : null}
      </dl>
    </Panel> : null}

    {distanceOrigin === "observer" && observerState === "ready" ? <Panel>
      <SectionHeader
        kicker="MY SKY / FINDER"
        title={copy.skyFinder}
        description={copy.skyFinderDescription}
        actions={<Button
          size="compact"
          variant={skyFinderEnabled ? "primary" : "secondary"}
          onClick={() => void toggleSkyFinder()}
        >{skyFinderEnabled ? copy.disableSkyFinder : copy.enableSkyFinder}</Button>}
      />
      {orientationState === "denied" ? <p className={styles.discoveryWarning}>{copy.orientationDenied}</p> : null}
      {orientationState === "unavailable" ? <p className={styles.discoveryWarning}>{copy.orientationUnavailable}</p> : null}
      {skyFinderEnabled && orientationState === "waiting" ? <p className={styles.loading}>{copy.orientationWaiting}</p> : null}
      {skyTarget ? <div className={styles.skyFinder}>
        <div className={styles.skyCompass} aria-hidden="true">
          <span
            className={styles.skyArrow}
            style={{ transform: "rotate(" + (skyTarget.direction?.relativeTurnDeg ?? 0) + "deg)" }}
          >↑</span>
        </div>
        <div className={styles.skyTarget}>
          <strong>{skyTarget.aircraft.callsign ?? skyTarget.aircraft.registration ?? skyTarget.aircraft.icaoHex}</strong>
          <span>{skyTarget.aircraft.aircraftType ?? skyTarget.aircraft.enrichment?.metadata?.icaoTypeCode ?? skyTarget.aircraft.icaoHex}</span>
          <dl>
            <div><dt>{copy.azimuth}</dt><dd>{formatTrack(skyTarget.geometry.bearingDeg)}</dd></div>
            <div><dt>{copy.elevation}</dt><dd>{skyTarget.geometry.elevationDeg === null ? "—" : formatNumber(skyTarget.geometry.elevationDeg) + "°"}</dd></div>
            <div><dt>{copy.distanceFromYou}</dt><dd>{formatDistance(skyTarget.geometry.horizontalDistanceKm)}</dd></div>
            <div><dt>{copy.deviceHeading}</dt><dd>{deviceHeading === null ? "—" : formatTrack(deviceHeading)}</dd></div>
          </dl>
          {skyTarget.direction ? <strong className={styles.skyInstruction}>
            {copy.skyDirections[skyTarget.direction.turn as SkyFinderTurn]}
            {Math.abs(skyTarget.direction.relativeTurnDeg) > 15 && Math.abs(skyTarget.direction.relativeTurnDeg) < 150
              ? " · " + formatNumber(Math.abs(skyTarget.direction.relativeTurnDeg)) + "°"
              : ""}
          </strong> : null}
        </div>
      </div> : <EmptyState title={copy.noAircraft} />}
    </Panel> : null}

    <Panel>
      <SectionHeader
        kicker="MY SKY / ALERTS"
        title={copy.spotterAlerts}
        description={copy.spotterAlertsDescription}
        actions={<Button
          size="compact"
          variant={alertPreferences.enabled ? "primary" : "secondary"}
          onClick={() => void toggleSpotterAlerts()}
        >{alertPreferences.enabled ? copy.disableSpotterAlerts : copy.enableSpotterAlerts}</Button>}
      />
      {notificationPermission === "denied" ? <p className={styles.discoveryWarning}>{copy.notificationDenied}</p> : null}
      {notificationPermission === "unsupported" ? <p className={styles.discoveryWarning}>{copy.notificationUnsupported}</p> : null}
      <div className={styles.alertGrid}>
        <label>
          <span>{copy.alertDistance}</span>
          <select
            value={alertPreferences.maxClosestDistanceKm}
            onChange={(event) => updateAlertPreferences({ ...alertPreferences, maxClosestDistanceKm: Number(event.target.value) })}
          >
            {[1, 3, 5, 10].map((value) => <option value={value} key={value}>{value} km</option>)}
          </select>
        </label>
        <label>
          <span>{copy.alertLead}</span>
          <select
            value={alertPreferences.leadMinutes}
            onChange={(event) => updateAlertPreferences({ ...alertPreferences, leadMinutes: Number(event.target.value) })}
          >
            {[1, 3, 5, 10].map((value) => <option value={value} key={value}>{value} min</option>)}
          </select>
        </label>
        <label>
          <span>{copy.alertScore}</span>
          <select
            value={alertPreferences.minimumInterestScore}
            onChange={(event) => updateAlertPreferences({ ...alertPreferences, minimumInterestScore: Number(event.target.value) })}
          >
            {[30, 40, 60, 80].map((value) => <option value={value} key={value}>{value}</option>)}
          </select>
        </label>
      </div>
      <div className={styles.alertReasons}>
        <strong>{copy.alertReasons}</strong>
        <div>
          {(["iconic_type", "rare", "new", "widebody", "emergency", "reception_record"] as SpotterInterestReasonCode[]).map((reason) => <label key={reason}>
            <input
              type="checkbox"
              checked={alertPreferences.reasons.includes(reason)}
              onChange={() => toggleAlertReason(reason)}
            />
            <span>{copy.interestReasons[reason]}</span>
          </label>)}
        </div>
      </div>
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

    {distanceOrigin === "observer" && observerState === "ready" && interestingAircraft.length ? <Panel>
      <SectionHeader kicker="MY SKY / DISCOVERY" title={copy.lookUp} description={copy.lookUpDescription} />
      <div className={styles.passList}>
        {interestingAircraft.map(({ aircraft, interest, closestApproach }) => {
          const route = aircraft.enrichment?.route;
          return <article className={styles.interestCard} key={aircraft.icaoHex}>
            <div className={styles.interestHead}>
              <div>
                <strong>{aircraft.callsign ?? aircraft.registration ?? aircraft.icaoHex}</strong>
                <span>{aircraft.aircraftType ?? aircraft.enrichment?.metadata?.icaoTypeCode ?? aircraft.icaoHex}</span>
                {route?.origin || route?.destination ? <small>{route?.origin ?? "—"} → {route?.destination ?? "—"}</small> : null}
              </div>
              <div className={styles.interestScore}>
                <strong>{interest.score}</strong>
                <span>{copy.interestScore}</span>
              </div>
            </div>
            <div className={styles.interestReasons}>
              {interest.reasons.map((reason) => <span key={reason.code}>
                {copy.interestReasons[reason.code as SpotterInterestReasonCode]} +{reason.points}
              </span>)}
            </div>
            {closestApproach ? <small>{copy.closestPass}: {formatDistance(closestApproach.closestHorizontalDistanceKm)}</small> : null}
          </article>;
        })}
      </div>
    </Panel> : null}

    {distanceOrigin === "observer" && observerState === "ready" && upcomingSky.length ? <Panel>
      <SectionHeader kicker="MY SKY / NEXT" title={copy.whatsNext} description={copy.whatsNextDescription} />
      <div className={styles.passList}>
        {upcomingSky.map(({ aircraft, closestApproach, interest, rankScore }) => {
          const route = aircraft.enrichment?.route;
          const identity = aircraft.callsign ?? aircraft.registration ?? aircraft.icaoHex;
          const lead = closestApproach.secondsUntilClosest < 30
            ? copy.now
            : Math.max(1, Math.round(closestApproach.secondsUntilClosest / 60)) + " min";
          return <article className={styles.passCard} key={aircraft.icaoHex}>
            <div>
              <strong>{identity}</strong>
              <span>{aircraft.aircraftType ?? aircraft.enrichment?.metadata?.icaoTypeCode ?? aircraft.icaoHex}</span>
              {route?.origin || route?.destination
                ? <small>{route?.origin ?? "—"} → {route?.destination ?? "—"}</small>
                : null}
              <small>{copy.interestScore}: {interest.score} · {copy.rank}: {formatNumber(rankScore)}</small>
            </div>
            <div className={styles.passMetrics}>
              <strong>{formatDistance(closestApproach.closestHorizontalDistanceKm)}</strong>
              <span>{copy.inPrefix} {lead}</span>
              {closestApproach.elevationAtClosestDeg !== null
                ? <small>{copy.elevation} {formatNumber(closestApproach.elevationAtClosestDeg)}°</small>
                : null}
            </div>
          </article>;
        })}
      </div>
    </Panel> : null}

    {distanceOrigin === "observer" && observerState === "ready" ? <Panel>
      <SectionHeader kicker="MY SKY / HISTORY" title={copy.justOverhead} description={copy.justOverheadDescription} />
      {historyState === "failed" ? <EmptyState title={copy.historyUnavailable} />
        : historyState === "loading" && !recentPasses.length ? <p className={styles.loading}>{copy.loading}</p>
        : recentPasses.length ? <div className={styles.passList}>
          {recentPasses.map((pass) => <article className={styles.passCard} key={pass.trackId}>
            <div>
              <strong>{pass.callsign ?? pass.registration ?? pass.icaoHex}</strong>
              <span>{pass.aircraftType ?? pass.registration ?? pass.icaoHex}</span>
              {pass.origin || pass.destination ? <small>{pass.origin ?? "—"} → {pass.destination ?? "—"}</small> : null}
            </div>
            <div className={styles.passMetrics}>
              <strong>{formatDistance(pass.closestDistanceKm)}</strong>
              <span>{copy.closestAt} {formatDateTime(pass.closestAt, t)}</span>
              <small>{formatAltitude(pass.altitudeFt)}</small>
            </div>
          </article>)}
        </div> : <EmptyState title={copy.noAircraft} />}
      {historyTruncated ? <p className={styles.discoveryWarning}>{copy.historyTruncated}</p> : null}
    </Panel> : null}

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
      {discoveryFailed ? <p className={styles.discoveryWarning}>{copy.discoveryWarning}</p> : null}
    </Panel>
  </main>;
}
