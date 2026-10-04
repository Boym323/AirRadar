"use client";

import { UiIcon } from "@/components/ui-primitives";
import { t } from "@/lib/i18n";
import { requestCommandPaletteOpen } from "@/lib/search/command-palette";

export function GlobalSearch() {
  return (
    <div className="global-search">
      <button
        type="button"
        className="global-search-input global-search-trigger"
        onClick={requestCommandPaletteOpen}
        aria-label={t.commandSearch.openPalette}
        aria-haspopup="dialog"
        data-testid="command-palette-trigger"
      >
        <span className="global-search-icon" aria-hidden="true"><UiIcon name="search" /></span>
        <span className="global-search-trigger-label">{t.search.globalPlaceholder}</span>
        <kbd className="global-search-shortcut">⌘K</kbd>
      </button>
    </div>
  );
}
