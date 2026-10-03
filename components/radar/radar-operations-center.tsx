"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatTime, t } from "@/lib/i18n";
import {
  attentionOperationsCount,
  OPERATIONS_CENTER_WINDOW_MS,
  operationsEventTone,
  recentOperationsEvents,
} from "@/lib/intelligence/operations-center";
import type { FlightEventType } from "@/lib/intelligence/types";
import { IconButton, Panel, StatusBadge, UiIcon } from "@/components/ui-primitives";
import { useIntelligenceStream } from "@/components/use-intelligence-stream";
import styles from "./radar-operations-center.module.css";

const REFRESH_INTERVAL_MS = 60_000;

export function RadarOperationsCenter() {
  const events = useIntelligenceStream();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), REFRESH_INTERVAL_MS);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const recentEvents = useMemo(
    () => recentOperationsEvents(events, now),
    [events, now],
  );
  const attentionCount = attentionOperationsCount(recentEvents);
  const evidenceTypes = t.intelligence.evidenceTypes as Record<string, string>;

  return (
    <>
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ""}`}
        aria-expanded={open}
        aria-controls="radar-operations-center"
        aria-label={open ? t.intelligence.operationsClose : t.intelligence.operationsOpen}
        data-testid="operations-center-trigger"
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.liveDot} aria-hidden="true" />
        <span>{t.intelligence.operationsNow}</span>
        <strong>{recentEvents.length}</strong>
      </button>

      {open ? (
        <Panel
          id="radar-operations-center"
          className={styles.panel}
          aria-labelledby="radar-operations-center-title"
          data-testid="operations-center-panel"
        >
          <header className={styles.header}>
            <div>
              <span className={styles.kicker}>{t.intelligence.operationsNow}</span>
              <h2 id="radar-operations-center-title">{t.intelligence.operationsCenter}</h2>
              <p>{t.intelligence.operationsRecent}</p>
            </div>
            <div className={styles.headerActions}>
              <StatusBadge variant={attentionCount > 0 ? "warning" : "live"}>
                {attentionCount > 0
                  ? t.intelligence.operationsAttention(attentionCount)
                  : t.intelligence.operationsQuiet}
              </StatusBadge>
              <IconButton
                className={styles.close}
                onClick={() => setOpen(false)}
                aria-label={t.intelligence.operationsClose}
              >
                <UiIcon name="close" />
              </IconButton>
            </div>
          </header>

          {recentEvents.length > 0 ? (
            <div className={styles.events} role="feed" aria-label={t.intelligence.operationsRecent}>
              {recentEvents.map((event) => {
                const tone = operationsEventTone(event.type);
                const location = [
                  event.airportIcao,
                  event.runway ? `RWY ${event.runway}` : null,
                  event.sectorId,
                ].filter(Boolean).join(" · ") || t.intelligence.noLocation;
                const firstEvidence = event.evidence[0]
                  ? evidenceTypes[event.evidence[0]] ?? event.evidence[0]
                  : null;

                return (
                  <Link
                    className={`${styles.event} ${styles[tone]}`}
                    href={`/aircraft/${event.icaoHex}`}
                    key={event.eventKey}
                  >
                    <span className={styles.eventMarker} aria-hidden="true" />
                    <span className={styles.eventBody}>
                      <span className={styles.eventMeta}>
                        <time dateTime={event.occurredAt}>{formatTime(event.occurredAt)}</time>
                        <span>{t.intelligence.confidence[event.confidenceLevel]}</span>
                      </span>
                      <strong>{t.intelligence.types[event.type as FlightEventType]}</strong>
                      <span className={styles.aircraft}>
                        {event.callsign || event.registration || event.icaoHex}
                        <small>{location}</small>
                      </span>
                      {firstEvidence ? <small className={styles.evidence}>{firstEvidence}</small> : null}
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className={styles.empty}>
              <strong>{t.intelligence.operationsNoRecent}</strong>
              <span>{t.intelligence.emptyHint}</span>
            </div>
          )}

          <footer className={styles.footer}>
            <span>{t.intelligence.operationsWindow(Math.round(OPERATIONS_CENTER_WINDOW_MS / 60_000))}</span>
            <Link href="/intelligence">{t.intelligence.operationsViewAll}</Link>
          </footer>
        </Panel>
      ) : null}
    </>
  );
}
