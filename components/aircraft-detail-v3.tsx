"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { AircraftView } from "@/lib/aircraft/types";
import type { AircraftPhoto, AircraftPhotoApiResponse } from "@/lib/aircraft/photo";
import type { AircraftDetailResponse, HistoryResponse } from "@/lib/server/history";
import type { AtcContextResult } from "@/lib/atc-context/types";
import { aircraftWatchlistHref } from "@/lib/aircraft/detail-links";
import { formatAge, formatAltitude, formatDistance, formatNumber, formatSpeed, formatTime, formatTrack, t } from "@/lib/i18n";
import { FlightRouteWeather } from "@/components/airport-weather";
import {
  AircraftAltitudeChart,
  AircraftHistorySummaryCard,
  AircraftLifetimeStatsCard,
  AircraftRecentFlights,
  aircraftAirportHref,
  formatFiledAirspeed,
  formatFiledAltitude,
  formatFiledEte,
  formatRouteDistance,
  hasFiniteFlightPlanValue,
} from "@/components/aircraft-detail-v2";
import styles from "@/components/aircraft-detail-v3.module.css";

function valueOrEmpty(value: string | null | undefined): string {
  return value || t.common.emptyValue;
}

function DetailValue({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return <div className={className}><div className="detail-item-label">{label}</div><div className="detail-item-value">{children}</div></div>;
}

function formatFlightAwareTime(value: string | undefined, timezone?: unknown): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const options: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  if (typeof timezone === "string") {
    try {
      new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
      options.timeZone = timezone;
    } catch {
      // Fall back to the AirRadar locale convention.
    }
  }
  return new Intl.DateTimeFormat(t.locale, options).format(date);
}

function formatDelay(seconds: number | undefined): string | null {
  if (seconds === undefined || !Number.isFinite(seconds)) return null;
  const minutes = Math.round(seconds / 60);
  if (minutes === 0) return t.locale.startsWith("cs") ? "Včas" : "On time";
  const absolute = Math.abs(minutes);
  const duration = absolute >= 60
    ? `${Math.floor(absolute / 60)} h${absolute % 60 ? ` ${absolute % 60} min` : ""}`
    : `${absolute} min`;
  if (minutes > 0) return `+${duration}`;
  return t.locale.startsWith("cs") ? `${duration} dříve` : `${duration} early`;
}

function scheduleKindLabel(kind: "scheduled" | "estimated" | "actual"): string {
  if (t.locale.startsWith("cs")) {
    if (kind === "scheduled") return "Plán";
    if (kind === "estimated") return "Odhad";
    return "Skutečnost";
  }
  if (kind === "scheduled") return "Scheduled";
  if (kind === "estimated") return "Estimated";
  return "Actual";
}

function RouteEndpoint({ code, airport }: { code: string | null; airport: NonNullable<NonNullable<AircraftView["enrichment"]>["route"]>["originAirport"] }) {
  if (!code && !airport) return <span>{t.common.emptyValue}</span>;
  const label = airport?.iataCode || airport?.icaoCode || code || t.common.emptyValue;
  const name = airport?.name;
  return <span className="aircraft-route-endpoint">
    <strong>{airport ? <Link className="airport-link" href={aircraftAirportHref(airport.icaoCode)}>{label}</Link> : label}</strong>
    {name && <small>{name}</small>}
  </span>;
}

function FlightSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className={styles.flightSection}><h3>{title}</h3>{children}</section>;
}

function AircraftHeroPhoto({
  icaoHex,
  registration,
  onAvailabilityChange,
}: {
  icaoHex: string;
  registration: string | null | undefined;
  onAvailabilityChange: (available: boolean) => void;
}) {
  const [result, setResult] = useState<AircraftPhotoApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageFailed, setImageFailed] = useState(false);
  const lookupHex = icaoHex === t.common.emptyValue ? null : icaoHex;

  useEffect(() => {
    if (!lookupHex) {
      setLoading(false);
      onAvailabilityChange(false);
      return;
    }
    let active = true;
    setLoading(true);
    setResult(null);
    setImageFailed(false);
    void fetch(`/api/aircraft/${encodeURIComponent(lookupHex)}/photo`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("aircraft photo request failed");
        return await response.json() as AircraftPhotoApiResponse;
      })
      .then((value) => {
        if (!active) return;
        setResult(value);
        onAvailabilityChange(Boolean(value.enabled && value.photo));
      })
      .catch(() => {
        if (!active) return;
        setResult(null);
        onAvailabilityChange(false);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [lookupHex, onAvailabilityChange]);

  const photo: AircraftPhoto | null = result?.photo ?? null;
  if (!lookupHex || imageFailed || (!loading && (!result?.enabled || !photo))) return null;

  const identity = registration?.trim() || lookupHex;
  return <section className={styles.photoPanel} aria-labelledby="aircraft-photo-v3-title">
    <h2 id="aircraft-photo-v3-title">{t.aircraft.photoTitle}</h2>
    {loading || !photo ? <div className={styles.photoLoading}>{t.common.loading}</div> : <>
      <a className={styles.photoLink} href={photo.sourceUrl} target="_blank" rel="noreferrer">
        {/* The server validates the image URL against the Planespotters allowlist. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={styles.photo}
          src={photo.thumbnailUrl}
          alt={`${t.aircraft.photoAlt} ${identity}`}
          loading="lazy"
          onError={() => {
            setImageFailed(true);
            onAvailabilityChange(false);
          }}
        />
      </a>
      <div className={styles.photoAttribution}>
        <span>{photo.attribution ?? t.aircraft.photoPhotographerUnknown}</span>
        <span aria-hidden="true"> · </span>
        <a href={photo.sourceUrl} target="_blank" rel="noreferrer">{t.aircraft.photoSource}</a>
      </div>
    </>}
  </section>;
}

function AirspaceCard({ icaoHex, enabled }: { icaoHex: string; enabled: boolean }) {
  const [context, setContext] = useState<AtcContextResult | null>(null);

  useEffect(() => {
    if (!enabled) {
      setContext(null);
      return;
    }
    let active = true;
    void fetch(`/api/aircraft/${encodeURIComponent(icaoHex)}/context`, { cache: "no-store" })
      .then((response) => response.json() as Promise<AtcContextResult>)
      .then((value) => { if (active) setContext(value); })
      .catch(() => { if (active) setContext(null); });
    return () => { active = false; };
  }, [enabled, icaoHex]);

  if (!enabled) return null;
  if (!context || context.status !== "available") {
    return <section className="aircraft-card" aria-label={t.atc.contextTitle}>
      <h2>{t.atc.contextTitle}</h2>
      <div className="detail-disclaimer">{context?.status === "stale" ? t.atc.contextStale : t.atc.contextUnavailable}</div>
    </section>;
  }

  const route = context.atsRoute ?? context.nearestAtsCandidate;
  const frequencies = context.primaryAirspace?.publishedFrequenciesMhz ?? [];
  return <section className="aircraft-card" aria-label={t.atc.contextTitle}>
    <h2>{t.atc.contextTitle}</h2>
    <div className={`detail-grid aircraft-detail-grid ${styles.compactGrid}`}>
      <DetailValue label={t.atc.contextFir}>{context.fir?.name ?? t.common.emptyValue}</DetailValue>
      <DetailValue label={t.atc.contextAirspace}>{context.primaryAirspace?.name ?? t.common.emptyValue}</DetailValue>
      <DetailValue label={route?.confidence === "high" ? t.atc.contextAts : t.atc.contextNearestAts}>
        {route ? `${route.routeId} · ${formatNumber(route.distanceNm, 1)} NM` : t.atc.contextDirect}
      </DetailValue>
      <DetailValue label={t.atc.contextNext}>
        {context.nextPoint
          ? `${context.nextPoint.identifier} · ${formatNumber(context.nextPoint.distanceNm, 0)} NM`
          : context.ahead
            ? `${context.ahead.airspace.name} · ${formatNumber(context.ahead.distanceNm, 0)} NM`
            : t.common.emptyValue}
      </DetailValue>
      {frequencies.length > 0 && <DetailValue label={t.locale.startsWith("cs") ? "Publikované frekvence" : "Published frequencies"}>
        {frequencies.map((frequency) => `${formatNumber(frequency, 3)} MHz`).join(" · ")}
      </DetailValue>}
    </div>
    <div className="detail-disclaimer">{t.atc.contextDisclaimer}</div>
  </section>;
}

function DataSources({
  metadataSource,
  routeSource,
  positionSource,
  photoAvailable,
}: {
  metadataSource?: string | null;
  routeSource?: string | null;
  positionSource: string;
  photoAvailable: boolean;
}) {
  const entries = [
    [t.aircraft.positionSourceLabel, positionSource],
    [t.aircraft.aircraftSource, metadataSource],
    [t.aircraft.routeSource, routeSource],
    [t.aircraft.photoTitle, photoAvailable ? t.aircraft.photoSource : null],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  return <details className={styles.sources}>
    <summary>{t.aircraft.dataSourcesTitle}</summary>
    <div className={styles.sourcesGrid}>
      {entries.map(([label, value]) => <DetailValue key={label} label={label}>{value}</DetailValue>)}
    </div>
  </details>;
}

export function AircraftDetailV3({
  detail,
  liveAircraft,
  loading = false,
  error = null,
  backHref = "/",
}: {
  detail: AircraftDetailResponse | null;
  liveAircraft: AircraftView | null;
  loading?: boolean;
  error?: string | null;
  backHref?: string;
}) {
  const databaseAircraft = detail?.aircraft;
  const metadata = liveAircraft?.enrichment?.metadata;
  const icaoHex = liveAircraft?.icaoHex ?? databaseAircraft?.icaoHex ?? t.common.emptyValue;
  const registration = liveAircraft?.registration ?? metadata?.registration ?? databaseAircraft?.registration;
  const aircraftType = metadata?.icaoTypeCode ?? liveAircraft?.aircraftType ?? databaseAircraft?.aircraftType;
  const model = metadata?.aircraftDescription ?? liveAircraft?.aircraftDescription ?? databaseAircraft?.model;
  const manufacturer = metadata?.manufacturer ?? databaseAircraft?.manufacturer;
  const operator = metadata?.operator ?? databaseAircraft?.operator;
  const registrationCountry = metadata?.registrationCountryCode ?? metadata?.registrationCountry ?? databaseAircraft?.registrationCountryCode ?? databaseAircraft?.registrationCountry;
  const callsign = liveAircraft?.callsign || t.history.unknownCallsign;
  const route = liveAircraft?.enrichment?.route ?? null;
  const flightPlan = liveAircraft?.enrichment?.flightPlan ?? null;
  const flightAware = flightPlan?.flightAware ?? null;
  const backLink = backHref === "/history" ? "/history" : "/";
  const watchlistHref = icaoHex === t.common.emptyValue ? "/watchlist" : aircraftWatchlistHref(icaoHex, registration);
  const sourceLabel = liveAircraft?.origin === "adsblol" ? t.aircraft.networkReceiver : t.aircraft.localReceiver;

  const [flightHistory, setFlightHistory] = useState<HistoryResponse | null>(null);
  const [flightHistoryLoading, setFlightHistoryLoading] = useState(false);
  const [photoAvailable, setPhotoAvailable] = useState(false);
  const handlePhotoAvailability = useCallback((available: boolean) => setPhotoAvailable(available), []);

  useEffect(() => {
    if (icaoHex === t.common.emptyValue) return;
    let active = true;
    setFlightHistory(null);
    setFlightHistoryLoading(true);
    void fetch(`/api/history/${encodeURIComponent(icaoHex)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("aircraft history unavailable");
        return await response.json() as HistoryResponse;
      })
      .then((result) => { if (active) setFlightHistory(result); })
      .catch(() => { if (active) setFlightHistory(null); })
      .finally(() => { if (active) setFlightHistoryLoading(false); });
    return () => { active = false; };
  }, [icaoHex]);

  const firstSeen = flightHistory?.flight?.startedAt ?? detail?.historySummary.firstSeenAt ?? null;
  const lastSeen = liveAircraft?.lastSeen ?? flightHistory?.flight?.lastSeenAt ?? detail?.historySummary.lastSeenAt ?? null;
  const livePoint = liveAircraft && liveAircraft.lat !== null && liveAircraft.altitude !== null
    ? { recordedAt: liveAircraft.lastSeen, altitude: liveAircraft.altitude }
    : null;
  const historyPoints = flightHistory?.positions ?? [];
  const sessionPoints = liveAircraft?.trail ?? [];
  const positionCount = historyPoints.length || sessionPoints.length;
  const title = liveAircraft?.callsign || registration || icaoHex;

  const operational = flightAware?.operational;
  const hasAirportOperations = Boolean(
    operational?.originTerminal || operational?.originGate || operational?.departureRunway ||
    operational?.destinationTerminal || operational?.destinationGate || operational?.arrivalRunway || operational?.baggageClaim,
  );
  const hasFlightPlanDetails = Boolean(
    hasFiniteFlightPlanValue(flightAware?.filedAltitude) ||
    hasFiniteFlightPlanValue(flightAware?.filedAirspeed) ||
    hasFiniteFlightPlanValue(flightAware?.filedEteSeconds) ||
    hasFiniteFlightPlanValue(flightAware?.routeDistance) ||
    flightPlan?.filedRoute || flightPlan?.waypoints.length,
  );

  return <main className={`aircraft-page ${styles.page}`}>
    <header className={`aircraft-page-header ${styles.heroHeader}`}>
      <Link className="back-link" href={backLink}>{t.history.backToRadar}</Link>
      <div className="aircraft-page-kicker">{t.history.aircraftDetail}</div>
      <h1>{title}</h1>
      <div className="aircraft-status-row">
        <div className={`aircraft-status ${liveAircraft ? "live" : "offline"}`}>
          {liveAircraft ? t.status.liveReceiver : t.aircraft.notCurrentlyInRange}
        </div>
        {detail?.logbook.isNew && <div className="aircraft-logbook-badge" title={t.logbook.newAircraftReason}>{t.logbook.newAircraft}</div>}
        {detail?.logbook.isRare && <div className="aircraft-logbook-badge rare" title={t.logbook.rareAircraftReason(detail.lifetimeStats.flightCount)}>{t.logbook.rareAircraft}</div>}
        {detail?.logbook.isReturning && <div className="aircraft-logbook-badge returning" title={t.logbook.returningAircraftReason(detail.logbook.returningGapDays ?? 0)}>{t.logbook.returningAircraft}</div>}
      </div>
      <div className="aircraft-page-identity"><span>{icaoHex}</span>{registration && <span>{registration}</span>}{aircraftType && <span>{aircraftType}</span>}</div>
      <div className="aircraft-page-subtitle">{[manufacturer, model].filter(Boolean).join(" ") || t.aircraft.unknownAircraftType}{operator ? ` · ${operator}` : ""}</div>
      {route && <div className="aircraft-page-route" aria-label={t.route.originDestination}>
        <span>{route.originAirport?.iataCode || route.originAirport?.icaoCode || route.origin || t.common.emptyValue}</span>
        <span aria-hidden="true">→</span>
        <strong>{callsign}</strong>
        <span aria-hidden="true">→</span>
        <span>{route.destinationAirport?.iataCode || route.destinationAirport?.icaoCode || route.destination || t.common.emptyValue}</span>
      </div>}
      <div className="aircraft-page-live-status"><span>{t.aircraft.statusAdsb}</span><span>{liveAircraft ? t.aircraft.updatedAgo(formatAge(liveAircraft.seenSeconds)) : t.aircraft.notCurrentlyInRange}</span></div>

      <div className={styles.heroBody}>
        {liveAircraft && <section className={`aircraft-live-hero ${styles.heroMetrics}`} aria-label={t.aircraft.liveAdsb}>
          <div><strong>{formatAltitude(liveAircraft.altitude)}</strong><span>{t.aircraft.altitude}</span></div>
          <div><strong>{formatSpeed(liveAircraft.groundSpeed)}</strong><span>{t.aircraft.groundSpeed}</span></div>
          <div><strong>{formatTrack(liveAircraft.track)}</strong><span>{t.aircraft.track}</span></div>
          <div><strong>{liveAircraft.verticalRate === null ? t.common.emptyValue : `${liveAircraft.verticalRate > 0 ? "+" : ""}${formatNumber(liveAircraft.verticalRate)} ft/min`}</strong><span>{t.aircraft.verticalRate}</span></div>
        </section>}
        <div className={styles.photoSlot}>
          <AircraftHeroPhoto icaoHex={icaoHex} registration={registration} onAvailabilityChange={handlePhotoAvailability} />
        </div>
      </div>
    </header>

    <div className={styles.operationalGrid}>
      <div className={styles.primaryColumn}>
        {(route || flightPlan) && <section className={`aircraft-card aircraft-route-card ${styles.currentFlightCard}`} aria-labelledby="aircraft-current-flight-title">
          <h2 id="aircraft-current-flight-title">{t.aircraft.currentFlightTitle}</h2>
          {route && <div className="aircraft-route-endpoints">
            <RouteEndpoint code={route.origin} airport={route.originAirport} />
            <span className="aircraft-route-arrow" aria-hidden="true">↓</span>
            <RouteEndpoint code={route.destination} airport={route.destinationAirport} />
          </div>}

          {flightAware && <FlightSection title={t.aircraft.flightStatusTitle}>
            <div className={`detail-grid ${styles.statusGrid}`}>
              {flightAware.identIata && <DetailValue label={t.aircraft.flightLabel}>{flightAware.identIata}</DetailValue>}
              {flightAware.identIcao && <DetailValue label={t.aircraft.icaoIdentLabel}>{flightAware.identIcao}</DetailValue>}
              {flightAware.operator && <DetailValue label={t.aircraft.operator}>{flightAware.operator}</DetailValue>}
              {flightAware.status && <DetailValue label={t.aircraft.statusLabel}>
                <span className={flightAware.cancelled || flightAware.diverted ? styles.alertStatus : styles.flightStatus}>
                  {flightAware.cancelled ? t.aircraft.cancelled : flightAware.diverted ? t.aircraft.diverted : flightAware.status}
                </span>
              </DetailValue>}
              {flightAware.progressPercent !== undefined && <DetailValue label={t.aircraft.progressLabel}>{formatNumber(flightAware.progressPercent, 0)}%</DetailValue>}
              {flightAware.codesharesIata?.length ? <DetailValue label="Codeshare">{flightAware.codesharesIata.slice(0, 8).join(" · ")}</DetailValue> : null}
            </div>
          </FlightSection>}

          {flightAware?.schedule && <FlightSection title={t.aircraft.scheduleTitle}>
            <div className={styles.scheduleGrid}>
              {(["out", "off", "on", "in"] as const).map((phase) => {
                const titleForPhase = phase === "out" ? t.aircraft.gateDeparture : phase === "off" ? t.aircraft.takeoff : phase === "on" ? t.aircraft.landing : t.aircraft.gateArrival;
                const timezone = phase === "out" || phase === "off" ? flightAware.origin?.timezone : flightAware.destination?.timezone;
                const values = (["scheduled", "estimated", "actual"] as const)
                  .map((kind) => [kind, formatFlightAwareTime(flightAware.schedule?.[`${kind}_${phase}`], timezone)] as const)
                  .filter(([, value]) => value);
                if (!values.length) return null;
                return <div className={styles.schedulePhase} key={phase}>
                  <strong>{titleForPhase}</strong>
                  {values.map(([kind, value]) => <DetailValue key={kind} label={scheduleKindLabel(kind)}>{value}</DetailValue>)}
                </div>;
              })}
            </div>
            {(formatDelay(flightAware.departureDelaySeconds) || formatDelay(flightAware.arrivalDelaySeconds)) && <div className={styles.delayRow}>
              {formatDelay(flightAware.departureDelaySeconds) && <DetailValue label={t.aircraft.departureDelay}>{formatDelay(flightAware.departureDelaySeconds)}</DetailValue>}
              {formatDelay(flightAware.arrivalDelaySeconds) && <DetailValue label={t.aircraft.arrivalDelay}>{formatDelay(flightAware.arrivalDelaySeconds)}</DetailValue>}
            </div>}
          </FlightSection>}

          {flightPlan && hasFlightPlanDetails && <FlightSection title={t.flightPlan.title}>
            <div className={`detail-grid ${styles.flightPlanGrid}`}>
              {hasFiniteFlightPlanValue(flightAware?.filedAltitude) && <DetailValue label={t.flightPlan.filedAltitude}>{formatFiledAltitude(flightAware.filedAltitude)}</DetailValue>}
              {hasFiniteFlightPlanValue(flightAware?.filedAirspeed) && <DetailValue label={t.flightPlan.filedAirspeed}>{formatFiledAirspeed(flightAware.filedAirspeed)}</DetailValue>}
              {hasFiniteFlightPlanValue(flightAware?.filedEteSeconds) && <DetailValue label={t.flightPlan.filedEte}>{formatFiledEte(flightAware.filedEteSeconds)}</DetailValue>}
              {hasFiniteFlightPlanValue(flightAware?.routeDistance) && <DetailValue label={t.flightPlan.routeDistance}>{formatRouteDistance(flightAware.routeDistance)}</DetailValue>}
              {flightPlan.filedRoute && <DetailValue className={styles.longValue} label={t.flightPlan.filedRoute}>{flightPlan.filedRoute}</DetailValue>}
              {flightPlan.waypoints.length > 0 && <DetailValue className={styles.longValue} label={t.flightPlan.waypoints}>{flightPlan.waypoints.join(" · ")}</DetailValue>}
            </div>
          </FlightSection>}

          {hasAirportOperations && operational && <FlightSection title={t.aircraft.airportOperationsTitle}>
            <div className={`detail-grid ${styles.operationsGrid}`}>
              {operational.originTerminal && <DetailValue label={t.aircraft.originTerminal}>{operational.originTerminal}</DetailValue>}
              {operational.originGate && <DetailValue label={t.aircraft.originGate}>{operational.originGate}</DetailValue>}
              {operational.departureRunway && <DetailValue label={t.aircraft.departureRunway}>{operational.departureRunway}</DetailValue>}
              {operational.destinationTerminal && <DetailValue label={t.aircraft.destinationTerminal}>{operational.destinationTerminal}</DetailValue>}
              {operational.destinationGate && <DetailValue label={t.aircraft.destinationGate}>{operational.destinationGate}</DetailValue>}
              {operational.arrivalRunway && <DetailValue label={t.aircraft.arrivalRunway}>{operational.arrivalRunway}</DetailValue>}
              {operational.baggageClaim && <DetailValue label={t.aircraft.baggageClaim}>{operational.baggageClaim}</DetailValue>}
            </div>
          </FlightSection>}

          <div className="detail-disclaimer">{t.aircraft.routeDisclaimer}</div>
        </section>}
      </div>

      <aside className={styles.secondaryColumn}>
        <section className="aircraft-card" aria-labelledby="aircraft-v3-information-title">
          <h2 id="aircraft-v3-information-title">{t.aircraft.aircraftTitle}</h2>
          <div className={`detail-grid aircraft-detail-grid ${styles.compactGrid}`}>
            <DetailValue label={t.aircraft.icaoHex}>{icaoHex}</DetailValue>
            <DetailValue label={t.aircraft.registration}>{valueOrEmpty(registration)}</DetailValue>
            <DetailValue label={t.aircraft.aircraftType}>{valueOrEmpty(aircraftType)}</DetailValue>
            <DetailValue label={t.aircraft.manufacturer}>{valueOrEmpty(manufacturer)}</DetailValue>
            <DetailValue label={t.aircraft.modelType}>{valueOrEmpty(model)}</DetailValue>
            <DetailValue label={t.aircraft.operator}>{valueOrEmpty(operator)}</DetailValue>
            <DetailValue label={t.aircraft.registrationCountry}>{valueOrEmpty(registrationCountry)}</DetailValue>
          </div>
          {liveAircraft && <div className={styles.secondaryLiveGrid}>
            <DetailValue label={t.aircraft.distance}>{formatDistance(liveAircraft.distanceKm)}</DetailValue>
            <DetailValue label={t.aircraft.squawk}>{valueOrEmpty(liveAircraft.squawk)}</DetailValue>
            <DetailValue label={t.aircraft.emergency}>{valueOrEmpty(liveAircraft.emergency)}</DetailValue>
            <DetailValue label={t.aircraft.source}>{valueOrEmpty(liveAircraft.sourceType ?? liveAircraft.source)}</DetailValue>
          </div>}
          <div className="watchlist-actions"><Link className="primary-button" href={watchlistHref}>{t.watchlist.followAircraft}</Link></div>
        </section>

        <AirspaceCard icaoHex={icaoHex} enabled={Boolean(liveAircraft)} />
        {route && <FlightRouteWeather originAirport={route.originAirport} destinationAirport={route.destinationAirport} />}
      </aside>
    </div>

    <section className={styles.trackingSection} aria-labelledby="aircraft-live-tracking-v3-title">
      <h2 id="aircraft-live-tracking-v3-title">{t.aircraft.liveTrackingTitle}</h2>
      <div className={styles.trackingGrid}>
        <AircraftAltitudeChart points={[...historyPoints, ...sessionPoints]} livePoint={livePoint} loading={flightHistoryLoading} />
        <section className="aircraft-card" aria-label={t.aircraft.liveTrackingTitle}>
          <div className="aircraft-history-stats">
            <DetailValue label={t.aircraft.firstSeen}>{formatTime(firstSeen)}</DetailValue>
            <DetailValue label={t.aircraft.trackedFor}>{durationBetween(firstSeen, lastSeen)}</DetailValue>
            <DetailValue label={t.aircraft.lastUpdate}>{liveAircraft ? formatAge(liveAircraft.seenSeconds) : formatTime(lastSeen)}</DetailValue>
            <DetailValue label={t.aircraft.positions}>{formatNumber(positionCount)}</DetailValue>
          </div>
          <div className="aircraft-trail-actions"><Link className="primary-button" href={`/history?hex=${encodeURIComponent(icaoHex)}`}>{t.aircraft.showFullTrail}</Link></div>
        </section>
      </div>
    </section>

    <section className={styles.historySection} aria-label={t.history.aircraftHistory}>
      <div className={styles.sectionHeading}><h2>{t.history.aircraftHistory}</h2></div>
      <div className={styles.historyGrid}>
        <AircraftHistorySummaryCard icaoHex={icaoHex} summary={detail?.historySummary ?? null} />
        <section className="aircraft-card aircraft-recent-card" aria-label={t.history.recentFlights}>
          <AircraftRecentFlights recentFlights={detail?.recentFlights ?? []} loading={loading} error={error} />
        </section>
        <div className={styles.lifetimeCard}><AircraftLifetimeStatsCard stats={detail?.lifetimeStats ?? null} /></div>
      </div>
    </section>

    <DataSources
      metadataSource={metadata?.source}
      routeSource={route?.source ?? flightPlan?.source}
      positionSource={sourceLabel}
      photoAvailable={photoAvailable}
    />
  </main>;
}

function durationBetween(startValue: string | null | undefined, endValue: string | null | undefined): string {
  if (!startValue || !endValue) return t.common.emptyValue;
  const start = Date.parse(startValue);
  const end = Date.parse(endValue);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return t.common.emptyValue;
  const minutes = Math.max(0, Math.round((end - start) / 60_000));
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (!hours) return `${remainingMinutes} min`;
  return `${hours} h ${remainingMinutes} min`;
}
