"use client";

import type { AircraftView } from "@/lib/aircraft/types";
import { formatAltitude, formatSpeed, t } from "@/lib/i18n";
import styles from "./radar-multi-aircraft.module.css";

interface RadarMultiAircraftProps {
  active: boolean;
  hexes: readonly string[];
  aircraft: readonly AircraftView[];
  limit: number;
  onToggle: () => void;
  onRemove: (hex: string) => void;
  onClear: () => void;
  onSelect: (hex: string) => void;
  onFit: () => void;
}

export function RadarMultiAircraft({ active, hexes, aircraft, limit, onToggle, onRemove, onClear, onSelect, onFit }: RadarMultiAircraftProps) {
  const english = t.locale.startsWith("en");
  const byHex = new Map(aircraft.map((entry) => [entry.icaoHex.toUpperCase(), entry]));
  return <section className={styles.root} data-testid="radar-multi-aircraft" data-active={active ? "true" : "false"}>
    <button type="button" className={styles.toggle} onClick={onToggle} aria-expanded={active} aria-controls="radar-multi-aircraft-panel" aria-pressed={active}>
      {english ? "Multi-view" : "Více letadel"} {active ? `· ${hexes.length}/${limit}` : ""}
    </button>
    {active && <div className={styles.panel} id="radar-multi-aircraft-panel" aria-label={english ? "Tracked aircraft" : "Sledovaná letadla"}>
      <div className={styles.heading}>
        <strong>{english ? "Tracking together" : "Současně sledovaná"}</strong>
        <div className={styles.actions}>
          <button type="button" onClick={onFit} disabled={!hexes.length}>{english ? "Fit" : "Zobrazit vše"}</button>
          <button type="button" onClick={onClear}>{english ? "Close" : "Zavřít"}</button>
        </div>
      </div>
      {hexes.length === 0 && <p className={styles.hint}>{english ? "Tap aircraft on the map or in the traffic list to pin them (up to 10)." : "Kliknutím na letadlo v mapě nebo seznamu jej připneš (max. 10)."}</p>}
      {hexes.length > 0 && <ol className={styles.list}>
        {hexes.map((hex) => {
          const item = byHex.get(hex);
          return <li key={hex} className={styles.row}>
            <button type="button" onClick={() => onSelect(hex)} className={styles.aircraft} title={english ? "Open aircraft details" : "Otevřít detail letadla"}>
              <strong>{item?.callsign || item?.registration || hex}</strong>
              <span>{item ? `${item.aircraftType || item.enrichment?.metadata?.icaoTypeCode || "—"} · ${formatAltitude(item.altitude)} · ${formatSpeed(item.groundSpeed)}` : english ? "Out of coverage" : "Mimo pokrytí"}</span>
            </button>
            <button type="button" className={styles.remove} aria-label={english ? `Remove ${hex}` : `Odebrat ${hex}`} onClick={() => onRemove(hex)}>×</button>
          </li>;
        })}
      </ol>}
      {hexes.length >= limit && <p className={styles.hint}>{english ? "Maximum of 10 aircraft reached." : "Dosažen limit 10 letadel."}</p>}
      <small className={styles.hint}>{english ? "Local browser selection · live data · dashed trails reflect the selected LOCAL/NETWORK source" : "Výběr pouze v prohlížeči · živá data · přerušované stopy odpovídají zdroji LOCAL/NETWORK"}</small>
    </div>}
  </section>;
}
