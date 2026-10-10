"use client";

import { Button, UiIcon } from "@/components/ui-primitives";
import { t } from "@/lib/i18n";
import { requestCommandPaletteOpen } from "@/lib/search/command-palette";
import type { RadarWeatherViewState } from "@/lib/radar/weather-layer-presentation";

export interface RadarQuickActionsProps {
  weatherEnabled: boolean;
  weatherState: RadarWeatherViewState;
  atcEnabled: boolean;
  activeFilterCount: number;
  filtersDisabled: boolean;
  selectionOpen: boolean;
  onToggleWeather: () => void;
  onToggleAtc: () => void;
  onOpenFilters: () => void;
}

/** Immediate map actions; reuses the existing radar state and command palette. */
export function RadarQuickActions({
  weatherEnabled, weatherState, atcEnabled, activeFilterCount, filtersDisabled, selectionOpen,
  onToggleWeather, onToggleAtc, onOpenFilters,
}: RadarQuickActionsProps) {
  const weatherStatusLabel = weatherState === "loading"
    ? t.radarQuickActions.weatherLoading
    : weatherState === "stale"
      ? t.radarQuickActions.weatherStale
      : weatherState === "unavailable"
        ? t.radarQuickActions.weatherUnavailable
        : null;
  return <div
    className="radar-quick-actions"
    role="group"
    aria-label={t.radarQuickActions.title}
    data-testid="radar-quick-actions"
    data-selection-open={selectionOpen ? "true" : "false"}
  >
    <Button variant="ghost" size="compact" className="radar-quick-action" onClick={requestCommandPaletteOpen} data-testid="radar-quick-search">
      <UiIcon name="search" /><span>{t.radarQuickActions.search}</span>
    </Button>
    <Button variant="ghost" size="compact" className="radar-quick-action" aria-pressed={weatherEnabled} aria-label={weatherStatusLabel ? `${t.radarQuickActions.weather} · ${weatherStatusLabel}` : t.radarQuickActions.weather} data-weather-state={weatherState} onClick={onToggleWeather} data-testid="radar-quick-weather">
      <UiIcon name="radar" /><span>{t.radarQuickActions.weather}</span>
      {weatherEnabled && weatherStatusLabel && <small className="radar-quick-weather-state">{weatherStatusLabel}</small>}
    </Button>
    <Button variant="ghost" size="compact" className="radar-quick-action" aria-pressed={atcEnabled} onClick={onToggleAtc} data-testid="radar-quick-atc">
      <UiIcon name="atc" /><span>{t.radarQuickActions.atc}</span>
    </Button>
    <Button variant="ghost" size="compact" className="radar-quick-action" disabled={filtersDisabled} onClick={onOpenFilters} data-testid="radar-quick-filters" aria-label={activeFilterCount ? `${t.radarQuickActions.filters} · ${t.radarQuickActions.activeFilters(activeFilterCount)}` : t.radarQuickActions.filters}>
      <UiIcon name="layers" /><span>{t.radarQuickActions.filters}{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}</span>
    </Button>
  </div>;
}
