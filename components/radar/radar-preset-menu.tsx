"use client";

import { useState } from "react";
import { MapControl, UiIcon } from "@/components/ui-primitives";
import type { RadarPreset } from "@/lib/radar/presets";
import { t } from "@/lib/i18n";
import styles from "./radar-preset-menu.module.css";

interface RadarPresetMenuProps {
  presets: readonly RadarPreset[];
  onSave: (name: string) => void;
  onApply: (preset: RadarPreset) => void;
  onDelete: (id: string) => void;
}

export function RadarPresetMenu({ presets, onSave, onApply, onDelete }: RadarPresetMenuProps) {
  const cs = t.locale.startsWith("cs");
  const copy = cs ? {
    title: "Presety radaru",
    name: "Název presetu",
    placeholder: "Např. PRG přílety",
    save: "Uložit aktuální pohled",
    empty: "Zatím nemáte uložený žádný preset.",
    apply: "Použít",
    remove: "Smazat",
    local: "Uloženo pouze v tomto prohlížeči.",
  } : {
    title: "Radar presets",
    name: "Preset name",
    placeholder: "e.g. PRG arrivals",
    save: "Save current view",
    empty: "No saved presets yet.",
    apply: "Apply",
    remove: "Delete",
    local: "Stored only in this browser.",
  };
  const [name, setName] = useState("");

  return <details className={styles.root} data-testid="radar-presets-v1">
    <MapControl as="summary" aria-label={copy.title} title={copy.title}>
      <UiIcon name="system" />
      <span className="map-control-label">{copy.title}</span>
    </MapControl>
    <div className={styles.menu}>
      <strong>{copy.title}</strong>
      <small>{copy.local}</small>
      <label className={styles.create}>
        <span>{copy.name}</span>
        <span className={styles.createRow}>
          <input
            value={name}
            maxLength={60}
            placeholder={copy.placeholder}
            onChange={(event) => setName(event.target.value)}
          />
          <button type="button" disabled={!name.trim()} onClick={() => {
            onSave(name);
            setName("");
          }}>{copy.save}</button>
        </span>
      </label>
      {presets.length ? <ol className={styles.list}>
        {presets.map((preset) => <li key={preset.id}>
          <button type="button" className={styles.apply} onClick={() => onApply(preset)}>
            <strong>{preset.name}</strong>
            <small>{preset.coverage.toUpperCase()} · z{preset.camera.zoom.toFixed(1)}</small>
          </button>
          <button type="button" className={styles.delete} aria-label={copy.remove + " " + preset.name} title={copy.remove} onClick={() => onDelete(preset.id)}>×</button>
        </li>)}
      </ol> : <p className={styles.empty}>{copy.empty}</p>}
    </div>
  </details>;
}
