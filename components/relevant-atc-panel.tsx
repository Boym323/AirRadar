"use client";

import { useState } from "react";
import { aircraftCount, formatAtcFrequency, formatAtcService, formatNumber, t } from "@/lib/i18n";
import type { AtcFrequencySummary } from "@/lib/atc/types";
import { displayedRelevantAtcFrequencies, MAX_DISPLAYED_RELEVANT_ATC_FREQUENCIES, relevantAtcFrequencyKey, uniqueRelevantAtcFrequencies } from "@/lib/atc/relevant-frequencies";

interface RelevantAtcPanelProps {
  summaries?: ReadonlyArray<AtcFrequencySummary>;
  onOpen?: () => void;
  expanded?: boolean;
}

export function RelevantAtcPanel({ summaries, onOpen, expanded = true }: RelevantAtcPanelProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  // Keep the client compatible with a rolling deployment where an older
  // server can still emit a snapshot without this optional field.
  const availableSummaries = uniqueRelevantAtcFrequencies(summaries ?? []);
  const first = availableSummaries[0];
  const selected = availableSummaries.find((summary) => relevantAtcFrequencyKey(summary) === selectedKey) ?? null;
  const displayed = displayedRelevantAtcFrequencies(availableSummaries, showAll);

  function select(summary: AtcFrequencySummary): void {
    setSelectedKey(relevantAtcFrequencyKey(summary));
    onOpen?.();
  }

  return (
    <section className="atc-relevance-panel" aria-label={t.atc.relevantTitle}>
      <div className="atc-panel-mobile-summary">
        <div className="atc-panel-kicker">{t.atc.relevantTitle}</div>
        {first ? <button type="button" className="atc-mobile-entry" aria-expanded={expanded} aria-controls="atc-panel-content" onClick={() => select(first)}>
          <strong>{formatAtcFrequency(first.frequencyMhz)} · {first.callsign ?? formatAtcService(first.service)}</strong>
          {availableSummaries.length > 1 && <span>{t.atc.relevantMoreFrequencies(formatNumber(availableSummaries.length - 1))}</span>}
        </button> : <div className="atc-panel-empty">{t.atc.relevantEmpty}</div>}
      </div>

      <div id="atc-panel-content" className="atc-panel-content">
        <div className="atc-panel-heading">
          <div>
            <h2>{t.atc.relevantTitle}</h2>
            <p>{t.atc.relevantDescription}</p>
          </div>
          <span className="atc-panel-live">{t.atc.relevantLive}</span>
        </div>
        <p className="atc-panel-disclaimer">{t.atc.relevantDisclaimer}</p>

        {availableSummaries.length === 0 ? <div className="atc-panel-empty">{t.atc.relevantEmpty}</div> : <>
          <div className="atc-frequency-list">
            {displayed.map((summary) => {
              const key = relevantAtcFrequencyKey(summary);
              return <button
                type="button"
                key={key}
                className={`atc-frequency-entry ${selectedKey === key ? "selected" : ""}`}
                aria-pressed={selectedKey === key}
                onClick={() => select(summary)}
              >
                <span className="atc-frequency-main">
                  <strong>{formatAtcFrequency(summary.frequencyMhz)}</strong>
                  <span>{summary.callsign ?? t.atc.defaultService}</span>
                </span>
                <span className="atc-frequency-meta">
                  <span>{aircraftCount(summary.aircraftCount)}</span>
                  <span>{formatAtcService(summary.service)}</span>
                </span>
              </button>;
            })}
          </div>
          {availableSummaries.length > MAX_DISPLAYED_RELEVANT_ATC_FREQUENCIES && <button type="button" className="atc-show-all" onClick={() => setShowAll((value) => !value)}>
            {showAll ? t.atc.relevantHideAll : t.atc.relevantShowAll}
          </button>}
        </>}

        {selected && <div className="atc-frequency-detail">
          <div className="atc-detail-heading">
            <div>
              <strong>{formatAtcFrequency(selected.frequencyMhz)}</strong>
              <span>{selected.callsign ?? t.atc.defaultService}</span>
            </div>
            <span className="atc-detail-label">{t.atc.relevantDetails}</span>
          </div>
          <div className="atc-detail-copy">{t.atc.relevantAircraft(aircraftCount(selected.aircraftCount))}</div>
          <div className="atc-detail-grid">
            <div><span>{t.atc.relevantSectors}</span><strong>{selected.sector}</strong></div>
            <div><span>{t.atc.sectorService}</span><strong>{formatAtcService(selected.service)}</strong></div>
            {selected.airspaceType && <div><span>{t.atc.relevantType}</span><strong>{selected.airspaceType}</strong></div>}
            <div><span>{t.atc.relevantConfidence}</span><strong>{t.atc.relevantConfidenceValues[selected.confidence.level]}</strong></div>
            <div><span>{t.atc.source}</span><strong>{selected.source ?? t.common.unavailable}</strong></div>
          </div>
          {selected.aircraftLabels.length > 0 && <div className="atc-aircraft-labels">
            {selected.aircraftLabels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}
            {selected.additionalAircraftCount > 0 && <span>{t.atc.relevantMoreAircraft(formatNumber(selected.additionalAircraftCount))}</span>}
          </div>}
        </div>}
      </div>
    </section>
  );
}
