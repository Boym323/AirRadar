"use client";

import dynamic from "next/dynamic";
import { useState, type Dispatch, type FormEvent, type RefObject, type SetStateAction } from "react";
import { AircraftTrafficList } from "@/components/aircraft-traffic-list";
import { RelevantAtcPanel } from "@/components/relevant-atc-panel";
import { UiIcon } from "@/components/ui-primitives";
import type { AircraftView, PublicStateSnapshot } from "@/lib/aircraft/types";
import type { AircraftQuickFilter, MapAircraftFilters } from "@/lib/aircraft/map-filters";
import { formatAltitude, formatDistance, formatNumber, formatSpeed, formatTrack, t, watchlistKindLabel, watchlistSummary } from "@/lib/i18n";
import type { OgnStateSnapshot, OgnTargetView } from "@/lib/ogn/types";

const IntelligenceFeed = dynamic(() => import("@/components/intelligence-feed").then((module) => module.IntelligenceFeed));
const LogbookSummary = dynamic(() => import("@/components/logbook-summary").then((module) => module.LogbookSummary));

type TrafficSource = "adsb" | "ogn";
type SortBy = "distance" | "altitude" | "callsign";

interface ActiveFilterChip {
  id: string;
  label: string;
  onRemove: () => void;
}

interface RadarTrafficBrowserProps {
  trafficSource: TrafficSource;
  search: string;
  onSearchChange: (value: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  sidebarBrowseRef: RefObject<HTMLDivElement | null>;
  mapFilters: MapAircraftFilters;
  onMapFilterChange: <Key extends keyof MapAircraftFilters>(key: Key, value: MapAircraftFilters[Key]) => void;
  filtersOpen: boolean;
  onFiltersOpenChange: Dispatch<SetStateAction<boolean>>;
  hasActiveMapFilters: boolean;
  activeFilterCount: number;
  watchlistOnly: boolean;
  onWatchlistOnlyChange: (value: boolean) => void;
  sortBy: SortBy;
  onSortByChange: (value: SortBy) => void;
  distanceFilter: string;
  onDistanceFilterChange: (value: string) => void;
  onResetMapFilters: () => void;
  watchlist: Array<{ kind: string; value: string }>;
  onWatchlistChange: Dispatch<SetStateAction<Array<{ kind: string; value: string }>>>;
  relevantAtcFrequencies: PublicStateSnapshot["relevantAtcFrequencies"];
  atcExpanded: boolean;
  onAtcOpen: () => void;
  filteredAircraft: readonly AircraftView[];
  totalAircraftCount: number;
  selectedHex: string | null;
  watchlistedHexes: ReadonlySet<string>;
  onSelectAircraft: (hex: string) => void;
  ognSnapshot: OgnStateSnapshot;
  filteredOgnTargets: readonly OgnTargetView[];
  selectedOgnId: string | null;
  onSelectOgn: (id: string) => void;
  ognLabel: (target: OgnTargetView) => string;
}

const QUICK_FILTERS: AircraftQuickFilter[] = ["all", "airborne", "onGround", "helicopters", "gliders", "uav", "emergency"];

export function RadarTrafficBrowser({
  trafficSource,
  search,
  onSearchChange,
  searchInputRef,
  sidebarBrowseRef,
  mapFilters,
  onMapFilterChange,
  filtersOpen,
  onFiltersOpenChange,
  hasActiveMapFilters,
  activeFilterCount,
  watchlistOnly,
  onWatchlistOnlyChange,
  sortBy,
  onSortByChange,
  distanceFilter,
  onDistanceFilterChange,
  onResetMapFilters,
  watchlist,
  onWatchlistChange,
  relevantAtcFrequencies,
  atcExpanded,
  onAtcOpen,
  filteredAircraft,
  totalAircraftCount,
  selectedHex,
  watchlistedHexes,
  onSelectAircraft,
  ognSnapshot,
  filteredOgnTargets,
  selectedOgnId,
  onSelectOgn,
  ognLabel,
}: RadarTrafficBrowserProps) {
  const [watchlistKind, setWatchlistKind] = useState("callsign");
  const [watchlistValue, setWatchlistValue] = useState("");
  const [intelligenceOpened, setIntelligenceOpened] = useState(false);
  const [logbookOpened, setLogbookOpened] = useState(false);

  const quickFilterLabels: Record<AircraftQuickFilter, string> = {
    all: t.filters.quickAll,
    airborne: t.filters.quickAirborne,
    onGround: t.filters.quickOnGround,
    helicopters: t.filters.quickHelicopters,
    gliders: t.filters.quickGliders,
    uav: t.filters.quickUav,
    emergency: t.filters.quickEmergency,
  };
  const activeFilterChips: ActiveFilterChip[] = [
    mapFilters.source !== "all" ? { id: "source", label: mapFilters.source.toUpperCase(), onRemove: () => onMapFilterChange("source", "all") } : null,
    mapFilters.quick !== "all" ? { id: "quick", label: quickFilterLabels[mapFilters.quick], onRemove: () => onMapFilterChange("quick", "all") } : null,
    mapFilters.status !== "all" ? { id: "status", label: mapFilters.status === "airborne" ? t.filters.statusAirborne : t.filters.statusOnGround, onRemove: () => onMapFilterChange("status", "all") } : null,
    mapFilters.minAltitude.trim() ? { id: "min-altitude", label: `≥ ${mapFilters.minAltitude} ft`, onRemove: () => onMapFilterChange("minAltitude", "") } : null,
    mapFilters.maxAltitude.trim() ? { id: "max-altitude", label: `≤ ${mapFilters.maxAltitude} ft`, onRemove: () => onMapFilterChange("maxAltitude", "") } : null,
    mapFilters.callsign.trim() ? { id: "callsign", label: `${t.filters.callsign}: ${mapFilters.callsign.trim()}`, onRemove: () => onMapFilterChange("callsign", "") } : null,
    mapFilters.registration.trim() ? { id: "registration", label: `${t.filters.registrationInput}: ${mapFilters.registration.trim()}`, onRemove: () => onMapFilterChange("registration", "") } : null,
    mapFilters.icaoHex.trim() ? { id: "icao", label: `${t.filters.icaoHexInput}: ${mapFilters.icaoHex.trim()}`, onRemove: () => onMapFilterChange("icaoHex", "") } : null,
    mapFilters.aircraftType.trim() ? { id: "type", label: mapFilters.aircraftType.trim(), onRemove: () => onMapFilterChange("aircraftType", "") } : null,
    mapFilters.operator.trim() ? { id: "operator", label: mapFilters.operator.trim(), onRemove: () => onMapFilterChange("operator", "") } : null,
    mapFilters.emergencyOnly ? { id: "emergency", label: t.filters.emergencyOnly, onRemove: () => onMapFilterChange("emergencyOnly", false) } : null,
    watchlistOnly ? { id: "watchlist", label: t.filters.watchlistOnly, onRemove: () => onWatchlistOnlyChange(false) } : null,
    search.trim() ? { id: "search", label: `${t.search.aircraftLabel}: ${search.trim()}`, onRemove: () => onSearchChange("") } : null,
    distanceFilter !== "all" ? { id: "distance", label: `${t.filters.maximumDistance}: ${distanceFilter} km`, onRemove: () => onDistanceFilterChange("all") } : null,
  ].filter((value): value is ActiveFilterChip => Boolean(value));

  function addWatchlistRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = watchlistValue.trim().toUpperCase();
    if (!value || watchlist.some((rule) => rule.kind === watchlistKind && rule.value === value)) return;
    onWatchlistChange((current) => [...current, { kind: watchlistKind, value }]);
    setWatchlistValue("");
  }

  return <div ref={sidebarBrowseRef} className="sidebar-browse">
    <div className="sidebar-header">
      <div className="search-wrap">
        <span className="search-icon" aria-hidden="true">⌕</span>
        <input ref={searchInputRef} className="search-input" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder={trafficSource === "ogn" ? t.search.ognPlaceholder : t.search.placeholder} aria-label={trafficSource === "ogn" ? t.search.ognLabel : t.search.aircraftLabel} />
        {search && <button type="button" className="search-clear-button" onClick={() => onSearchChange("")} aria-label={t.filters.clearSearch}><UiIcon name="close" /></button>}
      </div>
      {trafficSource === "adsb" && <div className="radar-options">
        <div className="quick-filter-row" role="group" aria-label={t.filters.title}>
          {QUICK_FILTERS.map((filter) => <button key={filter} type="button" className={`quick-filter-chip ${mapFilters.quick === filter ? "active" : ""}`} aria-pressed={mapFilters.quick === filter} onClick={() => onMapFilterChange("quick", filter)}>{quickFilterLabels[filter]}</button>)}
        </div>
        <button type="button" className="filter-button" aria-expanded={filtersOpen} aria-controls="map-filters-panel" onClick={() => onFiltersOpenChange((value) => !value)}>
          <span>{t.filters.title}{hasActiveMapFilters ? ` · ${activeFilterCount}` : ""}</span>
          {hasActiveMapFilters && <span className="filter-active-dot" aria-label={t.filters.active}>{t.filters.active}</span>}
        </button>
        {hasActiveMapFilters && <div className="active-filter-chips" aria-label={t.filters.active}>
          {activeFilterChips.map((chip) => <button type="button" className="filter-chip" key={chip.id} onClick={chip.onRemove} title={t.filters.clearAll}>{chip.label}<span aria-hidden="true"> ×</span><span className="sr-only">{t.filters.clearSearch}</span></button>)}
          {activeFilterChips.length > 1 && <button type="button" className="filter-chip-reset" onClick={onResetMapFilters}>{t.filters.clearAll}</button>}
        </div>}
        {filtersOpen && <div id="map-filters-panel" className="map-filters-panel" role="region" aria-label={t.filters.title}>
          <div className="filter-panel-heading">{t.filters.filterGroup}</div>
          <fieldset className="map-filter-group">
            <legend>{t.filters.status}</legend>
            <div className="map-filter-choice-row">
              <label><input type="radio" name="aircraft-status" value="all" checked={mapFilters.status === "all"} onChange={(event) => onMapFilterChange("status", event.target.value as MapAircraftFilters["status"])} /> {t.filters.statusAll}</label>
              <label><input type="radio" name="aircraft-status" value="airborne" checked={mapFilters.status === "airborne"} onChange={(event) => onMapFilterChange("status", event.target.value as MapAircraftFilters["status"])} /> {t.filters.statusAirborne}</label>
              <label><input type="radio" name="aircraft-status" value="onGround" checked={mapFilters.status === "onGround"} onChange={(event) => onMapFilterChange("status", event.target.value as MapAircraftFilters["status"])} /> {t.filters.statusOnGround}</label>
            </div>
          </fieldset>
          <fieldset className="map-filter-group">
            <legend>{t.filters.altitude}</legend>
            <div className="map-filter-fields">
              <label className="map-filter-field"><span>{t.filters.minimumAltitudeInput}</span><input type="number" inputMode="numeric" min="0" step="100" value={mapFilters.minAltitude} onChange={(event) => onMapFilterChange("minAltitude", event.target.value)} /></label>
              <label className="map-filter-field"><span>{t.filters.maximumAltitudeInput}</span><input type="number" inputMode="numeric" min="0" step="100" value={mapFilters.maxAltitude} onChange={(event) => onMapFilterChange("maxAltitude", event.target.value)} /></label>
            </div>
          </fieldset>
          <fieldset className="map-filter-group">
            <legend>{t.filters.identity}</legend>
            <div className="map-filter-fields">
              <label className="map-filter-field"><span>{t.filters.callsign}</span><input value={mapFilters.callsign} onChange={(event) => onMapFilterChange("callsign", event.target.value.toUpperCase())} autoComplete="off" /></label>
              <label className="map-filter-field"><span>{t.filters.registrationInput}</span><input value={mapFilters.registration} onChange={(event) => onMapFilterChange("registration", event.target.value.toUpperCase())} autoComplete="off" /></label>
              <label className="map-filter-field map-filter-field-wide"><span>{t.filters.icaoHexInput}</span><input value={mapFilters.icaoHex} onChange={(event) => onMapFilterChange("icaoHex", event.target.value.toUpperCase())} autoComplete="off" /></label>
            </div>
          </fieldset>
          <fieldset className="map-filter-group">
            <legend>{t.filters.aircraft}</legend>
            <div className="map-filter-fields">
              <label className="map-filter-field"><span>{t.filters.aircraftType}</span><input value={mapFilters.aircraftType} onChange={(event) => onMapFilterChange("aircraftType", event.target.value)} autoComplete="off" /></label>
              <label className="map-filter-field"><span>{t.filters.operator}</span><input value={mapFilters.operator} onChange={(event) => onMapFilterChange("operator", event.target.value)} autoComplete="off" /></label>
            </div>
          </fieldset>
          <fieldset className="map-filter-group">
            <legend>{t.filters.special}</legend>
            <label className="filter-toggle"><input type="checkbox" checked={mapFilters.emergencyOnly} onChange={(event) => onMapFilterChange("emergencyOnly", event.target.checked)} /> {t.filters.emergencyOnly}</label>
            <label className="filter-toggle"><input type="checkbox" checked={watchlistOnly} onChange={(event) => onWatchlistOnlyChange(event.target.checked)} /> {t.filters.watchlistOnly}</label>
          </fieldset>
          <div className="filter-panel-heading filter-panel-heading-sort">{t.filters.sortGroup}</div>
          <div className="map-filter-legacy-row">
            <label className="map-filter-field"><span>{t.filters.sortLabel}</span><select className="filter-select" value={sortBy} onChange={(event) => onSortByChange(event.target.value as SortBy)}><option value="distance">{t.filters.sortDistance}</option><option value="altitude">{t.filters.sortAltitude}</option><option value="callsign">{t.filters.sortCallsign}</option></select></label>
            <label className="map-filter-field"><span>{t.filters.maximumDistance}</span><select className="filter-select" value={distanceFilter} onChange={(event) => onDistanceFilterChange(event.target.value)}><option value="all">{t.filters.distanceAll}</option><option value="25">{t.filters.distanceWithin25}</option><option value="75">{t.filters.distanceWithin75}</option></select></label>
          </div>
          <button type="button" className="filter-reset-button" onClick={onResetMapFilters}>{t.filters.reset}</button>
        </div>}
      </div>}
      {trafficSource === "adsb" && <details className="watchlist-box">
        <summary>{t.watchlist.title} <span>{watchlistSummary(watchlist.length)}</span></summary>
        <form onSubmit={addWatchlistRule} className="watchlist-form">
          <select value={watchlistKind} onChange={(event) => setWatchlistKind(event.target.value)} aria-label={t.watchlist.ruleType}>
            <option value="icao">{t.watchlist.ruleKinds.icao}</option><option value="registration">{t.watchlist.ruleKinds.registration}</option><option value="callsign">{t.watchlist.exactCallsign}</option><option value="pattern">{t.watchlist.callsignPattern}</option><option value="type">{t.watchlist.ruleKinds.type}</option><option value="airline">{t.watchlist.ruleKinds.airline}</option>
          </select>
          <input value={watchlistValue} onChange={(event) => setWatchlistValue(event.target.value)} placeholder={watchlistKind === "pattern" ? "UAE*" : "A6-EVL"} aria-label={t.watchlist.value} />
          <button type="submit" className="watchlist-add">{t.watchlist.add}</button>
        </form>
        {watchlist.length > 0 && <div className="watchlist-rules">{watchlist.map((rule) => <button key={`${rule.kind}-${rule.value}`} type="button" onClick={() => onWatchlistChange((current) => current.filter((item) => item !== rule))}>{watchlistKindLabel(rule.kind)}: {rule.value} ×</button>)}</div>}
      </details>}
    </div>

    <RelevantAtcPanel summaries={relevantAtcFrequencies} expanded={atcExpanded} onOpen={onAtcOpen} />
    <details className="sidebar-secondary-tools" onToggle={(event) => setIntelligenceOpened(event.currentTarget.open)}>
      <summary>{t.intelligence.title}<span>{t.common.more}</span></summary>
      {intelligenceOpened && <IntelligenceFeed />}
    </details>

    {trafficSource === "ogn" ? (
      <div id="traffic-list" className="aircraft-list ogn-traffic-list">
        {filteredOgnTargets.length === 0 ? <div className="empty-list ogn-empty"><strong>{ognSnapshot.targets.length === 0 ? t.ogn.empty : t.ogn.noMatching}</strong></div> : filteredOgnTargets.map((target) => (
          <button key={target.id} type="button" className={`aircraft-row ogn-row ${selectedOgnId === target.id ? "selected" : ""} ${target.stale ? "stale" : ""}`} aria-pressed={selectedOgnId === target.id} onClick={() => onSelectOgn(target.id)}>
            <span className="aircraft-row-icon ogn-row-icon"><OgnGlyph aircraftType={target.aircraftType} /></span>
            <span className="aircraft-row-main">
              <span className="aircraft-row-topline"><span className="aircraft-row-name">{ognLabel(target)}</span> <span className="source-badge ogn-source-badge">{t.ogn.badge} · {t.ogn.trackingSources[target.trackingSource]}</span> {target.stale && <span className="ogn-stale-badge">{t.ogn.stale}</span>}</span>
              <span className="aircraft-row-type">{target.identityVisible && target.model ? `${target.aircraftType.replaceAll("_", " ")} · ${target.model}` : target.aircraftType.replaceAll("_", " ")}</span>
              <span className="aircraft-row-meta"><span><b>{formatAltitude(target.altitudeFt)}</b></span><span><b>{formatSpeed(target.groundSpeedKt)}</b></span><span><b>{formatTrack(target.trackDeg)}</b></span></span>
            </span>
            <span className="aircraft-row-distance">{formatDistance(target.distanceKm)}</span>
          </button>
        ))}
      </div>
    ) : (
      <AircraftTrafficList aircraft={filteredAircraft} totalAircraftCount={totalAircraftCount} selectedHex={selectedHex} watchlistedHexes={watchlistedHexes} onSelect={onSelectAircraft} scrollRootRef={sidebarBrowseRef} />
    )}

    <details className="sidebar-secondary-tools" onToggle={(event) => setLogbookOpened(event.currentTarget.open)}>
      <summary>{t.dashboard.logbookTitle}<span>{t.dashboard.openStatistics}</span></summary>
      {logbookOpened && <LogbookSummary />}
    </details>
  </div>;
}

function OgnGlyph({ aircraftType }: { aircraftType: OgnTargetView["aircraftType"] }) {
  return <svg className="ogn-glyph" viewBox="0 0 32 32" aria-hidden="true"><path d={ognGlyphPath(aircraftType)} /></svg>;
}

function ognGlyphPath(aircraftType: OgnTargetView["aircraftType"]): string {
  return aircraftType === "glider" || aircraftType === "paraglider" || aircraftType === "hang_glider"
    ? "M16 3 19 14 29 19 19 20 16 29 13 20 3 19 13 14Z"
    : aircraftType === "helicopter"
      ? "M5 9h22M16 9v5m-7 0h14l3 5H6l3-5Zm7 5v8m-5 0h10"
      : aircraftType === "balloon" || aircraftType === "airship"
        ? "M16 3c5 0 8 4 8 9 0 5-3 8-8 8s-8-3-8-8c0-5 3-9 8-9Zm0 17v6m-4 0h8"
        : "M16 3 19 14 29 19 19 20 16 29 13 20 3 19 13 14Z";
}
