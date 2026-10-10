"use client";

import { Button } from "@/components/ui-primitives";
import { t } from "@/lib/i18n";

export function RadarPresentationControls({
  active, paused, scene, onToggle, onTogglePause,
}: {
  active: boolean;
  paused: boolean;
  scene: string | null;
  onToggle: () => void;
  onTogglePause: () => void;
}) {
  const cs = t.locale.startsWith("cs");
  return <div data-testid="radar-presentation-v6-g" className="radar-presentation-controls" style={{ pointerEvents: "auto", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
    <Button variant="ghost" size="compact" className="map-control" aria-label={active ? (cs ? "Ukončit prezentaci" : "Exit presentation") : (cs ? "Prezentace" : "Presentation")} aria-pressed={active} onClick={onToggle}>
      {active ? (cs ? "Ukončit prezentaci" : "Exit presentation") : (cs ? "Prezentace" : "Presentation")}
    </Button>
    {active && <>
      <Button variant="ghost" size="compact" className="map-control" aria-label={paused ? (cs ? "Pokračovat" : "Resume") : (cs ? "Pozastavit" : "Pause")} aria-pressed={paused} onClick={onTogglePause}>
        {paused ? (cs ? "Pokračovat" : "Resume") : (cs ? "Pozastavit" : "Pause")}
      </Button>
      <span aria-live="off" className="map-overlay-card" style={{ fontSize: 12 }}>{scene ?? (cs ? "Živý provoz" : "Live traffic")} · LOCAL</span>
    </>}
  </div>;
}
