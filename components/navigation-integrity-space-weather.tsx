"use client";

import { useEffect, useState } from "react";
import { t, formatDateTime } from "@/lib/i18n";
import { MetricCard, MetricStrip, Panel, SectionHeader } from "@/components/ui-primitives";
import type { SpaceWeatherSnapshot } from "@/lib/server/space-weather";

/** NOAA Kp is displayed as independent contextual evidence, never passed to the anomaly engine. */
export function NavigationIntegritySpaceWeather() {
  const [snapshot, setSnapshot] = useState<SpaceWeatherSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/navigation-integrity/space-weather", { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<SpaceWeatherSnapshot> : null)
      .then((data) => { if (!controller.signal.aborted) { setSnapshot(data); setLoading(false); } })
      .catch(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  if (snapshot?.enabled === false) return null;
  const cs = t.locale.startsWith("cs");
  const words = cs ? {
    title: "Kosmické počasí · NOAA",
    subtitle: "Globální geomagnetický kontext. Nejde o měření nebo důkaz lokálního rušení GNSS.",
    kp: "Planetární index Kp", max: "Maximum za 24 h", scale: "Geomagnetická úroveň",
    observed: "Pozorováno", stale: "Data jsou zastaralá", unavailable: "Údaje NOAA momentálně nejsou dostupné.",
    note: "Kp nemůže potvrdit rušení či podvržení GNSS, závadu navigace ani příčinu anomálie AirRadaru.",
    source: "Zdroj: NOAA Space Weather Prediction Center",
  } : {
    title: "Space weather · NOAA",
    subtitle: "Global geomagnetic context only. Not a measurement or proof of local GNSS interference.",
    kp: "Planetary Kp index", max: "24h maximum", scale: "Geomagnetic level",
    observed: "Observed", stale: "Data are stale", unavailable: "NOAA data is currently unavailable.",
    note: "Kp cannot confirm GNSS jamming, spoofing, navigation failures, or the cause of AirRadar anomalies.",
    source: "Source: NOAA Space Weather Prediction Center",
  };
  const known = snapshot?.available && snapshot.latest;
  return (
    <Panel>
      <SectionHeader title={words.title} description={words.subtitle} />
      {known ? (
        <>
          <MetricStrip>
            <MetricCard label={words.kp} value={snapshot.latest!.kp.toFixed(2)} />
            <MetricCard label={words.max} value={snapshot.maximum24h?.toFixed(2) ?? "—"} />
            <MetricCard label={words.scale} value={snapshot.geomagneticScale} />
          </MetricStrip>
          <p>{words.observed}: {formatDateTime(snapshot.latest!.observedAt, t)}{snapshot.stale ? " · " + words.stale : ""}</p>
        </>
      ) : <p>{loading ? t.common.loading : words.unavailable}</p>}
      <p>{words.note} <a href="https://www.swpc.noaa.gov/products/planetary-k-index" target="_blank" rel="noopener noreferrer">{words.source}</a></p>
    </Panel>
  );
}
