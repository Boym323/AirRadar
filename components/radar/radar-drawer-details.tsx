"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import type { AircraftRadarQuickDetailProps } from "@/components/aircraft-radar-quick-detail";
import type { RadarDrawerState } from "@/components/radar/use-radar-drawer-interactions";
import type { AircraftView } from "@/lib/aircraft/types";
import type { AtcContextResult } from "@/lib/atc-context/types";
import { formatAge, formatAltitude, formatCoordinate, formatDistance, formatNumber, formatSpeed, formatTrack, t } from "@/lib/i18n";
import type { OgnTargetView } from "@/lib/ogn/types";

const AircraftRadarQuickDetail = dynamic(() => import("@/components/aircraft-radar-quick-detail").then((module) => module.AircraftRadarQuickDetail));

interface RadarDrawerDetailsProps {
  drawerState: RadarDrawerState;
  selectedOgnTarget: OgnTargetView | null;
  ognLabel: (target: OgnTargetView) => string;
  selectedIdentity: string | null | undefined;
  selectedAircraft: AircraftView | null;
  databaseAircraft: AircraftRadarQuickDetailProps["databaseAircraft"];
  historyTrail: AircraftRadarQuickDetailProps["historyTrail"];
  atcContext: AtcContextResult | null;
  sectorTraffic: AircraftRadarQuickDetailProps["sectorTraffic"];
  watchlisted: boolean;
  onBack: () => void;
  onClose: () => void;
  onCenter: () => void;
  onToggleWatchlist: () => void;
}

export function RadarDrawerDetails({
  drawerState,
  selectedOgnTarget,
  ognLabel,
  selectedIdentity,
  selectedAircraft,
  databaseAircraft,
  historyTrail,
  atcContext,
  sectorTraffic,
  watchlisted,
  onBack,
  onClose,
  onCenter,
  onToggleWatchlist,
}: RadarDrawerDetailsProps) {
  if (drawerState !== "aircraft" && drawerState !== "ogn") return null;

  return <div className="detail-panel" key={selectedOgnTarget ? `ogn-${selectedOgnTarget.id}` : selectedIdentity}>
    {selectedOgnTarget ? <>
      <div className="detail-heading">
        <button type="button" className="detail-back-button" onClick={onBack}>← {t.radar.trafficNearby}</button>
        <div><div className="detail-eyebrow">{t.ogn.title}</div><div className="detail-callsign">{ognLabel(selectedOgnTarget)}</div><div className="detail-registration">{t.ogn.badge} · {t.ogn.trackingSources[selectedOgnTarget.trackingSource]}</div></div>
        <button className="close-button" onClick={onClose} aria-label={t.history.closePanel}>×</button>
      </div>
      <OgnDetailContent target={selectedOgnTarget} />
    </> : selectedAircraft ? <AircraftRadarQuickDetail
      aircraft={selectedAircraft}
      databaseAircraft={databaseAircraft}
      historyTrail={historyTrail}
      atcContext={atcContext}
      sectorTraffic={sectorTraffic}
      watchlisted={watchlisted}
      onBack={onBack}
      onClose={onClose}
      onCenter={onCenter}
      onToggleWatchlist={onToggleWatchlist}
    /> : <div className="detail-content">
      <div className="detail-disclaimer aircraft-offline-notice">{t.aircraft.notCurrentlyInRange}</div>
      <DetailSection title={t.history.aircraftDetail}>
        <DetailItem label={t.aircraft.icaoHex} value={selectedIdentity || t.common.emptyValue} />
        <DetailItem label={t.aircraft.registration} value={databaseAircraft?.registration || t.common.emptyValue} />
        <DetailItem label={t.aircraft.currentCallsign} value={t.common.emptyValue} />
        <DetailItem label={t.aircraft.aircraftType} value={databaseAircraft?.aircraftType || t.common.emptyValue} />
        <DetailItem label={t.aircraft.manufacturer} value={databaseAircraft?.manufacturer || t.common.emptyValue} />
        <DetailItem label={t.aircraft.modelType} value={databaseAircraft?.model || t.common.emptyValue} />
        <DetailItem label={t.aircraft.operator} value={databaseAircraft?.operator || t.common.emptyValue} />
        <DetailItem label={t.aircraft.registrationCountry} value={databaseAircraft?.registrationCountryCode || databaseAircraft?.registrationCountry || t.common.emptyValue} />
      </DetailSection>
      <div className="detail-footer"><Link className="history-link" href={`/aircraft/${encodeURIComponent(selectedIdentity || "")}`}>{t.history.aircraftDetail} →</Link></div>
    </div>}
  </div>;
}

function OgnDetailContent({ target }: { target: OgnTargetView }) {
  const typeLabel = target.aircraftType.replaceAll("_", " ");
  const ageSeconds = Math.max(0, (Date.now() - Date.parse(target.receivedAt)) / 1000);
  const position = `${formatCoordinate(target.latitude)}, ${formatCoordinate(target.longitude)}`;
  return <div className="detail-content ogn-detail-content">
    <div className="detail-hero">
      <div className="detail-hero-type">{typeLabel}</div>
      <div className="detail-hero-metrics">
        <div><strong>{formatAltitude(target.altitudeFt)}</strong><span>{t.ogn.altitude}</span></div>
        <div><strong>{formatSpeed(target.groundSpeedKt)}</strong><span>{t.ogn.groundSpeed}</span></div>
        <div><strong>{formatTrack(target.trackDeg)}</strong><span>{t.ogn.track}</span></div>
        <div><strong>{target.verticalRateFpm === null ? t.common.emptyValue : `${target.verticalRateFpm > 0 ? "+" : ""}${formatNumber(target.verticalRateFpm)} ft/min`}</strong><span>{t.ogn.verticalRate}</span></div>
      </div>
    </div>
    <DetailSection title={t.ogn.identity}>
      {target.identityVisible ? <>
        <DetailItem label={t.ogn.address} value={target.address || t.common.emptyValue} />
        <DetailItem label={t.ogn.addressType} value={target.addressType} />
        <DetailItem label={t.ogn.callsign} value={target.senderCallsign || t.common.emptyValue} />
        <DetailItem label={t.ogn.registration} value={target.registration || t.common.emptyValue} />
        <DetailItem label={t.ogn.competitionNumber} value={target.competitionNumber || t.common.emptyValue} />
        <DetailItem label={t.ogn.model} value={target.model || t.common.emptyValue} />
      </> : <div className="detail-disclaimer">{t.ogn.anonymous} · {t.ogn.hiddenIdentity}</div>}
    </DetailSection>
    <DetailSection title={t.ogn.position}>
      <DetailItem label={t.ogn.aircraftType} value={typeLabel} />
      <DetailItem label={t.ogn.position} value={position} />
      <DetailItem label={t.ogn.distance} value={formatDistance(target.distanceKm)} />
      <DetailItem label={t.ogn.bearing} value={formatTrack(target.bearing)} />
      <DetailItem label={t.ogn.lastSeen} value={formatAge(ageSeconds)} />
      {target.identityVisible && <DetailItem label={t.ogn.receiver} value={target.lastReceiver || t.common.emptyValue} />}
      <DetailItem label={t.ogn.title} value={`${t.ogn.trackingSources[target.trackingSource]}${target.stale ? ` · ${t.ogn.stale}` : ""}`} />
    </DetailSection>
    <div className="detail-disclaimer ogn-privacy-note">{t.ogn.sourceDisclaimer}</div>
  </div>;
}

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  if (value === t.common.emptyValue) return null;
  return <div><div className="detail-item-label">{label}</div><div className="detail-item-value">{value}</div></div>;
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="detail-section"><h3>{title}</h3><div className="detail-grid">{children}</div></section>;
}
