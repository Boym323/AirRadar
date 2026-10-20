"use client";

import type { AircraftView } from "@/lib/aircraft/types";
import { formatAltitude, formatNumber, formatSpeed, t } from "@/lib/i18n";
import type { RouteCorridorSnapshot, TrajectoryConformanceSnapshot } from "@/lib/route-intelligence";
import styles from "./radar-flight-follow-hud.module.css";

interface RadarFlightFollowHudProps {
  aircraft: AircraftView;
  corridor: RouteCorridorSnapshot | null;
  conformance: TrajectoryConformanceSnapshot | null;
  following: boolean;
  compact?: boolean;
  onToggle: () => void;
}

function verticalRate(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  const arrow = value > 100 ? "↑" : value < -100 ? "↓" : "→";
  return `${arrow} ${value > 0 ? "+" : ""}${formatNumber(value)} ft/min`;
}

export function RadarFlightFollowHud({
  aircraft,
  corridor,
  conformance,
  following,
  compact = false,
  onToggle,
}: RadarFlightFollowHudProps) {
  const metadata = aircraft.enrichment?.metadata;
  const identity = aircraft.callsign || aircraft.registration || metadata?.registration || aircraft.icaoHex;
  const secondary = [
    aircraft.registration || metadata?.registration,
    metadata?.icaoTypeCode || metadata?.aircraftType || aircraft.aircraftType,
  ].filter(Boolean).join(" · ");
  const destination = aircraft.enrichment?.route?.destinationAirport?.icaoCode
    || aircraft.enrichment?.route?.destination
    || null;
  const nextPoint = corridor?.nextPoint?.name ?? null;
  const nextEta = corridor?.etaToNextMinutes;
  const climb = verticalRate(aircraft.verticalRate);
  const conformanceLabel = conformance ? t.routeConformance.statuses[conformance.status] : null;

  return <section
    className={`${styles.hud} ${following ? styles.following : ""} ${compact ? styles.compact : ""}`}
    aria-label={t.radar.followHudLabel}
    data-testid="radar-flight-follow-hud"
    data-following={following ? "true" : "false"}
    data-compact={compact ? "true" : "false"}
  >
    <div className={styles.identity}>
      <span className={styles.kicker}>{t.radar.followMode}</span>
      <strong>{identity}</strong>
      {!compact && secondary && <small>{secondary}</small>}
    </div>

    {!compact && <div className={styles.telemetry} aria-label={t.radar.followTelemetry}>
      <strong>{formatAltitude(aircraft.altitude)}</strong>
      <span>{formatSpeed(aircraft.groundSpeed)}</span>
      {climb && <span>{climb}</span>}
    </div>}

    {!compact && <div className={styles.metrics}>
      {destination && <span className={styles.metric}>
        <small>{t.radar.followDestination}</small>
        <strong>{destination}</strong>
      </span>}
      {nextPoint && <span className={styles.metric}>
        <small>{t.radar.followNext}</small>
        <strong>{nextPoint}</strong>
        {nextEta !== null && nextEta !== undefined && <em>~{formatNumber(nextEta, 0)} min</em>}
      </span>}
      {conformanceLabel && <span className={styles.metric}>
        <small>{t.radar.followTrajectory}</small>
        <strong>{conformanceLabel}</strong>
      </span>}
    </div>}

    <button
      type="button"
      className={styles.toggle}
      aria-pressed={following}
      aria-label={following ? t.radar.followStopAria(identity) : t.radar.followStartAria(identity)}
      onClick={onToggle}
    >
      <span className={styles.followDot} aria-hidden="true" />
      {following ? t.radar.followStop : t.radar.followStart}
    </button>
  </section>;
}