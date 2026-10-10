"use client";

import { useEffect, useState } from "react";
import type { RxwHubPublicSnapshot, RxwHubConnectionState } from "@/lib/aircraft/rxw-communications";
import { t } from "@/lib/i18n";
import styles from "@/components/aircraft-communications.module.css";

function stateLabel(state: RxwHubConnectionState, cs: boolean): string {
  if (state === "connected") return cs ? "Připojeno" : "Connected";
  if (state === "connecting") return cs ? "Připojování" : "Connecting";
  if (state === "disabled") return cs ? "Vypnuto" : "Disabled";
  if (state === "stopped") return cs ? "Zastaveno" : "Stopped";
  return cs ? "Zdroj nedostupný" : "Source unavailable";
}

/**
 * Displays safe, technical metadata only. Full ACARS/CPDLC message bodies are
 * intentionally not served by the AirRadar API.
 */
export function AircraftCommunications({ icaoHex, callsign }: { icaoHex: string; callsign?: string | null }) {
  const [snapshot, setSnapshot] = useState<RxwHubPublicSnapshot | null>(null);
  const cs = t.locale.startsWith("cs");

  useEffect(() => {
    if (!/^[0-9a-f]{6}$/i.test(icaoHex)) return;
    let active = true;
    let inFlight = false;
    const controller = new AbortController();
    const refresh = () => {
      if (inFlight || !active) return;
      inFlight = true;
      const matchingFlight = typeof callsign === "string" && /^[A-Z0-9]{2,10}$/i.test(callsign.trim())
        ? "?flight=" + encodeURIComponent(callsign.trim().toUpperCase()) : "";
      void fetch("/api/aircraft/" + encodeURIComponent(icaoHex) + "/communications" + matchingFlight, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("Communications unavailable");
          return await response.json() as RxwHubPublicSnapshot;
        })
        .then((data) => { if (active) setSnapshot(data); })
        .catch(() => {
          if (active) setSnapshot((previous) => previous?.enabled
            ? { ...previous, connection: "error" }
            : null);
        })
        .finally(() => { inFlight = false; });
    };
    setSnapshot(null);
    refresh();
    const timer = setInterval(refresh, 30_000);
    return () => { active = false; clearInterval(timer); controller.abort(); };
  }, [icaoHex, callsign]);

  if (!snapshot?.enabled) return null;
  const lastSeen = snapshot.lastReceivedAt
    ? new Date(snapshot.lastReceivedAt).toLocaleString(t.locale)
    : null;

  return <section id="aircraft-communications" className={"aircraft-card " + styles.section} aria-label={cs ? "Datová komunikace letadla" : "Aircraft data communications"}>
    <div className={styles.heading}>
      <div>
        <h2>{cs ? "Datová komunikace" : "Data communications"}</h2>
        <p>{cs ? "ACARS / VDL2 · technická metadata" : "ACARS / VDL2 · technical metadata"}</p>
      </div>
      <span className={styles.status} data-state={snapshot.connection}>{stateLabel(snapshot.connection, cs)}</span>
    </div>

    {snapshot.routeHint && <div className={styles.routeHint}>
      <div className={styles.routeLabel}>{cs ? "Trasa hlášená přes ACARS (neověřeno)" : "ACARS reported route (unverified)"}</div>
      <div className={styles.routeAirports}><strong>{snapshot.routeHint.origin}</strong><span aria-hidden="true">→</span><strong>{snapshot.routeHint.destination}</strong></div>
      <div className={styles.meta}>
        {snapshot.routeHint.etaUtc && <span>{cs ? "Hlášené ETA (UTC)" : "Reported ETA (UTC)"}: {snapshot.routeHint.etaUtc}</span>}
        <span>{cs ? "Let" : "Flight"}: {snapshot.routeHint.flight}</span>
        <span>{cs ? "Zachyceno" : "Observed"}: {new Date(snapshot.routeHint.observedAt).toLocaleString(t.locale)}</span>
      </div>
      <p className={styles.note}>{cs ? "Doplňková indikace ze strukturovaných polí. Nemění ověřenou trasu ani údaje FlightAware." : "Supplementary structured-field evidence. Does not override verified routes or FlightAware data."}</p>
    </div>}

    {snapshot.messages.length ? (
      <div className={styles.list}>
        {snapshot.messages.map((item) => (
          <div key={item.stationId + ":" + item.uid} className={styles.row}>
            <div><strong>{item.protocol}</strong><time dateTime={item.timestamp}>{new Date(item.timestamp).toLocaleString(t.locale)}</time></div>
            <div className={styles.meta}>
              <span>{cs ? "Stanice" : "Station"}: {item.stationId}</span>
              {item.frequencyMhz !== null && <span>{item.frequencyMhz} MHz</span>}
              {item.label && <span>{cs ? "Kód" : "Label"}: {item.label}</span>}
              {item.reportedRoute && <span>{cs ? "Hlášená trasa" : "Reported route"}: {item.reportedRoute.origin} → {item.reportedRoute.destination}{item.reportedRoute.etaUtc ? " · ETA " + item.reportedRoute.etaUtc : ""}</span>}
            </div>
          </div>
        ))}
      </div>
    ) : <p className={styles.empty}>{snapshot.connection === "connected"
      ? (cs ? "Pro toto letadlo zatím nemáme zachycené zprávy." : "No received messages for this aircraft yet.")
      : (cs ? "Příjem externího zdroje není aktuálně dostupný." : "The external feed is not currently available.")}</p>}

    <p className={styles.note}>
      {cs ? "Zprávy z externího zdroje; žádný text komunikace nezveřejňujeme." : "External reception data; message contents are not published."}
      {lastSeen && " · " + (cs ? "Poslední příjem: " : "Last received: ") + lastSeen}
      {" · "}<a href="https://hub.rxw.cz/about" target="_blank" rel="noopener noreferrer">RXW Hub ↗</a>
    </p>
  </section>;
}
