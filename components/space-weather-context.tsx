"use client";

import { useState } from "react";
import type { SpaceWeatherContext } from "@/lib/server/noaa-space-weather";
import { t } from "@/lib/i18n";

export function SpaceWeatherContextCard() {
  const cs = t.locale.startsWith("cs");
  const [context, setContext] = useState<(SpaceWeatherContext & { enabled: boolean }) | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(): Promise<void> {
    setLoading(true);
    try {
      const response = await fetch("/api/navigation-integrity/space-weather", { cache: "no-store" });
      if (!response.ok) throw new Error("Space Weather unavailable");
      setContext(await response.json() as SpaceWeatherContext & { enabled: boolean });
    } catch {
      setContext({ enabled: false, available: false } as SpaceWeatherContext & { enabled: boolean });
    } finally {
      setLoading(false);
    }
  }

  const status = context?.status === "storm" ? (cs ? "Geomagnetická bouře" : "Geomagnetic storm")
    : context?.status === "unsettled" ? (cs ? "Zvýšená aktivita" : "Elevated activity")
      : (cs ? "Klidnější geomagnetické podmínky" : "Quiet geomagnetic activity");

  return (
    <section aria-label="NOAA Space Weather" style={{ marginBlock: "1rem" }}>
      <details>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>{cs ? "Kosmické počasí · NOAA SWPC (nezávislý kontext)" : "Space Weather · NOAA SWPC (independent context)"}</summary>
        <div style={{ marginBlock: "0.75rem" }}>
          <button type="button" disabled={loading} onClick={() => { void load(); }}>
            {loading ? (cs ? "Načítání…" : "Loading…") : (cs ? "Načíst globální index Kp" : "Load global Kp index")}
          </button>
          {context && (!context.enabled || !context.available)
            ? <p>{cs ? "Kosmické počasí není aktivní nebo zdroj není dostupný." : "Space Weather disabled or unavailable."}</p>
            : context && <p>NOAA Kp: <strong>{context.kp?.toFixed(2) ?? "—"}</strong> · {status}
              {context.stale ? (cs ? " · Starší údaje" : " · Stale observation") : ""}
              <br />{cs ? "Čas měření (UTC): " : "Observed (UTC): "}{context.observedAt || "—"}
            </p>}
          <p>{cs
            ? "Planetární index Kp popisuje globální geomagnetickou aktivitu. Sám o sobě neprokazuje rušení či spoofing GNSS ani závadu navigace konkrétního letadla."
            : "Planetary Kp is global geomagnetic context, not evidence of GNSS jamming, spoofing or a navigation fault on any aircraft."}
          </p>
          <a href="https://www.swpc.noaa.gov/products/planetary-k-index" target="_blank" rel="noopener noreferrer">NOAA SWPC · Kp</a>
        </div>
      </details>
    </section>
  );
}
