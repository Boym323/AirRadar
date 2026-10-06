"use client";

import type { AircraftView } from "@/lib/aircraft/types";
import { formatAltitude, formatNumber, formatSpeed, formatTime, t } from "@/lib/i18n";
import type { OperationalTwinApiResponse, OperationalTwinConfidence } from "@/lib/operational-twin";
import type { RouteCorridorSnapshot, TrajectoryConformanceSnapshot } from "@/lib/route-intelligence";
import styles from "./radar-flight-follow-hud.module.css";

interface RadarFlightFollowHudProps {
  aircraft: AircraftView;
  corridor: RouteCorridorSnapshot | null;
  conformance: TrajectoryConformanceSnapshot | null;
  operationalTwin: OperationalTwinApiResponse | null;
  following: boolean;
  onToggle: () => void;
}

function confidenceLabel(confidence: OperationalTwinConfidence): string {
  return t.radar.followConfidence[confidence];
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
  operationalTwin,
  following,
  onToggle,
}: RadarFlightFollowHudProps) {
  const twin = operationalTwin?.status === "available" ? operationalTwin : null;
  const etaEvent = twin?.events.find((event) => event.type === "ARRIVAL_ETA" && event.provenance === "PREDICTED") ?? null;
  const runwayEvent = twin?.events.find((event) => event.type === "RUNWAY_EXPECTATION" && event.provenance === "PREDICTED") ?? null;
  const weatherEvent = twin?.weatherCorridor.events
    .filter((event) => event.offsetMinutes >= 0)
    .sort((a, b) => a.offsetMinutes - b.offsetMinutes)[0] ?? null;

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
  const runway = runwayEvent?.title.startsWith("RWY ") ? runwayEvent.title.slice(4) : runwayEvent?.title ?? null;
  const climb = verticalRate(aircraft.verticalRate);
  const weather = weatherEvent
    ? `${t.radar.followWeatherRisks[weatherEvent.risk]} · ${t.radar.followSeverity[weatherEvent.severity]} · ~${formatNumber(weatherEvent.offsetMinutes, 0)} min`
    : null;
  const conformanceLabel = conformance ? t.routeConformance.statuses[conformance.status] : null;

  return <section
    className={`${styles.hud} ${following ? styles.following : ""}`}
    aria-label={t.radar.followHudLabel}
    data-testid="radar-flight-follow-hud"
    data-following={following ? "true" : "false"}
  >
    <div className={styles.identity}>
      <span className={styles.kicker}>{t.radar.followMode}</span>
      <strong>{identity}</strong>
      {secondary && <small>{secondary}</small>}
    </div>

    <div className={styles.telemetry} aria-label={t.radar.followTelemetry}>
      <strong>{formatAltitude(aircraft.altitude)}</strong>
      <span>{formatSpeed(aircraft.groundSpeed)}</span>
      {climb && <span>{climb}</span>}
    </div>

    <div className={styles.metrics}>
      {destination && <span className={styles.metric}>
        <small>{t.radar.followDestination}</small>
        <strong>{destination}</strong>
      </span>}
      {nextPoint && <span className={styles.metric}>
        <small>{t.radar.followNext}</small>
        <strong>{nextPoint}</strong>
        {nextEta !== null && nextEta !== undefined && <em>~{formatNumber(nextEta, 0)} min</em>}
      </span>}
      {etaEvent && <span className={styles.metric}>
        <small>{t.radar.followEta}</small>
        <strong>{formatTime(etaEvent.at)}</strong>
        <em>{etaEvent.detail ?? confidenceLabel(etaEvent.confidence)}</em>
      </span>}
      {runway && <span className={styles.metric}>
        <small>{t.radar.followRunway}</small>
        <strong>{runway}</strong>
        <em>{confidenceLabel(runwayEvent!.confidence)}</em>
      </span>}
      {weather && <span className={styles.metric}>
        <small>{t.radar.followWeather}</small>
        <strong>{weather}</strong>
      </span>}
      {conformanceLabel && <span className={styles.metric}>
        <small>{t.radar.followTrajectory}</small>
        <strong>{conformanceLabel}</strong>
      </span>}
    </div>

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
