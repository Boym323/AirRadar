"use client";

import { useState } from "react";
import type { WindModelComparison } from "@/lib/server/aladin-wind";
import type { WindLevelHpa } from "@/lib/server/wind-aloft";
import { WIND_LEVELS_HPA } from "@/lib/server/wind-aloft";
import { t } from "@/lib/i18n";

export function AladinWindComparison() {
  const cs = t.locale.startsWith("cs");
  const [level, setLevel] = useState<WindLevelHpa>(300);
  const [value, setValue] = useState<(WindModelComparison & { enabled: boolean }) | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(): Promise<void> {
    setLoading(true);
    setValue(null);
    try {
      const response = await fetch("/api/weather/wind/compare?level=" + level, { cache: "no-store" });
      if (!response.ok) throw new Error("Weather comparison unavailable");
      setValue(await response.json() as WindModelComparison & { enabled: boolean });
    } catch {
      setValue({ enabled: false, available: false } as WindModelComparison & { enabled: boolean });
    } finally { setLoading(false); }
  }

  return <section aria-label="ICON-EU / ALADIN" style={{ marginBlock: "1rem" }}>
    <details>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>{cs ? "Porovnání modelů větru · ICON-EU / ALADIN" : "Wind model comparison · ICON-EU / ALADIN"}</summary>
      <div style={{ marginBlock: "0.75rem" }}>
        <label>{cs ? "Tlaková hladina " : "Pressure level "}
          <select value={level} onChange={(event) => { setLevel(Number(event.target.value) as WindLevelHpa); setValue(null); }}>
            {WIND_LEVELS_HPA.map((item) => <option key={item} value={item}>{item} hPa</option>)}
          </select>
        </label>{" "}
        <button type="button" disabled={loading} onClick={() => { void load(); }}>{loading ? (cs ? "Načítání…" : "Loading…") : (cs ? "Porovnat modely" : "Compare models")}</button>
        {value && (!value.enabled || !value.available)
          ? <p>{cs ? "Porovnání není dostupné nebo není aktivované." : "Comparison disabled or unavailable."}</p>
          : value && <div>
            <p>ALADIN CE 2 km: <strong>{value.aladin ? value.aladin.speedKt.toFixed(1) + " kt" : "—"}</strong>
              {" / "}{value.aladin ? value.aladin.directionDeg.toFixed(0) + "°" : "—"}</p>
            <p>ICON-EU: <strong>{value.icon ? value.icon.speedKt.toFixed(1) + " kt" : "—"}</strong>
              {" / "}{value.icon ? value.icon.directionDeg.toFixed(0) + "°" : "—"}</p>
            <p>{cs ? "Rozdíl rychlosti" : "Speed difference"}: {value.speedDifferenceKt ?? "—"} kt · {cs ? "Rozdíl směru" : "Direction difference"}: {value.directionDifferenceDeg ?? "—"}°</p>
            <p>{value.reason ? (cs ? "Dostupné údaje nelze přímo porovnat (" : "Model comparison limited (") + value.reason + ")" : ""}
              {value.stale ? (cs ? " · Starší snímek" : " · Stale snapshot") : ""}</p>
          </div>}
        <p>{cs ? "Pouze modelové hodnoty v okolí přijímače. Nejde o měření z letadla ani hodnocení přesnosti modelů." : "Receiver-area model forecasts only. Not an aircraft measurement or model skill rating."}</p>
        <a href="https://open-meteo.com/en/docs/chmi-api" target="_blank" rel="noopener noreferrer">ČHMÚ ALADIN / Open-Meteo</a>
      </div>
    </details>
  </section>;
}
