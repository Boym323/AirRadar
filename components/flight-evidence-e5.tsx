"use client";

import { useState } from "react";
import { t, formatDateTime, formatNumber } from "@/lib/i18n";
import type { FlightEvidenceE5 } from "@/lib/predictive-intelligence/flight-evidence-e5";

const translations = {
  cs: {
    title: "Ověření predikcí tohoto letu",
    subtitle: "Historická predikce oproti později potvrzenému výsledku; dostupné pouze přihlášenému administrátorovi.",
    open: "Načíst ověřené výsledky",
    loading: "Načítání důkazů…",
    unauthorized: "Audit je dostupný pouze v administrátorském režimu.",
    failed: "Podklady nejsou nyní dostupné.",
    empty: "Pro tento let nemáme uloženou prospektivní predikci.",
    incomplete: "Výsledek je neúplný kvůli omezení rozsahu dotazu.",
    predicted: "Predikce",
    actual: "Ověřený výsledek",
    gap: "Bez nezávislého potvrzení",
    error: "Absolutní chyba",
    match: "Shoda dráhy",
    yes: "Ano",
    no: "Ne",
    disclaimer: "Neověřené události nepovažujeme za chybu predikce. Audit nemění veřejné predikční brány.",
  },
  en: {
    title: "Prediction evidence for this flight",
    subtitle: "Archived prediction versus later confirmed outcome; available only to authenticated administrators.",
    open: "Load verified outcomes",
    loading: "Loading evidence…",
    unauthorized: "This audit is available only in administrator mode.",
    failed: "Evidence is currently unavailable.",
    empty: "No prospective prediction is saved for this flight.",
    incomplete: "Result is incomplete due to bounded query limits.",
    predicted: "Prediction",
    actual: "Verified outcome",
    gap: "Independent truth missing",
    error: "Absolute error",
    match: "Runway match",
    yes: "Yes",
    no: "No",
    disclaimer: "Unverified events are not scored as prediction mistakes. The audit does not change public prediction gates.",
  },
} as const;

export function FlightEvidenceE5Panel({ flightId }: { flightId: number }) {
  const [status, setStatus] = useState<"idle"|"loading"|"loaded"|"unauthorized"|"failed">("idle");
  const [report, setReport] = useState<FlightEvidenceE5 | null>(null);
  const copy = t.locale.startsWith("en") ? translations.en : translations.cs;
  const load = async () => {
    if (status === "loading") return;
    setStatus("loading");
    try {
      const response = await fetch(`/api/admin/flights/${flightId}/evidence`, {
        cache: "no-store", credentials: "same-origin",
      });
      if (response.status === 401) { setStatus("unauthorized"); return; }
      if (!response.ok) { setStatus("failed"); return; }
      const result = await response.json() as FlightEvidenceE5;
      if (result.version !== "flight-evidence-e5" || result.flightId !== flightId) {
        setStatus("failed"); return;
      }
      setReport(result);
      setStatus("loaded");
    } catch { setStatus("failed"); }
  };
  return <section className="history-card flight-detail-card" data-testid="flight-evidence-e5">
    <h2>{copy.title}</h2>
    <p className="history-note">{copy.subtitle}</p>
    {status === "idle" || status === "loading" ? <button type="button" disabled={status === "loading"} onClick={() => { void load(); }}>
      {status === "loading" ? copy.loading : copy.open}
    </button> : null}
    {status === "unauthorized" ? <p className="history-note">{copy.unauthorized}</p> : null}
    {status === "failed" ? <p className="history-note">{copy.failed}</p> : null}
    {report && status === "loaded" ? <>
      {!report.complete ? <p className="history-note">{copy.incomplete}</p> : null}
      {report.items.length === 0 ? <p className="history-note">{copy.empty}</p> : <ul>
        {report.items.map((item) => <li key={item.capability}>
          <strong>{item.capability} · {formatDateTime(item.predictedAt)}</strong>
          <p>{copy.predicted}: {item.prediction ?? "—"}</p>
          <p>{copy.actual}: {item.outcome ?? copy.gap}</p>
          {item.status === "SCORED" ? <p>{item.capability === "ETA"
            ? `${copy.error}: ${formatNumber(item.absoluteErrorSeconds ?? 0, 0)} s`
            : `${copy.match}: ${item.runwayExactEnd ? copy.yes : copy.no}`}</p> : null}
        </li>)}
      </ul>}
    </> : null}
    <p className="history-note">{copy.disclaimer}</p>
  </section>;
}
