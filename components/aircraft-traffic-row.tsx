"use client";

import { memo, type CSSProperties } from "react";
import type { AircraftView } from "@/lib/aircraft/types";
import { formatAltitude, formatDistance, formatSpeed, formatTrack, t } from "@/lib/i18n";
import { aircraftPositionSourceLabel, aircraftSourceLabel } from "@/lib/aircraft/source-awareness";
import { aircraftGlyphPath, aircraftIconAsset, aircraftMarkerKind } from "@/lib/radar/aircraft-marker-controller";

interface AircraftTrafficRowProps {
  aircraft: AircraftView;
  selected: boolean;
  watchlisted: boolean;
  onSelect: (hex: string) => void;
}

function aircraftLabel(aircraft: AircraftView): string {
  return aircraft.callsign || aircraft.registration || aircraft.enrichment?.metadata?.registration || aircraft.icaoHex;
}

function AircraftIcon({ aircraft }: { aircraft: AircraftView }) {
  const asset = aircraftIconAsset(aircraft);
  if (asset) {
    return <span
      className="aircraft-glyph aircraft-glyph-asset"
      aria-hidden="true"
      style={{ "--aircraft-icon-mask": `url('${asset}')` } as CSSProperties}
    />;
  }
  const kind = aircraftMarkerKind(aircraft);
  return <svg className={`aircraft-glyph aircraft-glyph-${kind}`} viewBox="0 0 32 32" aria-hidden="true">
    <path d={aircraftGlyphPath(kind)} />
  </svg>;
}

function AircraftTrafficRowComponent({ aircraft, selected, watchlisted, onSelect }: AircraftTrafficRowProps) {
  return <button
    className={`aircraft-row ${selected ? "selected" : ""} ${watchlisted ? "watchlisted" : ""} ${aircraft.emergency ? "emergency" : ""}`}
    aria-pressed={selected}
    onClick={() => onSelect(aircraft.icaoHex)}
  >
    <span className="aircraft-row-icon"><AircraftIcon aircraft={aircraft} /></span>
    <span className="aircraft-row-main">
      <span className="aircraft-row-topline">
        <span className="aircraft-row-name">{aircraftLabel(aircraft)}</span>
        {" "}
        <span className="source-badge" title={`Seen by ${aircraftSourceLabel(aircraft)}`}>{aircraftPositionSourceLabel(aircraft)}</span>
        {" "}
        {watchlisted && <span className="watch-badge">{t.watchlist.badge}</span>}
        {aircraft.emergency && <><span aria-hidden="true"> </span><span className="emergency-badge"><span aria-hidden="true">!</span> {aircraft.emergency}</span></>}
      </span>
      <span className="aircraft-row-type">
        {aircraft.enrichment?.metadata?.icaoTypeCode || aircraft.aircraftType || t.aircraft.unknownType}
        {aircraft.registration || aircraft.enrichment?.metadata?.registration ? ` · ${aircraft.registration || aircraft.enrichment?.metadata?.registration}` : ""}
      </span>
      <span className="aircraft-row-meta">
        <span><b>{formatAltitude(aircraft.altitude)}</b></span>
        <span><b>{formatSpeed(aircraft.groundSpeed)}</b></span>
        <span><b>{formatTrack(aircraft.track)}</b></span>
        <span className="aircraft-row-hex">{aircraft.icaoHex}</span>
      </span>
    </span>
    <span className="aircraft-row-distance">{formatDistance(aircraft.distanceKm)}</span>
  </button>;
}

export const AircraftTrafficRow = memo(
  AircraftTrafficRowComponent,
  (previous, next) => previous.aircraft === next.aircraft
    && previous.selected === next.selected
    && previous.watchlisted === next.watchlisted
    && previous.onSelect === next.onSelect,
);
AircraftTrafficRow.displayName = "AircraftTrafficRow";
