"use client";

import type { ReactNode, Ref } from "react";
import { formatNumber, t } from "@/lib/i18n";
import type { PublicStateSnapshot } from "@/lib/aircraft/types";
import { MapControlGroup, Panel, UiIcon } from "@/components/ui-primitives";

interface RadarMapHudProps {
  aircraftCount: number;
  activeTrafficCount: number;
  showSourceBreakdown: boolean;
  sourceStats?: PublicStateSnapshot["sourceStats"];
  drawerOpen: boolean;
  trafficTriggerRef: Ref<HTMLButtonElement>;
  onOpenTraffic: () => void;
  presetMenu: ReactNode;
  children: ReactNode;
}

/** Layers are always rendered, including when no aircraft has been selected. */
export function RadarMapHud({
  aircraftCount, activeTrafficCount, showSourceBreakdown, sourceStats,
  drawerOpen, trafficTriggerRef, onOpenTraffic,
  presetMenu, children,
}: RadarMapHudProps) {
  return (
    <div className="map-overlay-primary" data-testid="radar-map-hud">
      <Panel className="map-overlay-card map-summary-card">
        <div className="map-summary-item map-summary-count">
          <strong>{formatNumber(aircraftCount)}</strong>
          <span>{t.stats.trackingNow}</span>
        </div>
        {showSourceBreakdown && sourceStats && (
          <details className="source-counter-details">
            <summary aria-label={t.radar.trafficSourceLabel} title={t.radar.trafficSourceLabel}>
              <UiIcon name="statistics" />
              <span className="source-counter-label">{t.aircraft.source}</span>
            </summary>
            <div className="source-counter-strip" aria-label={t.radar.trafficSourceLabel}>
              <span><strong>{formatNumber(sourceStats.local)}</strong><small>LOCAL</small></span>
              <span><strong>{formatNumber(sourceStats.network)}</strong><small>NETWORK</small></span>
              <span><strong>{formatNumber(sourceStats.overlap)}</strong><small>OVERLAP</small></span>
              <span><strong>{formatNumber(sourceStats.total)}</strong><small>TOTAL</small></span>
            </div>
          </details>
        )}
      </Panel>
      <MapControlGroup className="map-control-group-primary">
        <button
          ref={trafficTriggerRef}
          type="button"
          className={`traffic-trigger map-control ${drawerOpen ? "active" : ""}`}
          aria-expanded={drawerOpen}
          aria-controls="radar-sidebar"
          aria-label={t.radar.trafficNearby}
          data-testid="traffic-trigger"
          onClick={() => onOpenTraffic()}
        >
          <span className="traffic-trigger-label">{t.radar.trafficNearby}</span>
          <strong>{formatNumber(activeTrafficCount)}</strong>
        </button>
      </MapControlGroup>
      {presetMenu}
      {children}
    </div>
  );
}
