"use client";

import type { AirspaceActivityResponse } from "@/lib/airspace-activity/types";
import type { AircraftColorMode } from "@/lib/aircraft/color-mode";
import { MapControl, UiIcon } from "@/components/ui-primitives";
import type { DatasetState } from "@/components/use-dataset-query";
import { formatDateTime, formatNumber, t } from "@/lib/i18n";
import { airspaceActivityMapT as activityT } from "@/lib/i18n/airspace-activity";
import type { WindLevelHpa } from "@/lib/server/wind-aloft";
import type { RadarMapAppearance } from "@/lib/radar/map-appearance";
import type { Radar3dMode } from "@/lib/radar/terrain-v6-d";
import { Radar3dDeviceCheck } from "@/components/radar/radar-3d-device-check";

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
  radar3dMode: Radar3dMode;
  radar3dLicensedModels: boolean;
  onRadar3dLicensedModelsChange: (enabled: boolean) => void;
  radar3dCamera: "free" | "follow";
  radar3dCameraAvailable: boolean;
  onRadar3dCameraChange: (mode: "free" | "follow") => void;
  onRadar3dModeChange: (mode: Radar3dMode) => void;
  mapAppearance: RadarMapAppearance;
  onMapAppearanceChange: (value: RadarMapAppearance) => void;
  showAircraft: boolean;
  onShowAircraftChange: (value: boolean) => void;
  showOgn: boolean;
  onShowOgnChange: (value: boolean) => void;
  showSondes: boolean;
  onShowSondesChange: (value: boolean) => void;
  sondesCount: number;
  sondesStatus: "idle" | "loading" | "ready" | "stale" | "unavailable";
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
  showNavData: boolean;
  onShowNavDataChange: (value: boolean) => void;
  navDataDataset: DatasetState<unknown>;
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
  radarProduct: WeatherRadarProduct;
  onRadarProductChange: (product: WeatherRadarProduct) => void;
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
  showAircraftWeather: boolean;
  onShowAircraftWeatherChange: (value: boolean) => void;
  showNavigationIntegrity: boolean;
  onShowNavigationIntegrityChange: (value: boolean) => void;
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
  radar3dMode,
  radar3dLicensedModels,
  onRadar3dLicensedModelsChange,
  radar3dCamera,
  radar3dCameraAvailable,
  onRadar3dCameraChange,
  onRadar3dModeChange,
  mapAppearance,
  onMapAppearanceChange,
  showAircraft,
  onShowAircraftChange,
  showOgn,
  onShowOgnChange,
  showSondes,
  onShowSondesChange,
  sondesCount,
  sondesStatus,
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
  showNavData,
  onShowNavDataChange,
  navDataDataset,
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
  radarProduct,
  onRadarProductChange,
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
  showAircraftWeather,
  onShowAircraftWeatherChange,
  showNavigationIntegrity,
  onShowNavigationIntegrityChange,
  showAupUup,
  onShowAupUupChange,
  airspaceDataset,
  receiverPositionAvailable,
  showRangeRings,
  onShowRangeRingsChange,
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
        <label data-testid="map-layer-sondes"><input type="checkbox" checked={showSondes} onChange={(event) => onShowSondesChange(event.target.checked)} /> {t.locale.startsWith("cs") ? "Meteorologické sondy" : "Weather balloons"}{showSondes && sondesCount > 0 ? ` · ${formatNumber(sondesCount)}` : ""}</label>
        {showSondes && <small className="map-layer-sublevel">{sondesStatus === "unavailable" ? (t.locale.startsWith("cs") ? "SondeHub není dostupný nebo povolený" : "SondeHub unavailable or not enabled") : sondesStatus === "loading" ? t.common.loading : t.locale.startsWith("cs") ? `SondeHub · ${sondesStatus === "stale" ? "starší snímek" : "časově označený snímek"} · CC BY-SA 2.0` : `SondeHub · ${sondesStatus === "stale" ? "stale snapshot" : "timestamped snapshot"} · CC BY-SA 2.0`}</small>}
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
        <label data-testid="map-layer-nav-data"><input type="checkbox" checked={showNavData} onChange={(event) => onShowNavDataChange(event.target.checked)} /> {datasetStateLabel(t.layers.navData, navDataDataset, (count) => String(count))}</label>
        {showNavData && navDataDataset.status === "unavailable" && <div className="map-layer-sublevel">{t.layers.navDataUnavailable}</div>}
        {showNavData && <div className="map-layer-sublevel"><small>{t.layers.navDataDescription}</small></div>}
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
          <label className="map-layer-mode"><span>{t.locale.startsWith("cs") ? "Radarový produkt" : "Radar product"}</span><select value={radarProduct} onChange={(event) => onRadarProductChange(event.target.value as WeatherRadarProduct)}><option value="MAX_Z_MASKED">MAX_Z · {t.locale.startsWith("cs") ? "maximální odrazivost" : "maximum reflectivity"}</option><option value="PSEUDOCAPPI_2KM">PseudoCAPPI · 2 km</option></select></label>
          <label className="map-layer-mode"><span>{t.layers.opacity}</span><input type="range" min="0.2" max="1" step="0.05" value={radarOpacity} aria-label={t.layers.opacity} onChange={(event) => onRadarOpacityChange(Number(event.target.value))} /></label>
          <span>{selectedRadarFrame ? `${t.layers.currentTimestamp}: ${formatDateTime(selectedRadarFrame.observedAt, t)}${selectedRadarFrame.stale ? ` · ${t.layers.radarStale}` : ""}` : radarStatus === "unavailable" ? t.layers.radarUnavailable : t.common.loading}</span>
        </div>}
        <label data-testid="map-layer-metar"><input type="checkbox" checked={showMetar} onChange={(event) => onShowMetarChange(event.target.checked)} /> {t.layers.metar}</label>
        <label data-testid="map-layer-wind"><input type="checkbox" checked={showWind} onChange={(event) => onShowWindChange(event.target.checked)} /> {t.layers.windAloft}</label>
        <label data-testid="map-layer-aircraft-weather"><input type="checkbox" checked={showAircraftWeather} onChange={(event) => onShowAircraftWeatherChange(event.target.checked)} /> {t.locale.startsWith("cs") ? "Počasí z letadel" : "Aircraft Weather"}</label>
        <label data-testid="map-layer-navigation-integrity"><input type="checkbox" checked={showNavigationIntegrity} onChange={(event) => onShowNavigationIntegrityChange(event.target.checked)} /> {t.layers.navigationIntegrity}</label>
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
        <label className="map-layer-mode" data-testid="map-appearance-v6"><span>{t.locale.startsWith("en") ? "Map background" : "Mapový podklad"}</span>
          <select value={mapAppearance} onChange={(event) => onMapAppearanceChange(event.target.value as RadarMapAppearance)}>
            <option value="dark">{t.locale.startsWith("en") ? "Dark" : "Tmavý"}</option>
            <option value="light">{t.locale.startsWith("en") ? "Light" : "Světlý"}</option>
            <option value="satellite">{t.locale.startsWith("en") ? "Satellite · 2020" : "Satelitní · 2020"}</option>
          </select>
        </label>
        <label className="map-layer-mode" data-testid="radar-v6-d-terrain"><span>{t.locale.startsWith("en") ? "Map perspective" : "Perspektiva mapy"}</span>
          <select value={radar3dMode} onChange={(event) => onRadar3dModeChange(event.target.value as Radar3dMode)}>
            <option value="2d">2D</option>
            <option value="3d">{t.locale.startsWith("en") ? "3D terrain (beta)" : "3D terén (beta)"}</option>
          </select>
        </label>
        {radar3dMode === "3d" && <label className="map-layer-mode" data-testid="radar-v6-d-camera"><span>{t.locale.startsWith("en") ? "3D camera" : "3D kamera"}</span>
          <select value={radar3dCamera} onChange={(event) => onRadar3dCameraChange(event.target.value as "free" | "follow")}>
            <option value="free">{t.locale.startsWith("en") ? "Free / map" : "Volná / mapa"}</option>
            <option value="follow" disabled={!radar3dCameraAvailable}>{t.locale.startsWith("en") ? "Follow selected aircraft" : "Sledovat vybrané letadlo"}</option>
          </select>
        </label>}
        {radar3dMode === "3d" && <label data-testid="radar-v6-glb-detail"><input type="checkbox" checked={radar3dLicensedModels} onChange={(event) => onRadar3dLicensedModelsChange(event.target.checked)} />
          {t.locale.startsWith("en") ? "Detailed aircraft models (online GLB)" : "Detailní modely letadel (online GLB)"}
        </label>}
        {radar3dMode === "3d" && <small>{t.locale.startsWith("en") ? "Altitude-aware low-poly 3D, maximum 12 aircraft. Detailed Airbus/Boeing GLBs load for up to two priority aircraft when enabled; others use local silhouettes." : "Výškově umístěné 3D modely, nejvýše 12 letadel. Detailní GLB Airbus/Boeing se načtou jen po zapnutí, nejvýše pro dvě prioritní letadla; ostatní zobrazí lokální siluety."}
        {radar3dLicensedModels && <> · <a href="https://github.com/amvlab/aircraft-models" target="_blank" rel="noopener noreferrer">amvlab</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a> ({t.locale.startsWith("en")?"normalized for AirRadar":"normalizováno pro AirRadar"})</>}
        </small>}
        {radar3dMode === "3d" && <Radar3dDeviceCheck />}
        {mapAppearance === "satellite" && <small>{t.locale.startsWith("en") ? "2020 non-live satellite mosaic · EOxCloudless · personal non-commercial use" : "Historický satelitní podklad 2020 · EOxCloudless · pouze nekomerční použití"}</small>}
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
