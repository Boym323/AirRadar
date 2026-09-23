"use client";

import type { AirspaceActivityResponse } from "@/lib/airspace-activity/types";
import type { AircraftColorMode } from "@/lib/aircraft/color-mode";
import { MapControl, UiIcon } from "@/components/ui-primitives";
import type { DatasetState } from "@/components/use-dataset-query";
import { formatDateTime, formatNumber, t } from "@/lib/i18n";
import { airspaceActivityMapT as activityT } from "@/lib/i18n/airspace-activity";
import type { WindLevelHpa } from "@/lib/server/wind-aloft";

interface AtsRoutesSummary {
  available: boolean;
  source?: { reference: string; effectiveDate: string };
  counts?: { routes: number; segments: number };
}

interface WindLayerData {
  model: string;
  modelRun: string | null;
  validAt: string;
  availableValidTimes: string[];
}

interface RadarFrameSummary {
  observedAt: string;
  stale: boolean;
}

interface RadarMapLayerMenuProps {
  showAircraft: boolean;
  onShowAircraftChange: (value: boolean) => void;
  showOgn: boolean;
  onShowOgnChange: (value: boolean) => void;
  showAirports: boolean;
  onShowAirportsChange: (value: boolean) => void;
  showSignificantAirports: boolean;
  onShowSignificantAirportsChange: (value: boolean) => void;
  showSmallAirports: boolean;
  onShowSmallAirportsChange: (value: boolean) => void;
  showHeliports: boolean;
  onShowHeliportsChange: (value: boolean) => void;
  airportsDataset: DatasetState<unknown>;
  showAtc: boolean;
  onShowAtcChange: (value: boolean) => void;
  showAtcTraffic: boolean;
  onShowAtcTrafficChange: (value: boolean) => void;
  atcDataset: DatasetState<unknown>;
  sectorTrafficState: "idle" | "loading" | "ready" | "stale" | "unavailable";
  airspaceActivity: AirspaceActivityResponse | null;
  showAtsRoutes: boolean;
  onShowAtsRoutesChange: (value: boolean) => void;
  atsDataset: DatasetState<unknown>;
  atsRoutes: AtsRoutesSummary | null | undefined;
  showSids: boolean;
  onShowSidsChange: (value: boolean) => void;
  showStars: boolean;
  onShowStarsChange: (value: boolean) => void;
  sigmetEnabled: boolean | null;
  showSigmet: boolean;
  onShowSigmetChange: (value: boolean) => void;
  showWeatherRadar: boolean;
  onShowWeatherRadarChange: (value: boolean) => void;
  radarOpacity: number;
  onRadarOpacityChange: (value: number) => void;
  selectedRadarFrame: RadarFrameSummary | null;
  radarStatus: "idle" | "loading" | "ready" | "stale" | "unavailable";
  showMetar: boolean;
  onShowMetarChange: (value: boolean) => void;
  metarStatus: "idle" | "loading" | "ready" | "stale" | "unavailable";
  showWind: boolean;
  onShowWindChange: (value: boolean) => void;
  windLevel: WindLevelHpa;
  windPressureLevels: readonly WindLevelHpa[];
  onWindLevelChange: (value: WindLevelHpa) => void;
  windValidAt: string | null;
  onWindValidAtChange: (value: string | null) => void;
  windData: WindLayerData | null;
  windStatus: "idle" | "loading" | "ready" | "stale" | "unavailable";
  showAupUup: boolean;
  onShowAupUupChange: (value: boolean) => void;
  airspaceDataset: DatasetState<unknown>;
  receiverPositionAvailable: boolean;
  showRangeRings: boolean;
  onShowRangeRingsChange: (value: boolean) => void;
  colorMode: AircraftColorMode;
  onColorModeChange: (value: AircraftColorMode) => void;
}

function datasetStateLabel(label: string, dataset: DatasetState<unknown>, countLabel: (count: number) => string): string {
  if ((dataset.status === "ready" || dataset.status === "stale") && dataset.itemCount > 0) return `${label} · ${countLabel(dataset.itemCount)}`;
  if (dataset.status === "retrying" || dataset.status === "loading" || dataset.status === "stale") return `${label} · ${t.layers.reconnecting}`;
  if (dataset.status === "unavailable") return `${label} · ${t.layers.unavailable}`;
  return label;
}

export function RadarMapLayerMenu({
  showAircraft,
  onShowAircraftChange,
  showOgn,
  onShowOgnChange,
  showAirports,
  onShowAirportsChange,
  showSignificantAirports,
  onShowSignificantAirportsChange,
  showSmallAirports,
  onShowSmallAirportsChange,
  showHeliports,
  onShowHeliportsChange,
  airportsDataset,
  showAtc,
  onShowAtcChange,
  showAtcTraffic,
  onShowAtcTrafficChange,
  atcDataset,
  sectorTrafficState,
  airspaceActivity,
  showAtsRoutes,
  onShowAtsRoutesChange,
  atsDataset,
  atsRoutes,
  showSids,
  onShowSidsChange,
  showStars,
  onShowStarsChange,
  sigmetEnabled,
  showSigmet,
  onShowSigmetChange,
  showWeatherRadar,
  onShowWeatherRadarChange,
  radarOpacity,
  onRadarOpacityChange,
  selectedRadarFrame,
  radarStatus,
  showMetar,
  onShowMetarChange,
  metarStatus,
  showWind,
  onShowWindChange,
  windLevel,
  windPressureLevels,
  onWindLevelChange,
  windValidAt,
  onWindValidAtChange,
  windData,
  windStatus,
  showAupUup,
  onShowAupUupChange,
  airspaceDataset,
  receiverPositionAvailable,
  showRangeRings,
  onShowRangeRingsChange,
  colorMode,
  onColorModeChange,
}: RadarMapLayerMenuProps) {
  return <details className="map-layers">
    <MapControl as="summary"><UiIcon name="layers" />{t.layers.title}</MapControl>
    <div className="map-layers-menu" role="group" aria-label={t.layers.title}>
      <div className="map-layer-group">
        <span className="map-layer-group-title">{t.layers.groups.traffic}</span>
        <label><input type="checkbox" checked={showAircraft} onChange={(event) => onShowAircraftChange(event.target.checked)} /> {t.layers.aircraft}</label>
        <label><input type="checkbox" checked={showOgn} onChange={(event) => onShowOgnChange(event.target.checked)} /> {t.layers.ogn}</label>
      </div>
      <div className="map-layer-group">
        <span className="map-layer-group-title">{t.layers.groups.aviation}</span>
        <label data-testid="map-layer-airports"><input type="checkbox" checked={showAirports} onChange={(event) => onShowAirportsChange(event.target.checked)} /> {datasetStateLabel(t.layers.airports, airportsDataset, (count) => t.layers.airportsCount(formatNumber(count)))}</label>
        <label className="map-layer-sublevel"><input type="checkbox" checked={showSignificantAirports} disabled={!showAirports} onChange={(event) => onShowSignificantAirportsChange(event.target.checked)} /> {t.layers.significantAirports}</label>
        <label className="map-layer-sublevel"><input type="checkbox" checked={showSmallAirports} disabled={!showAirports} onChange={(event) => onShowSmallAirportsChange(event.target.checked)} /> {t.layers.smallAirports}</label>
        <label className="map-layer-sublevel"><input type="checkbox" checked={showHeliports} disabled={!showAirports} onChange={(event) => onShowHeliportsChange(event.target.checked)} /> {t.layers.heliports}</label>
        <div className="map-layer-subgroup-heading">{t.layers.groups.atcAirspace}</div>
        <label data-testid="map-layer-atc"><input type="checkbox" checked={showAtc} onChange={(event) => onShowAtcChange(event.target.checked)} /> {datasetStateLabel(t.layers.atc, atcDataset, (count) => t.layers.sectorsCount(formatNumber(count)))}</label>
        <label data-testid="map-layer-atc-traffic"><input type="checkbox" checked={showAtcTraffic} onChange={(event) => onShowAtcTrafficChange(event.target.checked)} /> {t.layers.atcTraffic}</label>
        {showAtcTraffic && <div className="map-layer-sublevel">{t.layers.atcTrafficLegend}<br /><small>{t.layers.atcTrafficDescription}<br />{t.layers.atcTrafficDisclaimer}{sectorTrafficState === "stale" ? " · STALE" : sectorTrafficState === "unavailable" ? ` · ${t.layers.atcTrafficNoData}` : ""}</small></div>}
        {showAtc && airspaceActivity?.planned.status !== "unavailable" && <div className="map-layer-sublevel">{activityT.legendCurrent} · {activityT.legendUpcoming}{airspaceActivity?.planned.status === "stale" ? ` · ${activityT.stale}` : ""}<br /><small>{activityT.disclaimer}</small></div>}
        <div className="map-layer-subgroup-heading">{t.layers.groups.atsProcedures}</div>
        <label data-testid="map-layer-ats"><input type="checkbox" checked={showAtsRoutes} onChange={(event) => onShowAtsRoutesChange(event.target.checked)} /> {datasetStateLabel(t.layers.atsRoutes, atsDataset, (count) => t.layers.routesCount(formatNumber(count)))}</label>
        <label data-testid="map-layer-sid"><input type="checkbox" checked={showSids} onChange={(event) => onShowSidsChange(event.target.checked)} /> {t.layers.sids}</label>
        <label data-testid="map-layer-star"><input type="checkbox" checked={showStars} onChange={(event) => onShowStarsChange(event.target.checked)} /> {t.layers.stars}</label>
        {showAtsRoutes && atsRoutes?.available && atsRoutes.counts && atsRoutes.source && <div className="map-layer-sublevel">{t.layers.atsRoutesSummary(String(atsRoutes.counts.routes), String(atsRoutes.counts.segments), atsRoutes.source.effectiveDate)}<br /><a href={atsRoutes.source.reference} target="_blank" rel="noreferrer">{t.layers.atsSource}</a></div>}
        {showAtsRoutes && atsRoutes && !atsRoutes.available && <div className="map-layer-sublevel">{t.layers.atsRoutesUnavailable}</div>}
        {sigmetEnabled !== false && <label data-testid="map-layer-sigmet"><input type="checkbox" checked={showSigmet} onChange={(event) => onShowSigmetChange(event.target.checked)} /> {t.layers.sigmet}</label>}
      </div>
      <div className="map-layer-group">
        <span className="map-layer-group-title">{t.layers.groups.weather}</span>
        <label data-testid="map-layer-weather-radar"><input type="checkbox" checked={showWeatherRadar} onChange={(event) => onShowWeatherRadarChange(event.target.checked)} /> {t.layers.weatherRadar}</label>
        {showWeatherRadar && <div className="map-layer-sublevel weather-radar-controls">
          <label className="map-layer-mode"><span>{t.layers.opacity}</span><input type="range" min="0.2" max="1" step="0.05" value={radarOpacity} aria-label={t.layers.opacity} onChange={(event) => onRadarOpacityChange(Number(event.target.value))} /></label>
          <span>{selectedRadarFrame ? `${t.layers.currentTimestamp}: ${formatDateTime(selectedRadarFrame.observedAt, t)}${selectedRadarFrame.stale ? ` · ${t.layers.radarStale}` : ""}` : radarStatus === "unavailable" ? t.layers.radarUnavailable : t.common.loading}</span>
        </div>}
        <label data-testid="map-layer-metar"><input type="checkbox" checked={showMetar} onChange={(event) => onShowMetarChange(event.target.checked)} /> {t.layers.metar}</label>
        <label data-testid="map-layer-wind"><input type="checkbox" checked={showWind} onChange={(event) => onShowWindChange(event.target.checked)} /> {t.layers.windAloft}</label>
        {showWind && <div className="map-layer-sublevel wind-controls">
          <label className="map-layer-mode"><span>{t.layers.pressureLevel}</span><select value={windLevel} aria-label={t.layers.pressureLevel} onChange={(event) => { onWindLevelChange(Number(event.target.value) as WindLevelHpa); onWindValidAtChange(null); }}>{windPressureLevels.map((level) => <option key={level} value={level}>{level} hPa</option>)}</select></label>
          {windData && <label className="map-layer-mode"><span>{t.layers.valid}</span><select value={windValidAt ?? windData.validAt} aria-label={t.layers.valid} onChange={(event) => onWindValidAtChange(event.target.value)}>{windData.availableValidTimes.map((valid) => <option key={valid} value={valid}>{formatDateTime(valid, t)}</option>)}</select></label>}
          {windData && <span>{windData.model} · {t.layers.windModelForecast}{windData.modelRun ? ` · ${t.layers.modelRun}: ${formatDateTime(windData.modelRun, t)}` : ""} · {t.layers.valid}: {formatDateTime(windData.validAt, t)}</span>}
          {windStatus === "unavailable" && <span>{t.layers.windUnavailable}</span>}
        </div>}
        {showMetar && metarStatus === "unavailable" && <div className="map-layer-sublevel">{t.layers.metarUnavailable}</div>}
        {showMetar && <div className="map-layer-sublevel metar-legend"><span><i className="metar-dot vfr" /> {t.layers.vfr}</span><span><i className="metar-dot mvfr" /> {t.layers.mvfr}</span><span><i className="metar-dot ifr" /> {t.layers.ifr}</span><span><i className="metar-dot lifr" /> {t.layers.lifr}</span></div>}
      </div>
      <div className="map-layer-group">
        <span className="map-layer-group-title">{t.layers.groups.operationalAirspace}</span>
        <label data-testid="map-layer-aup-uup"><input type="checkbox" checked={showAupUup} onChange={(event) => onShowAupUupChange(event.target.checked)} /> {t.layers.airspaceActivity}</label>
        {showAupUup && airspaceDataset.status === "unavailable" && <div className="map-layer-sublevel">{t.layers.airspaceUnavailable}</div>}
        {showAupUup && <div className="map-layer-sublevel">{t.layers.airspacePlannedActive} · {t.layers.airspaceDisclaimer}</div>}
      </div>
      <div className="map-layer-group">
        <span className="map-layer-group-title">{t.layers.groups.display}</span>
        {receiverPositionAvailable && <label><input type="checkbox" checked={showRangeRings} onChange={(event) => onShowRangeRingsChange(event.target.checked)} /> {t.layers.rangeRings}</label>}
        <label className="map-layer-mode"><span>{t.layers.colorMode}</span><select value={colorMode} aria-label={t.layers.colorMode} onChange={(event) => onColorModeChange(event.target.value as AircraftColorMode)}>
          <option value="default">{t.layers.colorModes.default}</option>
          <option value="altitude">{t.layers.colorModes.altitude}</option>
          <option value="speed">{t.layers.colorModes.speed}</option>
          <option value="verticalRate">{t.layers.colorModes.verticalRate}</option>
        </select></label>
      </div>
    </div>
  </details>;
}
