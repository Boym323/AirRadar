"use client";

import { Button, UiIcon } from "@/components/ui-primitives";
import { t } from "@/lib/i18n";
import { requestCommandPaletteOpen } from "@/lib/search/command-palette";

export interface RadarQuickActionsProps {
  weatherEnabled: boolean;
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
  weatherEnabled, atcEnabled, activeFilterCount, filtersDisabled, selectionOpen,
  onToggleWeather, onToggleAtc, onOpenFilters,
}: RadarQuickActionsProps) {
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
    <Button variant="ghost" size="compact" className="radar-quick-action" aria-pressed={weatherEnabled} onClick={onToggleWeather} data-testid="radar-quick-weather">
      <UiIcon name="radar" /><span>{t.radarQuickActions.weather}</span>
    </Button>
    <Button variant="ghost" size="compact" className="radar-quick-action" aria-pressed={atcEnabled} onClick={onToggleAtc} data-testid="radar-quick-atc">
      <UiIcon name="atc" /><span>{t.radarQuickActions.atc}</span>
    </Button>
    <Button variant="ghost" size="compact" className="radar-quick-action" disabled={filtersDisabled} onClick={onOpenFilters} data-testid="radar-quick-filters" aria-label={activeFilterCount ? `${t.radarQuickActions.filters} · ${t.radarQuickActions.activeFilters(activeFilterCount)}` : t.radarQuickActions.filters}>
      <UiIcon name="layers" /><span>{t.radarQuickActions.filters}{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}</span>
    </Button>
  </div>;
}
