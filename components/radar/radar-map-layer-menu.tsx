"use client";

import type { AircraftColorMode } from "@/lib/aircraft/color-mode";
import { MapControl, UiIcon } from "@/components/ui-primitives";
import type { DatasetState } from "@/components/use-dataset-query";
import { formatDateTime, formatNumber, t } from "@/lib/i18n";
import type { RadarMapAppearance } from "@/lib/radar/map-appearance";

interface AtsRoutesSummary {
  available: boolean;
  source?: { reference: string; effectiveDate: string };
  counts?: { routes: number; segments: number };
}

interface RadarFrameSummary {
  observedAt: string;
  stale: boolean;
}

interface RadarMapLayerMenuProps {
  mapAppearance: RadarMapAppearance;
  onMapAppearanceChange: (value: RadarMapAppearance) => void;
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
  atcDataset: DatasetState<unknown>;
  showAtsRoutes: boolean;
  onShowAtsRoutesChange: (value: boolean) => void;
  atsDataset: DatasetState<unknown>;
  showNavData: boolean;
  onShowNavDataChange: (value: boolean) => void;
  navDataDataset: DatasetState<unknown>;
  atsRoutes: AtsRoutesSummary | null | undefined;
  sigmetEnabled: boolean | null;
  showSigmet: boolean;
  onShowSigmetChange: (value: boolean) => void;
  showWeatherRadar: boolean;
  onShowWeatherRadarChange: (value: boolean) => void;
  radarProduct: "MAX_Z_MASKED" | "PSEUDOCAPPI_2KM";
  onRadarProductChange: (value: "MAX_Z_MASKED" | "PSEUDOCAPPI_2KM") => void;
  radarOpacity: number;
  onRadarOpacityChange: (value: number) => void;
  selectedRadarFrame: RadarFrameSummary | null;
  radarStatus: "idle" | "loading" | "ready" | "stale" | "unavailable";
  showMetar: boolean;
  onShowMetarChange: (value: boolean) => void;
  metarStatus: "idle" | "loading" | "ready" | "stale" | "unavailable";
  showAircraftWeather: boolean;
  onShowAircraftWeatherChange: (value: boolean) => void;
  showNavigationIntegrity: boolean;
  onShowNavigationIntegrityChange: (value: boolean) => void;
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
  mapAppearance,
  onMapAppearanceChange,
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
  atcDataset,
  showAtsRoutes,
  onShowAtsRoutesChange,
  atsDataset,
  showNavData,
  onShowNavDataChange,
  navDataDataset,
  atsRoutes,
  sigmetEnabled,
  showSigmet,
  onShowSigmetChange,
  showWeatherRadar,
  onShowWeatherRadarChange,
  radarProduct,
  onRadarProductChange,
  radarOpacity,
  onRadarOpacityChange,
  selectedRadarFrame,
  radarStatus,
  showMetar,
  onShowMetarChange,
  metarStatus,
  showAircraftWeather,
  onShowAircraftWeatherChange,
  showNavigationIntegrity,
  onShowNavigationIntegrityChange,
  colorMode,
  onColorModeChange,
}: RadarMapLayerMenuProps) {
  return <details name="radar-map-menus" className="map-layers">
    <MapControl as="summary" aria-label={t.layers.title} title={t.layers.title}><UiIcon name="layers" /><span className="map-control-label">{t.layers.title}</span></MapControl>
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
        <div className="map-layer-subgroup-heading">{t.layers.groups.atsProcedures}</div>
        <label data-testid="map-layer-ats"><input type="checkbox" checked={showAtsRoutes} onChange={(event) => onShowAtsRoutesChange(event.target.checked)} /> {datasetStateLabel(t.layers.atsRoutes, atsDataset, (count) => t.layers.routesCount(formatNumber(count)))}</label>
        <label data-testid="map-layer-nav-data"><input type="checkbox" checked={showNavData} onChange={(event) => onShowNavDataChange(event.target.checked)} /> {datasetStateLabel(t.layers.navData, navDataDataset, (count) => String(count))}</label>
        {showNavData && navDataDataset.status === "unavailable" && <div className="map-layer-sublevel">{t.layers.navDataUnavailable}</div>}
        {showNavData && <div className="map-layer-sublevel"><small>{t.layers.navDataDescription}</small></div>}
        {showAtsRoutes && atsRoutes?.available && atsRoutes.counts && atsRoutes.source && <div className="map-layer-sublevel">{t.layers.atsRoutesSummary(String(atsRoutes.counts.routes), String(atsRoutes.counts.segments), atsRoutes.source.effectiveDate)}<br /><a href={atsRoutes.source.reference} target="_blank" rel="noreferrer">{t.layers.atsSource}</a></div>}
        {showAtsRoutes && atsRoutes && !atsRoutes.available && <div className="map-layer-sublevel">{t.layers.atsRoutesUnavailable}</div>}
        {sigmetEnabled !== false && <label data-testid="map-layer-sigmet"><input type="checkbox" checked={showSigmet} onChange={(event) => onShowSigmetChange(event.target.checked)} /> {t.layers.sigmet}</label>}
      </div>
      <div className="map-layer-group">
        <span className="map-layer-group-title">{t.layers.groups.weather}</span>
        <label data-testid="map-layer-weather-radar"><input type="checkbox" checked={showWeatherRadar} onChange={(event) => onShowWeatherRadarChange(event.target.checked)} /> {t.layers.weatherRadar}</label>
        {showWeatherRadar && <div className="map-layer-sublevel weather-radar-controls">
          <label className="map-layer-mode"><span>{t.layers.radarProduct}</span><select value={radarProduct} aria-label={t.layers.radarProduct} onChange={(event) => onRadarProductChange(event.target.value as "MAX_Z_MASKED" | "PSEUDOCAPPI_2KM")}><option value="MAX_Z_MASKED">{t.layers.radarMaxZ}</option><option value="PSEUDOCAPPI_2KM">{t.layers.radarCappi2km}</option></select></label>
          {radarProduct === "PSEUDOCAPPI_2KM" && <small>{t.layers.radarCappiDisclaimer}</small>}
          <label className="map-layer-mode"><span>{t.layers.opacity}</span><input type="range" min="0.2" max="1" step="0.05" value={radarOpacity} aria-label={t.layers.opacity} onChange={(event) => onRadarOpacityChange(Number(event.target.value))} /></label>
          <span>{selectedRadarFrame ? `${t.layers.currentTimestamp}: ${formatDateTime(selectedRadarFrame.observedAt, t)}${selectedRadarFrame.stale ? ` · ${t.layers.radarStale}` : ""}` : radarStatus === "unavailable" ? t.layers.radarUnavailable : t.common.loading}</span>
        </div>}
        <label data-testid="map-layer-metar"><input type="checkbox" checked={showMetar} onChange={(event) => onShowMetarChange(event.target.checked)} /> {t.layers.metar}</label>
        <label data-testid="map-layer-aircraft-weather"><input type="checkbox" checked={showAircraftWeather} onChange={(event) => onShowAircraftWeatherChange(event.target.checked)} /> {t.locale.startsWith("cs") ? "Počasí z letadel" : "Aircraft Weather"}</label>
        <label data-testid="map-layer-navigation-integrity"><input type="checkbox" checked={showNavigationIntegrity} onChange={(event) => onShowNavigationIntegrityChange(event.target.checked)} /> {t.layers.navigationIntegrity}</label>
        {showMetar && metarStatus === "unavailable" && <div className="map-layer-sublevel">{t.layers.metarUnavailable}</div>}
        {showMetar && <div className="map-layer-sublevel metar-legend"><span><i className="metar-dot vfr" /> {t.layers.vfr}</span><span><i className="metar-dot mvfr" /> {t.layers.mvfr}</span><span><i className="metar-dot ifr" /> {t.layers.ifr}</span><span><i className="metar-dot lifr" /> {t.layers.lifr}</span></div>}
      </div>
      <div className="map-layer-group">
        <span className="map-layer-group-title">{t.layers.groups.display}</span>
        <label className="map-layer-mode" data-testid="map-appearance-v6"><span>{t.locale.startsWith("en") ? "Map background" : "Mapový podklad"}</span>
          <select value={mapAppearance} onChange={(event) => onMapAppearanceChange(event.target.value as RadarMapAppearance)}>
            <option value="dark">{t.locale.startsWith("en") ? "Dark" : "Tmavý"}</option>
            <option value="light">{t.locale.startsWith("en") ? "Light" : "Světlý"}</option>
            <option value="satellite">{t.locale.startsWith("en") ? "Satellite · 2020" : "Satelitní · 2020"}</option>
          </select>
        </label>
        {mapAppearance === "satellite" && <small>{t.locale.startsWith("en") ? "2020 non-live satellite mosaic · EOxCloudless · personal non-commercial use" : "Historický satelitní podklad 2020 · EOxCloudless · pouze nekomerční použití"}</small>}
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
